-- Minimal operating screen. Staff do not sign in or type pairing codes.
-- An owner MUST approve each device once; a random unguessable per-device bearer
-- token is stored only as SHA-256 hash in DB and revoked by the owner.
-- No QR/payment/POS changes. Operations are fully scoped to one enabled venue.

alter table public.ob_adisyon_settings
 add column if not exists simple_console_enabled boolean not null default false;

create table if not exists public.ob_simple_devices (
 id uuid primary key,
 venue_id text not null,
 token_hash text not null,
 approved_by uuid,
 approved_at timestamptz,
 revoked_at timestamptz,
 requested_at timestamptz not null default now(),
 last_seen_at timestamptz,
 check (length(token_hash)=64)
);
create index if not exists ob_simple_devices_venue on public.ob_simple_devices(venue_id,requested_at desc);
alter table public.ob_simple_devices enable row level security;
revoke all on public.ob_simple_devices from public,anon,authenticated;

-- Private token verifier. Never grant directly to API roles.
create or replace function public.ob_simple_verified_venue(p_id uuid,p_token text)
returns text language plpgsql security definer stable set search_path=''
as $$
declare vid text;
begin
 if p_id is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$'
 then return null; end if;
 select d.venue_id into vid
 from public.ob_simple_devices d
 join public.ob_adisyon_settings s on s.venue_id=d.venue_id
 join oynabak_private.venues v on v.id::text=d.venue_id
 where d.id=p_id and d.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
  and d.approved_at is not null and d.revoked_at is null
  and s.enabled and s.simple_console_enabled and v.active and v.licensed;
 return vid;
end $$;

create or replace function public.ob_simple_venues()
returns jsonb language sql security definer stable set search_path=''
as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id::text,'name',v.name)
 order by v.name),'[]'::jsonb)
 from oynabak_private.venues v
 join public.ob_adisyon_settings s on s.venue_id=v.id::text
 where s.enabled and s.simple_console_enabled and v.active and v.licensed
$$;

create or replace function public.ob_simple_request(p_venue_id text,p_id uuid,p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare d public.ob_simple_devices%rowtype;
begin
 if p_id is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then
  raise exception 'Cihaz kimligi gecersiz'; end if;
 if not exists(select 1 from public.ob_adisyon_settings s
  join oynabak_private.venues v on v.id::text=s.venue_id
  where s.venue_id=p_venue_id and s.enabled and s.simple_console_enabled
  and v.active and v.licensed)
 then raise exception 'Bu isletmede hizli ekran etkin degil';end if;

 select * into d from public.ob_simple_devices where id=p_id for update;
 if found then
  if d.venue_id<>p_venue_id or d.token_hash<>encode(extensions.digest(p_token,'sha256'),'hex')
   then raise exception 'Cihaz eslestirme bilgileri uyusmuyor'; end if;
  return jsonb_build_object('requested',true,'approved',
    d.approved_at is not null and d.revoked_at is null,'revoked',d.revoked_at is not null);
 end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ob-simple-enroll:'||p_venue_id,0));
 if (select count(*) from public.ob_simple_devices
  where venue_id=p_venue_id and approved_at is null and revoked_at is null)>=5
 then raise exception 'Cihaz talebi sinirina ulasildi. Yoneticiniz bekleyen cihazlari onaylasin';end if;
 if (select count(*) from public.ob_simple_devices
  where venue_id=p_venue_id and requested_at>now()-interval '1 hour')>=15
 then raise exception 'Cok fazla yeni cihaz istegi var'; end if;
 insert into public.ob_simple_devices(id,venue_id,token_hash)
 values(p_id,p_venue_id,encode(extensions.digest(p_token,'sha256'),'hex'));
 return jsonb_build_object('requested',true,'approved',false);
end $$;

create or replace function public.ob_simple_admin_overview()
returns jsonb language plpgsql security definer stable set search_path=''
as $$
begin
 if not public.ob_staff_is_admin() then raise exception 'Yonetici yetkisi gerekli'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',v.id::text,'name',v.name,'adisyon',coalesce(s.enabled,false),
  'simple',coalesce(s.simple_console_enabled,false),'tables',v.tables,
  'devices',coalesce((select jsonb_agg(jsonb_build_object(
    'id',d.id,'requested_at',d.requested_at,'approved',d.approved_at is not null,
    'revoked',d.revoked_at is not null,'last_seen_at',d.last_seen_at)
    order by d.requested_at desc) from public.ob_simple_devices d
    where d.venue_id=v.id::text),'[]'::jsonb)) order by v.name)
 from oynabak_private.venues v left join public.ob_adisyon_settings s
 on s.venue_id=v.id::text),'[]'::jsonb);
end $$;

create or replace function public.ob_simple_admin_toggle(p_venue_id text,p_enabled boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if not public.ob_staff_is_admin() then raise exception 'Yonetici yetkisi gerekli'; end if;
 if not exists(select 1 from oynabak_private.venues where id::text=p_venue_id)
 then raise exception 'Isletme bulunamadi'; end if;
 if p_enabled and not exists(select 1 from public.ob_adisyon_settings
 where venue_id=p_venue_id and enabled)
 then raise exception 'Once adisyon paketini acin'; end if;
 update public.ob_adisyon_settings set simple_console_enabled=p_enabled,updated_at=now()
 where venue_id=p_venue_id;
 if not found then raise exception 'Adisyon ayari eksik'; end if;
 return true;
end $$;

create or replace function public.ob_simple_admin_device(p_venue_id text,p_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if not public.ob_staff_is_admin() then raise exception 'Yonetici yetkisi gerekli'; end if;
 if p_action='approve' then
  if not exists(select 1 from public.ob_adisyon_settings where venue_id=p_venue_id
    and enabled and simple_console_enabled) then raise exception 'Hizli ekran kapali'; end if;
  update public.ob_simple_devices set approved_at=now(),approved_by=auth.uid()
  where id=p_id and venue_id=p_venue_id and approved_at is null and revoked_at is null;
 elsif p_action='revoke' then
  update public.ob_simple_devices set revoked_at=now()
  where id=p_id and venue_id=p_venue_id and revoked_at is null;
 else raise exception 'Islem gecersiz';end if;
 if not found then raise exception 'Cihaz bulunamadi veya daha once islenmis'; end if;
 return true;
end $$;

create or replace function public.ob_simple_state(p_id uuid,p_token text)
returns jsonb language plpgsql security definer stable set search_path=''
as $$
declare d public.ob_simple_devices%rowtype;vid text; data_ jsonb;
begin
 if p_id is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$'
 then return jsonb_build_object('ok',false,'message','Cihaz kimligi gecersiz'); end if;
 select * into d from public.ob_simple_devices where id=p_id
  and token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then return jsonb_build_object('ok',false,'reset',true); end if;
 if d.revoked_at is not null then return jsonb_build_object('ok',false,'revoked',true); end if;
 if d.approved_at is null then return jsonb_build_object('ok',false,'pending',true); end if;
 vid:=public.ob_simple_verified_venue(p_id,p_token);
 if vid is null then return jsonb_build_object('ok',false,'disabled',true); end if;
 return jsonb_build_object('ok',true,'venue_id',vid,
  'name',(select v.name from oynabak_private.venues v where v.id::text=vid),
  'table_count',(select table_count from public.ob_adisyon_settings where venue_id=vid),
  'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from (
     select id,table_no,items,total,customer_note,created_at from
      public.ob_customer_order_requests where venue_id=vid and status='pending'
      order by created_at asc limit 60) r),'[]'::jsonb),
  'tickets',coalesce((select jsonb_agg(to_jsonb(t) order by t.opened_at) from (
      select id,table_no,status,opened_at from public.ob_adisyon_tickets
      where venue_id=vid and status='open' order by opened_at limit 200) t),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from (
      select i.id,i.ticket_id,i.name,i.quantity,i.station,i.status,i.note,
        i.line_total,i.created_at
      from public.ob_adisyon_items i join public.ob_adisyon_tickets t on t.id=i.ticket_id
      where i.venue_id=vid and t.status='open'
      order by i.created_at limit 400) i),'[]'::jsonb),
  'menu',coalesce((select m.menu from public.ob_venue_menus m where m.venue_id=vid),
  '{"categories":[]}'::jsonb),
  'last_update',now());
end $$;

create or replace function public.ob_simple_decide(
 p_id uuid,p_token text,p_order_id uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare vid text; req public.ob_customer_order_requests%rowtype;
 ticket uuid; actor uuid; line jsonb; item_id uuid;
begin
 vid:=public.ob_simple_verified_venue(p_id,p_token);
 if vid is null then raise exception 'Bu cihaz icin erisim yetkisi bulunmuyor'; end if;
 select * into req from public.ob_customer_order_requests
 where id=p_order_id and venue_id=vid and status='pending' for update;
 if not found then raise exception 'Siparis onceden incelendi veya bulunamadi'; end if;
 select approved_by into actor from public.ob_simple_devices where id=p_id;
 if actor is null then raise exception 'Cihaz onayi bulunamadi'; end if;
 if not coalesce(p_approve,false) then
  update public.ob_customer_order_requests set status='rejected',
   reject_reason='İşletme tarafından reddedildi',reviewed_at=now(),reviewed_by=actor
  where id=req.id;
  return jsonb_build_object('status','rejected');
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(vid||':'||req.table_no::text,0));
 select id into ticket from public.ob_adisyon_tickets
 where venue_id=vid and table_no=req.table_no and status='open' for update;
 if ticket is null then
  insert into public.ob_adisyon_tickets(venue_id,table_no,opened_by)
  values(vid,req.table_no,actor) returning id into ticket;
 end if;
 for line in select value from jsonb_array_elements(req.items)
 loop
  insert into public.ob_adisyon_items(ticket_id,venue_id,menu_item_id,variant_id,
    name,unit_price,quantity,station,note,created_by)
  values(ticket,vid,line->>'item_id',nullif(line->>'variant_id',''),
   line->>'name',(line->>'unit_price')::numeric,(line->>'quantity')::integer,
   line->>'station',left(trim(concat_ws(' | ',nullif(line->>'variant_name',''),
     nullif(line->>'note',''),nullif(req.customer_note,''))),300),actor)
  returning id into item_id;
  insert into public.ob_adisyon_audit(venue_id,ticket_id,item_id,action,actor_id,detail)
  values(vid,ticket,item_id,'qr_approved',actor,
   jsonb_build_object('request_id',req.id,'simple_device',p_id));
 end loop;
 update public.ob_customer_order_requests set status='approved',
  reviewed_at=now(),reviewed_by=actor,ticket_id=ticket where id=req.id;
 return jsonb_build_object('status','approved','ticket_id',ticket);
end $$;

create or replace function public.ob_simple_item(
 p_id uuid,p_token text,p_item_id uuid,p_next text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare vid text; a uuid; itm public.ob_adisyon_items%rowtype;
begin
 vid:=public.ob_simple_verified_venue(p_id,p_token);
 if vid is null then raise exception 'Yetkisiz cihaz'; end if;
 select i.* into itm from public.ob_adisyon_items i
 join public.ob_adisyon_tickets t on t.id=i.ticket_id
 where i.id=p_item_id and i.venue_id=vid and t.status='open' for update of i;
 if not found then raise exception 'Siparis kalemi bulunamadi'; end if;
 if not ((itm.status='new' and p_next='preparing') or
   (itm.status='preparing' and p_next='ready') or
   (itm.status='ready' and p_next='served'))
 then raise exception 'Siparis adimi gecersiz';end if;
 select approved_by into a from public.ob_simple_devices where id=p_id;
 update public.ob_adisyon_items set status=p_next,updated_at=now() where id=itm.id;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,item_id,action,actor_id,detail)
 values(vid,itm.ticket_id,itm.id,'status',a,
 jsonb_build_object('old',itm.status,'new',p_next,'simple_device',p_id));
 return true;
end $$;

create or replace function public.ob_simple_close(p_id uuid,p_token text,p_ticket_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare vid text;a uuid;
begin
 vid:=public.ob_simple_verified_venue(p_id,p_token);
 if vid is null then raise exception 'Yetkisiz cihaz'; end if;
 select approved_by into a from public.ob_simple_devices where id=p_id;
 update public.ob_adisyon_tickets set status='closed',closed_at=now(),closed_by=a
 where id=p_ticket_id and venue_id=vid and status='open';
 if not found then raise exception 'Acik adisyon bulunamadi'; end if;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,action,actor_id,detail)
 values(vid,p_ticket_id,'close',a,jsonb_build_object('simple_device',p_id,
 'payment_recorded',false));
 return true;
end $$;

create or replace function public.ob_simple_add(
 p_id uuid,p_token text,p_table integer,p_item text,p_variant text,p_qty integer,p_note text default '')
returns boolean language plpgsql security definer set search_path=''
as $$
declare vid text;actor uuid;prod jsonb;cat jsonb;vari jsonb;price_ numeric;
 station_ text;name_ text;t_id uuid;i_id uuid;
begin
 vid:=public.ob_simple_verified_venue(p_id,p_token);
 if vid is null then raise exception 'Yetkisiz cihaz'; end if;
 if not exists(select 1 from public.ob_adisyon_settings s where s.venue_id=vid
  and p_table between 1 and s.table_count) then raise exception 'Masa gecersiz';end if;
 if p_qty is null or p_qty not between 1 and 20 or length(coalesce(p_note,''))>200
  or nullif(trim(coalesce(p_item,'')),'') is null then raise exception 'Urun gecersiz'; end if;
 select i,c into prod,cat from public.ob_venue_menus m
 cross join lateral jsonb_array_elements(coalesce(m.menu->'categories','[]'::jsonb)) c
 cross join lateral jsonb_array_elements(coalesce(c->'items','[]'::jsonb)) i
 where m.venue_id=vid and i->>'id'=p_item
  and coalesce(c->>'active','true')<>'false'
  and coalesce(i->>'active','true')<>'false'
  and coalesce(i->>'sold_out','false')<>'true' limit 1;
 if prod is null then raise exception 'Urun bulunamadi'; end if;
 if nullif(p_variant,'') is not null then
  select v into vari from jsonb_array_elements(coalesce(prod->'variants','[]'::jsonb)) v
  where v->>'id'=p_variant limit 1;
  if vari is null then raise exception 'Varyant gecersiz'; end if;
 end if;
 price_:=coalesce((vari->>'price')::numeric,(prod->>'price')::numeric);
 if price_ is null or price_<0 or price_>1000000 then raise exception 'Fiyat gecersiz'; end if;
 name_:=prod->>'name';
 station_:=case when lower(coalesce(cat->>'name','')) ~
 '(içecek|icecek|drink|kahve|coffee|bar|kokteyl|çay|cay|bira|şarap|sarap|meşrubat|mesrubat)'
 then 'bar' else 'kitchen' end;
 select approved_by into actor from public.ob_simple_devices where id=p_id;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(vid||':'||p_table::text,0));
 select id into t_id from public.ob_adisyon_tickets
 where venue_id=vid and table_no=p_table and status='open' for update;
 if t_id is null then
  insert into public.ob_adisyon_tickets(venue_id,table_no,opened_by)
  values(vid,p_table,actor) returning id into t_id;
 end if;
 insert into public.ob_adisyon_items(ticket_id,venue_id,menu_item_id,variant_id,
   name,unit_price,quantity,station,note,created_by)
 values(t_id,vid,p_item,nullif(p_variant,''),name_,price_,p_qty,station_,
 left(trim(concat_ws(' | ',nullif(vari->>'name',''),nullif(p_note,''))),300),actor)
 returning id into i_id;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,item_id,action,actor_id,detail)
 values(vid,t_id,i_id,'add',actor,jsonb_build_object('simple_device',p_id,
 'menu_item_id',p_item,'qty',p_qty));
 return true;
end $$;

-- Direct table access prohibited. Each public RPC authenticates a 256-bit bearer.
revoke all on function
 public.ob_simple_verified_venue(uuid,text),
 public.ob_simple_venues(),
 public.ob_simple_request(text,uuid,text),
 public.ob_simple_admin_overview(),
 public.ob_simple_admin_toggle(text,boolean),
 public.ob_simple_admin_device(text,uuid,text),
 public.ob_simple_state(uuid,text),
 public.ob_simple_decide(uuid,text,uuid,boolean),
 public.ob_simple_item(uuid,text,uuid,text),
 public.ob_simple_close(uuid,text,uuid),
 public.ob_simple_add(uuid,text,integer,text,text,integer,text)
from public,anon,authenticated;

grant execute on function
 public.ob_simple_venues(),
 public.ob_simple_request(text,uuid,text),
 public.ob_simple_state(uuid,text),
 public.ob_simple_decide(uuid,text,uuid,boolean),
 public.ob_simple_item(uuid,text,uuid,text),
 public.ob_simple_close(uuid,text,uuid),
 public.ob_simple_add(uuid,text,integer,text,text,integer,text)
to anon,authenticated;

grant execute on function
 public.ob_simple_admin_overview(),
 public.ob_simple_admin_toggle(text,boolean),
 public.ob_simple_admin_device(text,uuid,text)
to authenticated;

-- Enabled only for already-subscribed academy venue. Never enable Freed.
update public.ob_adisyon_settings s set simple_console_enabled=true,updated_at=now()
from oynabak_private.venues v where v.id::text=s.venue_id
 and v.name='İyi Yol Akademi' and s.enabled;
