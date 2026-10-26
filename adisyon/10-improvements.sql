
-- OynaBak adisyon quality, table security, workforce, split, reports. No payment processing.
create table if not exists public.ob_adisyon_staff (
 venue_id text not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 staff_role text not null check(staff_role in ('manager','waiter','kitchen','bar')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 created_by uuid,
 primary key(venue_id,user_id)
);
create index if not exists ob_adisyon_staff_user on public.ob_adisyon_staff(user_id,active);
create table if not exists public.ob_adisyon_table_codes(
 venue_id text not null,
 table_no integer not null check(table_no between 1 and 200),
 code text not null check(code~'^[0-9]{6}$'),
 updated_at timestamptz not null default now(),
 primary key(venue_id,table_no)
);
alter table public.ob_adisyon_settings add column if not exists require_table_code boolean not null default false;

create table if not exists public.ob_adisyon_split_allocations(
 venue_id text not null,
 ticket_id uuid not null references public.ob_adisyon_tickets(id),
 item_id uuid not null references public.ob_adisyon_items(id),
 group_name text not null check(length(group_name) between 1 and 40),
 quantity integer not null check(quantity between 1 and 99),
 created_at timestamptz not null default now(),
 created_by uuid not null,
 primary key(ticket_id,item_id,group_name)
);
create index if not exists ob_adisyon_split_venue on public.ob_adisyon_split_allocations(venue_id,ticket_id);

alter table public.ob_adisyon_staff enable row level security;
alter table public.ob_adisyon_table_codes enable row level security;
alter table public.ob_adisyon_split_allocations enable row level security;
revoke all on public.ob_adisyon_staff,public.ob_adisyon_table_codes,
 public.ob_adisyon_split_allocations from public,anon,authenticated;

create or replace function public.ob_adisyon_owner(p_venue_id text)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare m jsonb;
begin
 if auth.uid() is null then return false; end if;
 m:=public.ob_me();
 return m->>'role'='admin'
  or (m->>'role'='merchant' and m->'venue'->>'id'=p_venue_id);
exception when others then return false;
end $$;

create or replace function public.ob_adisyon_permission(
 p_venue_id text,p_action text,p_station text default null)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare role_name text;
begin
 if auth.uid() is null or p_venue_id is null then return false; end if;
 if not exists(select 1 from public.ob_adisyon_settings
   where venue_id=p_venue_id and enabled) then return false; end if;
 if public.ob_adisyon_owner(p_venue_id) then return true; end if;
 select s.staff_role into role_name from public.ob_adisyon_staff s
 where s.venue_id=p_venue_id and s.user_id=auth.uid() and s.active;
 if role_name is null then return false; end if;
 if role_name='manager' then return true; end if;
 if role_name='waiter' then return p_action in ('read','add','review','close','move','split'); end if;
 if role_name in ('kitchen','bar') then
  return p_action='read' or (p_action='status' and (p_station=role_name or
   (role_name='kitchen' and p_station='kitchen')));
 end if;
 return false;
end $$;

create or replace function public.ob_adisyon_my_venues()
returns jsonb language sql stable security definer set search_path=''
as $$
select coalesce(jsonb_agg(jsonb_build_object('id',s.venue_id,'name',v.name,'role',s.staff_role)
 order by v.name),'[]'::jsonb)
from public.ob_adisyon_staff s join oynabak_private.venues v on v.id::text=s.venue_id
join public.ob_adisyon_settings a on a.venue_id=s.venue_id
where s.user_id=auth.uid() and s.active and a.enabled and v.active and v.licensed
$$;

create or replace function public.ob_adisyon_staff_list(p_venue_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.ob_adisyon_owner(p_venue_id) and not exists(
 select 1 from public.ob_adisyon_staff where user_id=auth.uid()
 and venue_id=p_venue_id and staff_role='manager' and active) then
 raise exception 'Personel yonetimi yetkisi gerekli';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'user_id',s.user_id,'email',u.email,'role',s.staff_role,'active',s.active)
  order by u.email)
 from public.ob_adisyon_staff s join auth.users u on u.id=s.user_id
 where s.venue_id=p_venue_id),'[]'::jsonb);
end $$;

create or replace function public.ob_adisyon_staff_assign(p_venue_id text,p_email text,p_role text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare target uuid;
begin
 if not public.ob_adisyon_owner(p_venue_id) then raise exception 'Isletme sahibi yetkisi gerekli'; end if;
 if p_role not in ('manager','waiter','kitchen','bar','remove') or
 length(trim(coalesce(p_email,''))) not between 5 and 200 then raise exception 'Gecersiz personel bilgisi'; end if;
 if not exists(select 1 from public.ob_adisyon_settings where venue_id=p_venue_id and enabled)
 then raise exception 'Bu isletmede adisyon paketi kapali'; end if;
 select id into target from auth.users where lower(email)=lower(trim(p_email));
 if target is null then raise exception 'Calisan once OynaBak hesabini olusturmali'; end if;
 if p_role='remove' then
  delete from public.ob_adisyon_staff where venue_id=p_venue_id and user_id=target;
 else
  insert into public.ob_adisyon_staff(venue_id,user_id,staff_role,created_by)
  values(p_venue_id,target,p_role,auth.uid())
  on conflict(venue_id,user_id) do update set staff_role=excluded.staff_role,active=true;
 end if;
 return true;
end $$;

create or replace function public.ob_adisyon_table_security(p_venue_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.ob_adisyon_permission(p_venue_id,'read') then raise exception 'Yetkisiz'; end if;
 return jsonb_build_object('required',coalesce((select require_table_code
 from public.ob_adisyon_settings where venue_id=p_venue_id),false),
 'codes',coalesce((select jsonb_agg(jsonb_build_object('table_no',table_no,'code',code)
 order by table_no) from public.ob_adisyon_table_codes
 where venue_id=p_venue_id),'[]'::jsonb));
end $$;

create or replace function public.ob_adisyon_table_code_action(
 p_venue_id text,p_table_no integer,p_action text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare n int; code_ text;
begin
 if not public.ob_adisyon_permission(p_venue_id,'read') then raise exception 'Yetkisiz'; end if;
 if p_action='enable' or p_action='disable' then
  if not public.ob_adisyon_owner(p_venue_id) then raise exception 'Sadece isletme sahibi'; end if;
  update public.ob_adisyon_settings set require_table_code=p_action='enable',updated_at=now()
  where venue_id=p_venue_id and enabled;
  if not found then raise exception 'Adisyon kapali'; end if;
  if p_action='enable' then
    select table_count into n from public.ob_adisyon_settings where venue_id=p_venue_id;
    for i in 1..n loop
      insert into public.ob_adisyon_table_codes(venue_id,table_no,code)
      values(p_venue_id,i,lpad((floor(random()*1000000))::int::text,6,'0'))
      on conflict(venue_id,table_no) do nothing;
    end loop;
  end if;
 elsif p_action='rotate' then
  if not public.ob_adisyon_owner(p_venue_id) then raise exception 'Sadece isletme sahibi'; end if;
  if not exists(select 1 from public.ob_adisyon_settings
    where venue_id=p_venue_id and enabled and p_table_no between 1 and table_count)
  then raise exception 'Masa gecersiz'; end if;
  insert into public.ob_adisyon_table_codes(venue_id,table_no,code,updated_at)
  values(p_venue_id,p_table_no,lpad((floor(random()*1000000))::int::text,6,'0'),now())
  on conflict(venue_id,table_no) do update set code=excluded.code,updated_at=now();
 else raise exception 'Islem gecersiz'; end if;
 return public.ob_adisyon_table_security(p_venue_id);
end $$;

create or replace function public.ob_adisyon_move_ticket(
 p_venue_id text,p_ticket_id uuid,p_new_table integer)
returns boolean language plpgsql security definer set search_path=''
as $$
declare t public.ob_adisyon_tickets%rowtype;
begin
 if not public.ob_adisyon_permission(p_venue_id,'move') then raise exception 'Masa tasima yetkisi yok'; end if;
 if not exists(select 1 from public.ob_adisyon_settings where venue_id=p_venue_id
  and enabled and p_new_table between 1 and table_count) then raise exception 'Hedef masa gecersiz'; end if;
 -- Ticket ID lock serializes transfer, concurrent add locks table. Destination unique index remains final guard.
 select * into t from public.ob_adisyon_tickets where id=p_ticket_id
 and venue_id=p_venue_id and status='open' for update;
 if not found then raise exception 'Acik adisyon bulunamadi'; end if;
 if t.table_no=p_new_table then return true; end if;
 if exists(select 1 from public.ob_adisyon_tickets where venue_id=p_venue_id
  and table_no=p_new_table and status='open') then raise exception 'Hedef masada acik adisyon var'; end if;
 update public.ob_adisyon_tickets set table_no=p_new_table where id=p_ticket_id;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,action,actor_id,detail)
 values(p_venue_id,p_ticket_id,'move',auth.uid(),jsonb_build_object('from',t.table_no,'to',p_new_table));
 return true;
end $$;

create or replace function public.ob_adisyon_split_assign(
 p_venue_id text,p_ticket_id uuid,p_item_id uuid,p_group text,p_quantity int)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare it public.ob_adisyon_items%rowtype; allocated int;
begin
 if not public.ob_adisyon_permission(p_venue_id,'split') then raise exception 'Hesap bolusturme yetkisi yok'; end if;
 if trim(coalesce(p_group,''))='' or length(p_group)>40 or p_quantity<0 or p_quantity>99
 then raise exception 'Grup veya adet gecersiz'; end if;
 perform 1 from public.ob_adisyon_tickets
 where id=p_ticket_id and venue_id=p_venue_id and status='open' for update;
 if not found then raise exception 'Acik adisyon bulunamadi'; end if;
 select * into it from public.ob_adisyon_items where id=p_item_id
 and ticket_id=p_ticket_id and status<>'void';
 if not found then raise exception 'Urun bulunamadi'; end if;
 delete from public.ob_adisyon_split_allocations
 where ticket_id=p_ticket_id and item_id=p_item_id and group_name=p_group;
 select coalesce(sum(quantity),0) into allocated from public.ob_adisyon_split_allocations
 where ticket_id=p_ticket_id and item_id=p_item_id;
 if allocated+p_quantity>it.quantity then raise exception 'Urun adedi asiliyor'; end if;
 if p_quantity>0 then
 insert into public.ob_adisyon_split_allocations
 (venue_id,ticket_id,item_id,group_name,quantity,created_by)
 values(p_venue_id,p_ticket_id,p_item_id,trim(p_group),p_quantity,auth.uid());
 end if;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,item_id,action,actor_id,detail)
 values(p_venue_id,p_ticket_id,p_item_id,'split',auth.uid(),
 jsonb_build_object('group',p_group,'quantity',p_quantity));
 return public.ob_adisyon_split_view(p_venue_id,p_ticket_id);
end $$;

create or replace function public.ob_adisyon_split_view(p_venue_id text,p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.ob_adisyon_permission(p_venue_id,'read') then raise exception 'Yetkisiz'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('item_id',s.item_id,
 'group',s.group_name,'quantity',s.quantity,'amount',s.quantity*i.unit_price))
 from public.ob_adisyon_split_allocations s join public.ob_adisyon_items i on i.id=s.item_id
 join public.ob_adisyon_tickets t on t.id=s.ticket_id and t.venue_id=p_venue_id
 where s.ticket_id=p_ticket_id and i.status<>'void'),'[]'::jsonb);
end $$;

create or replace function public.ob_adisyon_analytics(p_venue_id text,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_days integer:=least(greatest(coalesce(p_days,30),1),365);
begin
 if not public.ob_adisyon_permission(p_venue_id,'reports') then raise exception 'Rapor yetkisi yok'; end if;
 return jsonb_build_object(
 'totals', (select jsonb_build_object('ordered',coalesce(sum(i.line_total) filter(where i.status<>'void'),0),
    'items',count(*) filter(where i.status<>'void'),'cancelled',count(*) filter(where i.status='void'),
    'tables',count(distinct t.id),
    'average_prep_minutes',coalesce(round(avg(extract(epoch from (i.updated_at-i.created_at))/60)
     filter(where i.status in ('ready','served')),1),0))
   from public.ob_adisyon_tickets t join public.ob_adisyon_items i on i.ticket_id=t.id
   where t.venue_id=p_venue_id and i.created_at>=now()-make_interval(days=>v_days)),
 'top_products',coalesce((select jsonb_agg(to_jsonb(x)) from (
    select i.name,sum(i.quantity) qty,sum(i.line_total) total
    from public.ob_adisyon_items i where i.venue_id=p_venue_id
    and i.status<>'void' and i.created_at>=now()-make_interval(days=>v_days)
    group by i.name order by qty desc limit 10) x),'[]'::jsonb),
 'hours',coalesce((select jsonb_agg(to_jsonb(x)) from(
   select extract(hour from i.created_at at time zone 'Europe/Istanbul')::int hour,
    count(*) orders from public.ob_adisyon_items i
    where i.venue_id=p_venue_id and i.created_at>=now()-make_interval(days=>v_days)
    group by 1 order by 1)x),'[]'::jsonb),
 'days',coalesce((select jsonb_agg(to_jsonb(x)) from(
    select (i.created_at at time zone 'Europe/Istanbul')::date day,
      sum(i.line_total) filter(where i.status<>'void') total,count(*) items
    from public.ob_adisyon_items i where i.venue_id=p_venue_id
    and i.created_at>=now()-make_interval(days=>v_days)
    group by 1 order by 1)x),'[]'::jsonb),
 'warning','Siparis tutarlari tahsil edilmis gelir degildir'
 );
end $$;

-- Staff role access is through server RPC only; all new tables stay private under RLS.
revoke all on function
 public.ob_adisyon_owner(text),public.ob_adisyon_permission(text,text,text),
 public.ob_adisyon_my_venues(),public.ob_adisyon_staff_list(text),
 public.ob_adisyon_staff_assign(text,text,text),
 public.ob_adisyon_table_security(text),
 public.ob_adisyon_table_code_action(text,integer,text),
 public.ob_adisyon_move_ticket(text,uuid,integer),
 public.ob_adisyon_split_assign(text,uuid,uuid,text,integer),
 public.ob_adisyon_split_view(text,uuid),
 public.ob_adisyon_analytics(text,integer)
from public,anon,authenticated;
grant execute on function
 public.ob_adisyon_owner(text),public.ob_adisyon_permission(text,text,text),
 public.ob_adisyon_my_venues(),public.ob_adisyon_staff_list(text),
 public.ob_adisyon_staff_assign(text,text,text),
 public.ob_adisyon_table_security(text),
 public.ob_adisyon_table_code_action(text,integer,text),
 public.ob_adisyon_move_ticket(text,uuid,integer),
 public.ob_adisyon_split_assign(text,uuid,uuid,text,integer),
 public.ob_adisyon_split_view(text,uuid),
 public.ob_adisyon_analytics(text,integer)
to authenticated;
