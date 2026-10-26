-- OynaBak Adisyon (siparis ve masa yonetimi, odeme/tahsilat YOK)
-- Bu dosya yalnizca OynaBak Supabase projesine yonetici tarafindan uygulanmalidir.
-- Projenin mevcut public.ob_me() RPC'sini kimlik/yetki kaynagi olarak kullanir.
create extension if not exists pgcrypto;

create table if not exists public.ob_adisyon_settings (
 venue_id text primary key,
 enabled boolean not null default false,
 table_count integer not null default 1 check (table_count between 1 and 200),
 updated_at timestamptz not null default now()
);
create table if not exists public.ob_adisyon_tickets (
 id uuid primary key default gen_random_uuid(),
 venue_id text not null,
 table_no integer not null check (table_no between 1 and 200),
 status text not null default 'open' check (status in ('open','closed')),
 opened_at timestamptz not null default now(),
 closed_at timestamptz,
 opened_by uuid not null,
 closed_by uuid
);
create unique index if not exists ob_adisyon_one_open_per_table
 on public.ob_adisyon_tickets(venue_id,table_no) where status='open';
create index if not exists ob_adisyon_tickets_history
 on public.ob_adisyon_tickets(venue_id,opened_at desc);

create table if not exists public.ob_adisyon_items (
 id uuid primary key default gen_random_uuid(),
 venue_id text not null,
 ticket_id uuid not null references public.ob_adisyon_tickets(id),
 menu_item_id text,
 variant_id text,
 name text not null check(length(name) between 1 and 120),
 unit_price numeric(12,2) not null check(unit_price >= 0 and unit_price <= 1000000),
 quantity integer not null check(quantity between 1 and 99),
 line_total numeric(14,2) generated always as (unit_price * quantity) stored,
 station text not null default 'kitchen' check(station in ('kitchen','bar')),
 note text not null default '' check(length(note)<=300),
 status text not null default 'new' check(status in ('new','preparing','ready','served','void')),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists ob_adisyon_items_ticket on public.ob_adisyon_items(ticket_id);
create index if not exists ob_adisyon_items_venue on public.ob_adisyon_items(venue_id,status);

create table if not exists public.ob_adisyon_audit (
 id bigint generated always as identity primary key,
 venue_id text not null,
 ticket_id uuid,
 item_id uuid,
 action text not null,
 actor_id uuid not null,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists ob_adisyon_audit_venue on public.ob_adisyon_audit(venue_id,created_at desc);

-- Diger isletmelerin adisyonlari gorulmesin. ob_me sunucu tarafindaki
-- varolan yetki RPC'sidir. user_metadata gibi degistirilebilir alanlar kullanilmaz.
create or replace function public.ob_adisyon_has_access(p_venue_id text, p_admin_only boolean default false)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare ctx jsonb; role_name text; user_venue text;
begin
 if (select auth.uid()) is null then return false; end if;
 select to_jsonb(public.ob_me()) into ctx;
 role_name := ctx->>'role';
 user_venue := ctx->'venue'->>'id';
 if role_name='admin' then return true; end if;
 return not p_admin_only and role_name='merchant' and user_venue = p_venue_id;
exception when others then return false;
end $$;

revoke all on function public.ob_adisyon_has_access(text,boolean) from public,anon;
grant execute on function public.ob_adisyon_has_access(text,boolean) to authenticated;

alter table public.ob_adisyon_settings enable row level security;
alter table public.ob_adisyon_tickets enable row level security;
alter table public.ob_adisyon_items enable row level security;
alter table public.ob_adisyon_audit enable row level security;
drop policy if exists ob_adisyon_settings_read on public.ob_adisyon_settings;
create policy ob_adisyon_settings_read on public.ob_adisyon_settings for select to authenticated
 using (public.ob_adisyon_has_access(venue_id));
drop policy if exists ob_adisyon_tickets_read on public.ob_adisyon_tickets;
create policy ob_adisyon_tickets_read on public.ob_adisyon_tickets for select to authenticated
 using (public.ob_adisyon_has_access(venue_id));
drop policy if exists ob_adisyon_items_read on public.ob_adisyon_items;
create policy ob_adisyon_items_read on public.ob_adisyon_items for select to authenticated
 using (public.ob_adisyon_has_access(venue_id));
drop policy if exists ob_adisyon_audit_read on public.ob_adisyon_audit;
create policy ob_adisyon_audit_read on public.ob_adisyon_audit for select to authenticated
 using (public.ob_adisyon_has_access(venue_id));

-- Client sadece RPC'ler uzerinden degisiklik yapabilir. Dogrudan INSERT/UPDATE/DELETE yok.
revoke all on public.ob_adisyon_settings,public.ob_adisyon_tickets,public.ob_adisyon_items,public.ob_adisyon_audit from anon,authenticated;
grant select on public.ob_adisyon_settings,public.ob_adisyon_tickets,public.ob_adisyon_items,public.ob_adisyon_audit to authenticated;

create or replace function public.ob_adisyon_status(p_venue_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare s public.ob_adisyon_settings%rowtype;
begin
 if not public.ob_adisyon_has_access(p_venue_id) then return jsonb_build_object('allowed',false,'enabled',false); end if;
 select * into s from public.ob_adisyon_settings where venue_id=p_venue_id;
 return jsonb_build_object('allowed',true,'enabled',coalesce(s.enabled,false),
   'table_count',coalesce(s.table_count,1),'can_manage',public.ob_adisyon_has_access(p_venue_id,true));
end $$;

create or replace function public.ob_adisyon_set_enabled(p_venue_id text,p_enabled boolean,p_table_count integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
 if not public.ob_adisyon_has_access(p_venue_id,true) then raise exception 'Yetkisiz islem'; end if;
 if p_venue_id is null or length(p_venue_id)<3 or p_table_count not between 1 and 200 then
  raise exception 'Gecersiz isletme veya masa sayisi';
 end if;
 insert into public.ob_adisyon_settings(venue_id,enabled,table_count)
 values(p_venue_id,p_enabled,p_table_count)
 on conflict(venue_id) do update
  set enabled=excluded.enabled,table_count=excluded.table_count,updated_at=now();
 return public.ob_adisyon_status(p_venue_id);
end $$;

create or replace function public.ob_adisyon_list(p_venue_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare ts jsonb; its jsonb;
begin
 if not public.ob_adisyon_has_access(p_venue_id) then raise exception 'Yetkisiz islem'; end if;
 if not exists(select 1 from public.ob_adisyon_settings where venue_id=p_venue_id and enabled)
 then raise exception 'Adisyon bu isletmede aktif degil'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.opened_at desc),'[]'::jsonb) into ts
 from (select id,venue_id,table_no,status,opened_at,closed_at
       from public.ob_adisyon_tickets where venue_id=p_venue_id
       order by opened_at desc limit 200) t;
 select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb) into its
 from (select id,ticket_id,venue_id,name,quantity,unit_price,line_total,status,
              station,note,menu_item_id,variant_id,created_at,updated_at
       from public.ob_adisyon_items where venue_id=p_venue_id
       and ticket_id in (select id from public.ob_adisyon_tickets
          where venue_id=p_venue_id order by opened_at desc limit 200)) i;
 return jsonb_build_object('tickets',ts,'items',its);
end $$;

create or replace function public.ob_adisyon_add_item(
 p_venue_id text,p_table_no integer,p_name text,p_unit_price numeric,
 p_quantity integer default 1,p_station text default 'kitchen',
 p_note text default '',p_menu_item_id text default null,p_variant_id text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare t_id uuid; item_id uuid;
begin
 if not public.ob_adisyon_has_access(p_venue_id) then raise exception 'Yetkisiz islem'; end if;
 if not exists(select 1 from public.ob_adisyon_settings
    where venue_id=p_venue_id and enabled and p_table_no between 1 and table_count)
 then raise exception 'Masa numarasi gecersiz veya adisyon kapali'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 120
    or p_unit_price is null or p_unit_price<0 or p_unit_price>1000000
    or p_quantity not between 1 and 99 or p_station not in ('kitchen','bar')
    or length(coalesce(p_note,''))>300 then raise exception 'Urun bilgileri gecersiz'; end if;
 -- Garsonun eszamanli iki ekrandan ayni masaya ekleme yapmasini guvenli kilar.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_venue_id||':'||p_table_no,0));
 select id into t_id from public.ob_adisyon_tickets
   where venue_id=p_venue_id and table_no=p_table_no and status='open' for update;
 if t_id is null then
   insert into public.ob_adisyon_tickets(venue_id,table_no,opened_by)
   values(p_venue_id,p_table_no,(select auth.uid())) returning id into t_id;
 end if;
 insert into public.ob_adisyon_items
  (ticket_id,venue_id,name,unit_price,quantity,station,note,menu_item_id,variant_id,created_by)
 values(t_id,p_venue_id,trim(p_name),p_unit_price,p_quantity,p_station,coalesce(p_note,''),
        p_menu_item_id,p_variant_id,(select auth.uid())) returning id into item_id;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,item_id,action,actor_id,detail)
 values(p_venue_id,t_id,item_id,'add',(select auth.uid()),
   jsonb_build_object('name',p_name,'unit_price',p_unit_price,'quantity',p_quantity));
 return t_id;
end $$;

create or replace function public.ob_adisyon_item_status(
 p_venue_id text,p_item_id uuid,p_status text,p_reason text default '')
returns boolean language plpgsql security definer set search_path=''
as $$
declare row_ public.ob_adisyon_items%rowtype; ticket_status text;
begin
 if not public.ob_adisyon_has_access(p_venue_id) then raise exception 'Yetkisiz islem'; end if;
 if p_status not in ('new','preparing','ready','served','void') then raise exception 'Gecersiz durum'; end if;
 if p_status='void' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Iptal gerekcesi gerekli'; end if;
 select * into row_ from public.ob_adisyon_items where id=p_item_id and venue_id=p_venue_id for update;
 if not found then raise exception 'Urun bulunamadi'; end if;
 select status into ticket_status from public.ob_adisyon_tickets where id=row_.ticket_id for update;
 if ticket_status<>'open' then raise exception 'Kapali adisyon degistirilemez'; end if;
 if row_.status='void' then raise exception 'Iptal edilmis urun degistirilemez'; end if;
 update public.ob_adisyon_items set status=p_status,updated_at=now() where id=p_item_id;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,item_id,action,actor_id,detail)
 values(p_venue_id,row_.ticket_id,p_item_id,'status',(select auth.uid()),
 jsonb_build_object('old',row_.status,'new',p_status,'reason',coalesce(p_reason,'')));
 return true;
end $$;

create or replace function public.ob_adisyon_close(p_venue_id text,p_ticket_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare updated_count integer;
begin
 if not public.ob_adisyon_has_access(p_venue_id) then raise exception 'Yetkisiz islem'; end if;
 update public.ob_adisyon_tickets set status='closed',closed_at=now(),closed_by=(select auth.uid())
 where id=p_ticket_id and venue_id=p_venue_id and status='open';
 get diagnostics updated_count = row_count;
 if updated_count<>1 then raise exception 'Acik adisyon bulunamadi'; end if;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,action,actor_id,detail)
 values(p_venue_id,p_ticket_id,'close',(select auth.uid()),
 jsonb_build_object('note','Disarida halledildi olarak manuel kapatildi; tahsilat kaydi degildir'));
 return true;
end $$;

revoke all on function
 public.ob_adisyon_status(text),
 public.ob_adisyon_set_enabled(text,boolean,integer),
 public.ob_adisyon_list(text),
 public.ob_adisyon_add_item(text,integer,text,numeric,integer,text,text,text,text),
 public.ob_adisyon_item_status(text,uuid,text,text),
 public.ob_adisyon_close(text,uuid)
from public,anon;
grant execute on function
 public.ob_adisyon_status(text),
 public.ob_adisyon_set_enabled(text,boolean,integer),
 public.ob_adisyon_list(text),
 public.ob_adisyon_add_item(text,integer,text,numeric,integer,text,text,text,text),
 public.ob_adisyon_item_status(text,uuid,text,text),
 public.ob_adisyon_close(text,uuid) to authenticated;

-- Bilgi: fiyat snapshot'i sadece yetkili personel tarafindan eklenebilir;
-- ilk surumde fiyatlar menuden arayuze alinip burada kaydedilir.
-- Sistem muhasebe/gercek tahsilat kaydi olusturmaz.
