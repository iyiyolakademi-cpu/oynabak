-- OynaBak e-postasiz personel oturumu. Anonymous Supabase Auth is required on staff devices.
-- Existing QR/menu/game/finance APIs are untouched. No shared password or raw PIN stored.
alter table public.ob_adisyon_settings
 add column if not exists staff_pin_enabled boolean not null default false;

create table if not exists public.ob_staff_pairing_invites(
 id uuid primary key default gen_random_uuid(),
 venue_id text not null,
 code_hash text not null unique,
 staff_role text not null check(staff_role in ('waiter','kitchen','bar','manager')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 used_by uuid references auth.users(id),
 used_at timestamptz,
 created_by uuid not null
);
create index if not exists ob_staff_invites_venue on public.ob_staff_pairing_invites(venue_id,created_at desc);
create table if not exists public.ob_staff_pin_devices(
 user_id uuid primary key references auth.users(id) on delete cascade,
 venue_id text not null,
 staff_role text not null check(staff_role in ('waiter','kitchen','bar','manager')),
 pin_hash text not null,
 unlocked_until timestamptz,
 failed_attempts integer not null default 0,
 locked_until timestamptz,
 paired_at timestamptz not null default now(),
 revoked_at timestamptz,
 created_by uuid not null
);
create index if not exists ob_staff_devices_venue on public.ob_staff_pin_devices(venue_id,revoked_at);
alter table public.ob_staff_pairing_invites enable row level security;
alter table public.ob_staff_pin_devices enable row level security;
revoke all on public.ob_staff_pairing_invites,public.ob_staff_pin_devices from public,anon,authenticated;

-- Admin alone provisions and revokes PIN devices across venues.
create or replace function public.ob_staff_is_admin()
returns boolean language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then return false; end if;
 return coalesce((public.ob_me()->>'role')='admin',false);
exception when others then return false;
end $$;

create or replace function public.ob_staff_admin_venues()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.ob_staff_is_admin() then raise exception 'Yonetici yetkisi gerekli'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',v.id::text,'name',v.name,
 'tables',v.tables,'adisyon',coalesce(s.enabled,false),
 'pin_enabled',coalesce(s.staff_pin_enabled,false),
 'devices',(select count(*) from public.ob_staff_pin_devices d
  where d.venue_id=v.id::text and d.revoked_at is null)) order by v.name)
 from oynabak_private.venues v
 left join public.ob_adisyon_settings s on s.venue_id=v.id::text),'[]'::jsonb);
end $$;

create or replace function public.ob_staff_pin_toggle(p_venue_id text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
 if not public.ob_staff_is_admin() then raise exception 'Yonetici yetkisi gerekli'; end if;
 if not exists(select 1 from oynabak_private.venues v where v.id::text=p_venue_id)
 then raise exception 'Isletme bulunamadi'; end if;
 if p_enabled and not exists(select 1 from public.ob_adisyon_settings
  where venue_id=p_venue_id and enabled) then
  raise exception 'Once isletmenin adisyon paketini acin';
 end if;
 update public.ob_adisyon_settings set staff_pin_enabled=p_enabled,updated_at=now()
 where venue_id=p_venue_id;
 if not found then raise exception 'Adisyon paketi tanimli degil'; end if;
 -- Disabling takes effect immediately via server permission gate.
 if not p_enabled then
  update public.ob_staff_pin_devices set unlocked_until=null
  where venue_id=p_venue_id;
 end if;
 return jsonb_build_object('venue_id',p_venue_id,'enabled',p_enabled);
end $$;

create or replace function public.ob_staff_device_gate(p_venue_id text)
returns boolean language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null then return false; end if;
 if coalesce(auth.jwt()->>'is_anonymous','false')<>'true' then return true; end if;
 return exists(select 1
  from public.ob_staff_pin_devices d
  join public.ob_adisyon_settings s on s.venue_id=d.venue_id
  where d.user_id=auth.uid() and d.venue_id=p_venue_id
    and d.revoked_at is null and d.unlocked_until>now()
    and d.locked_until is distinct from 'infinity'::timestamptz
    and s.enabled and s.staff_pin_enabled);
end $$;

create or replace function public.ob_staff_invite_create(p_venue_id text,p_role text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare code_ text; exp_ timestamptz;
begin
 if not public.ob_staff_is_admin() then raise exception 'Yonetici yetkisi gerekli'; end if;
 if p_role not in ('waiter','kitchen','bar','manager') then raise exception 'Rol gecersiz'; end if;
 if not exists(select 1 from public.ob_adisyon_settings
   where venue_id=p_venue_id and enabled and staff_pin_enabled)
 then raise exception 'Bu isletmede personel PIN sistemi kapali'; end if;
 code_:=upper(encode(extensions.gen_random_bytes(12),'hex'));
 exp_:=now()+interval '10 minutes';
 insert into public.ob_staff_pairing_invites(venue_id,code_hash,staff_role,
 expires_at,created_by)
 values(p_venue_id,encode(extensions.digest(code_,'sha256'),'hex'),p_role,exp_,auth.uid());
 return jsonb_build_object('code',code_,'expires_at',exp_,'role',p_role);
end $$;

create or replace function public.ob_staff_device_pair(p_code text,p_pin text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare inv public.ob_staff_pairing_invites%rowtype;
 user_ uuid:=auth.uid();
begin
 if user_ is null or coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
 then raise exception 'Personel cihazinda e-postasiz giris gerekli'; end if;
 if coalesce(p_code,'')!~'^[a-fA-F0-9]{24}$'
   or coalesce(p_pin,'')!~'^[0-9]{6}$' then
  raise exception 'Kod 24 karakter, PIN 6 rakam olmali'; end if;
 -- Each anonymous auth identity can be paired with one active station device.
 if exists(select 1 from public.ob_staff_pin_devices where user_id=user_)
 then raise exception 'Bu cihaz zaten eslestirildi; yoneticiden yeniden kod isteyin'; end if;
 select * into inv from public.ob_staff_pairing_invites
 where code_hash=encode(extensions.digest(upper(p_code),'sha256'),'hex')
 for update;
 if not found or inv.used_at is not null or inv.expires_at<=now()
 then raise exception 'Eslestirme kodu gecersiz veya suresi dolmus'; end if;
 if not exists(select 1 from public.ob_adisyon_settings
  where venue_id=inv.venue_id and enabled and staff_pin_enabled)
 then raise exception 'Isletme PIN sistemi aktif degil'; end if;
 insert into public.ob_staff_pin_devices(user_id,venue_id,staff_role,
 pin_hash,unlocked_until,created_by)
 values(user_,inv.venue_id,inv.staff_role,
 extensions.crypt(p_pin,extensions.gen_salt('bf',10)),now()+interval '8 hours',inv.created_by);
 insert into public.ob_adisyon_staff(venue_id,user_id,staff_role,created_by)
 values(inv.venue_id,user_,inv.staff_role,inv.created_by)
 on conflict(venue_id,user_id) do update set
 staff_role=excluded.staff_role,active=true;
 update public.ob_staff_pairing_invites set used_at=now(),used_by=user_ where id=inv.id;
 return jsonb_build_object('paired',true,'role',inv.staff_role,'venue_id',inv.venue_id);
end $$;

create or replace function public.ob_staff_device_status()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare dev public.ob_staff_pin_devices%rowtype; vname text; enabled_ boolean;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
 then return jsonb_build_object('paired',false); end if;
 select * into dev from public.ob_staff_pin_devices where user_id=auth.uid();
 if not found then return jsonb_build_object('paired',false); end if;
 select v.name,s.enabled and s.staff_pin_enabled into vname,enabled_
 from oynabak_private.venues v join public.ob_adisyon_settings s on s.venue_id=v.id::text
 where v.id::text=dev.venue_id;
 return jsonb_build_object('paired',true,'venue_id',dev.venue_id,
  'venue_name',coalesce(vname,'Isletme'),'role',dev.staff_role,
  'active',dev.revoked_at is null and coalesce(enabled_,false),
  'unlocked',dev.revoked_at is null and coalesce(enabled_,false) and
    dev.unlocked_until>now() and coalesce(dev.locked_until,now()-interval '1 second')<=now(),
  'locked_until',dev.locked_until,'unlocked_until',dev.unlocked_until);
end $$;

create or replace function public.ob_staff_device_unlock(p_pin text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare dev public.ob_staff_pin_devices%rowtype;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
 then raise exception 'E-postasiz personel oturumu gerekli'; end if;
 select * into dev from public.ob_staff_pin_devices where user_id=auth.uid() for update;
 if not found or dev.revoked_at is not null or not exists(
 select 1 from public.ob_adisyon_settings where venue_id=dev.venue_id
 and enabled and staff_pin_enabled)
 then return jsonb_build_object('ok',false,'message','Cihaz yetkisi kapali'); end if;
 if dev.locked_until>now() then return jsonb_build_object('ok',false,'message','Cihaz gecici olarak kilitli'); end if;
 if coalesce(p_pin,'') !~ '^[0-9]{6}$' or
  extensions.crypt(p_pin,dev.pin_hash)<>dev.pin_hash then
  update public.ob_staff_pin_devices set
   failed_attempts=failed_attempts+1,
   locked_until=case when failed_attempts+1>=5 then now()+interval '15 minutes' else null end,
   unlocked_until=null where user_id=auth.uid();
  return jsonb_build_object('ok',false,'message','PIN hatali. 5 hatada 15 dakika kilitlenir');
 end if;
 update public.ob_staff_pin_devices set failed_attempts=0,locked_until=null,
 unlocked_until=now()+interval '8 hours' where user_id=auth.uid();
 return jsonb_build_object('ok',true,'message','Oturum acildi');
end $$;

create or replace function public.ob_staff_device_lock()
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null then return false; end if;
 update public.ob_staff_pin_devices set unlocked_until=null where user_id=auth.uid();
 return true;
end $$;

create or replace function public.ob_staff_device_admin_list(p_venue_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.ob_staff_is_admin() then raise exception 'Yonetici yetkisi gerekli'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.user_id,
 'role',d.staff_role,'paired_at',d.paired_at,'revoked',d.revoked_at is not null,
 'unlocked',d.unlocked_until>now() and d.revoked_at is null)
 order by d.paired_at desc)
 from public.ob_staff_pin_devices d where d.venue_id=p_venue_id),'[]'::jsonb);
end $$;

create or replace function public.ob_staff_device_revoke(p_venue_id text,p_user_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if not public.ob_staff_is_admin() then raise exception 'Yonetici yetkisi gerekli'; end if;
 update public.ob_staff_pin_devices set revoked_at=now(),unlocked_until=null
 where venue_id=p_venue_id and user_id=p_user_id and revoked_at is null;
 if not found then raise exception 'Aktif cihaz bulunamadi'; end if;
 delete from public.ob_adisyon_staff where venue_id=p_venue_id and user_id=p_user_id;
 return true;
end $$;

-- Permission checks are fail-closed for anonymous identities without
-- a currently unlocked, non-revoked paired device.
create or replace function public.ob_adisyon_permission(
 p_venue_id text,p_action text,p_station text default null)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare role_name text;
begin
 if auth.uid() is null or p_venue_id is null then return false; end if;
 if not exists(select 1 from public.ob_adisyon_settings
   where venue_id=p_venue_id and enabled) then return false; end if;
 if not public.ob_staff_device_gate(p_venue_id) then return false; end if;
 if public.ob_adisyon_owner(p_venue_id) then return true; end if;
 select s.staff_role into role_name from public.ob_adisyon_staff s
 where s.venue_id=p_venue_id and s.user_id=auth.uid() and s.active;
 if role_name is null then return false; end if;
 if role_name='manager' then return true; end if;
 if role_name='waiter' then return p_action in ('read','add','review','close','move','split'); end if;
 if role_name in ('kitchen','bar') then
  return p_action='read' or
   (p_action='status' and p_station=role_name);
 end if;
 return false;
end $$;

-- Legacy staff list MUST enforce device lock too.
create or replace function public.ob_adisyon_my_venues()
returns jsonb language sql stable security definer set search_path=''
as $$
select coalesce(jsonb_agg(jsonb_build_object('id',s.venue_id,
 'name',v.name,'role',s.staff_role) order by v.name),'[]'::jsonb)
from public.ob_adisyon_staff s
join oynabak_private.venues v on v.id::text=s.venue_id
join public.ob_adisyon_settings a on a.venue_id=s.venue_id
where s.user_id=auth.uid() and s.active and a.enabled and v.active and v.licensed
and public.ob_staff_device_gate(s.venue_id)
$$;

-- Admin can inspect and enable a currently disabled adisyon package.
create or replace function public.ob_adisyon_status(p_venue_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare s public.ob_adisyon_settings%rowtype;
 owner_ boolean;
begin
 owner_:=public.ob_adisyon_owner(p_venue_id);
 if not owner_ and not public.ob_adisyon_permission(p_venue_id,'read')
 then return jsonb_build_object('allowed',false,'enabled',false); end if;
 select * into s from public.ob_adisyon_settings where venue_id=p_venue_id;
 return jsonb_build_object('allowed',true,'enabled',coalesce(s.enabled,false),
 'table_count',coalesce(s.table_count,1),'can_manage',owner_);
end $$;

revoke all on function
 public.ob_staff_is_admin(),public.ob_staff_admin_venues(),
 public.ob_staff_pin_toggle(text,boolean),
 public.ob_staff_device_gate(text),
 public.ob_staff_invite_create(text,text),public.ob_staff_device_pair(text,text),
 public.ob_staff_device_status(),public.ob_staff_device_unlock(text),
 public.ob_staff_device_lock(),public.ob_staff_device_admin_list(text),
 public.ob_staff_device_revoke(text,uuid)
 from public,anon,authenticated;
grant execute on function
 public.ob_staff_admin_venues(),public.ob_staff_pin_toggle(text,boolean),
 public.ob_staff_invite_create(text,text),public.ob_staff_device_pair(text,text),
 public.ob_staff_device_status(),public.ob_staff_device_unlock(text),
 public.ob_staff_device_lock(),public.ob_staff_device_admin_list(text),
 public.ob_staff_device_revoke(text,uuid)
 to authenticated;
grant execute on function public.ob_staff_device_gate(text) to authenticated;

-- Turn on PIN enrolment for the single already-subscribed test venue.
update public.ob_adisyon_settings s set staff_pin_enabled=true,updated_at=now()
from oynabak_private.venues v
where s.venue_id=v.id::text and v.name='İyi Yol Akademi' and s.enabled;
