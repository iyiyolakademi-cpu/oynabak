-- OynaBak QR menu customer orders: request -> staff review -> existing table tab.
-- Staff alone approves; no payment, card, customer checkout or bank integration.
create table if not exists public.ob_customer_order_requests (
 id uuid primary key default gen_random_uuid(),
 venue_id text not null,
 table_no integer not null check(table_no between 1 and 200),
 request_key uuid not null,
 access_token uuid not null default gen_random_uuid(),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 items jsonb not null check(jsonb_typeof(items)='array'),
 total numeric(14,2) not null check(total >= 0),
 customer_note text not null default '' check(length(customer_note)<=200),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid,
 reject_reason text not null default '',
 ticket_id uuid references public.ob_adisyon_tickets(id),
 unique(venue_id,request_key),
 unique(access_token)
);
create index if not exists ob_customer_pending_venue on public.ob_customer_order_requests(venue_id,status,created_at desc);
create index if not exists ob_customer_table_pending on public.ob_customer_order_requests(venue_id,table_no,created_at desc);

alter table public.ob_customer_order_requests enable row level security;
revoke all on public.ob_customer_order_requests from public,anon,authenticated;

-- Returns feature status only; no private staff or order information exposed.
create or replace function public.ob_customer_order_config(p_venue_id text)
returns jsonb language sql stable security definer set search_path=''
as $$
select jsonb_build_object('enabled',exists (
 select 1 from public.ob_adisyon_settings a
 join oynabak_private.venues v on v.id::text=a.venue_id
 left join public.ob_venue_features f on f.venue_id=a.venue_id
 where a.venue_id=p_venue_id and a.enabled and v.active and v.licensed
 and coalesce(f.menu,true)
 ),'table_count',coalesce((
 select a.table_count from public.ob_adisyon_settings a
 join oynabak_private.venues v on v.id::text=a.venue_id
 left join public.ob_venue_features f on f.venue_id=a.venue_id
 where a.venue_id=p_venue_id and a.enabled and v.active and v.licensed
 and coalesce(f.menu,true)
 ),0))
$$;

create or replace function public.ob_customer_order_submit(
 p_venue_id text,p_table_no integer,p_items jsonb,p_note text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 config jsonb; raw jsonb; product jsonb; vari jsonb; category jsonb;
 clean jsonb:='[]'::jsonb; itm_id text; vari_id text;
 qty int; price numeric(12,2); grand numeric(14,2):=0;
 station text; line jsonb; old public.ob_customer_order_requests%rowtype;
 new_order public.ob_customer_order_requests%rowtype;
begin
 config:=public.ob_customer_order_config(p_venue_id);
 if not coalesce((config->>'enabled')::boolean,false) then
  raise exception 'Bu isletmede QR siparis ozelligi kapali';
 end if;
 if p_table_no is null or p_table_no<1 or p_table_no>coalesce((config->>'table_count')::int,0) then
  raise exception 'Gecerli masa numarasi secin';
 end if;
 if p_request_key is null or p_items is null or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>12
    or length(coalesce(p_note,''))>200 then
  raise exception 'Siparis bilgileri gecersiz';
 end if;

 -- Prevent concurrent requests defeating per-table rate limiting.
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('ob-customer:'||p_venue_id||':'||p_table_no::text,0)
 );
 select * into old from public.ob_customer_order_requests
   where venue_id=p_venue_id and request_key=p_request_key;
 if found then
  return jsonb_build_object('id',old.id,'token',old.access_token,'status',old.status,
    'total',old.total,'table_no',old.table_no);
 end if;
 if exists(select 1 from public.ob_customer_order_requests
     where venue_id=p_venue_id and table_no=p_table_no
       and created_at>now()-interval '20 seconds') then
  raise exception 'Bu masadan yeni siparis icin 20 saniye bekleyin';
 end if;
 if (select count(*) from public.ob_customer_order_requests
     where venue_id=p_venue_id and table_no=p_table_no and status='pending')>=3 then
  raise exception 'Bu masanin bekleyen siparisleri var. Garsonun onayini bekleyin';
 end if;
 if (select count(*) from public.ob_customer_order_requests
     where venue_id=p_venue_id and status='pending')>=40 then
  raise exception 'Siparis yogunlugu nedeniyle lutfen garsonu cagiriniz';
 end if;
 for raw in select value from jsonb_array_elements(p_items)
 loop
  if jsonb_typeof(raw)<>'object' then raise exception 'Urun bicimi gecersiz'; end if;
  itm_id:=nullif(trim(raw->>'item_id'),'');
  vari_id:=nullif(trim(raw->>'variant_id'),'');
  if itm_id is null or length(itm_id)>130
     or length(coalesce(vari_id,''))>130
     or coalesce(raw->>'quantity','')!~'^[0-9]{1,2}$' then
   raise exception 'Urun secimi veya adet gecersiz';
  end if;
  qty:=(raw->>'quantity')::integer;
  if qty<1 or qty>20 or length(coalesce(raw->>'note',''))>180 then
   raise exception 'Urun adedi veya notu gecersiz';
  end if;
  select i,c into product,category
  from public.ob_venue_menus m
  cross join lateral jsonb_array_elements(coalesce(m.menu->'categories','[]'::jsonb)) c
  cross join lateral jsonb_array_elements(coalesce(c->'items','[]'::jsonb)) i
  where m.venue_id=p_venue_id and i->>'id'=itm_id
    and coalesce(c->>'active','true')='true'
    and coalesce(i->>'active','true')='true'
    and coalesce(i->>'sold_out','false')<>'true'
  limit 1;
  if product is null then raise exception 'Menu urunu bulunamadi veya tukendi'; end if;
  if vari_id is null then
   price:=(product->>'price')::numeric;
  else
   select v into vari
   from jsonb_array_elements(coalesce(product->'variants','[]'::jsonb)) v
   where v->>'id'=vari_id limit 1;
   if vari is null then raise exception 'Varyant bulunamadi'; end if;
   price:=(vari->>'price')::numeric;
  end if;
  if price is null or price<0 or price>1000000 or price<>round(price,2) then
   raise exception 'Gecersiz menu fiyati';
  end if;
  grand:=grand+price*qty;
  if grand>100000 then raise exception 'Siparis toplam limiti asildi'; end if;
  station:=case
    when lower(coalesce(category->>'name','')) ~ '(içecek|icecek|drink|kahve|coffee|bar|kokteyl|çay|cay|bira|şarap|sarap|meşrubat|mesrubat)'
    then 'bar' else 'kitchen' end;
  line:=jsonb_build_object('item_id',itm_id,'variant_id',vari_id,
   'name',product->>'name','variant_name',coalesce(vari->>'name',''),
   'quantity',qty,'unit_price',price,'line_total',price*qty,
   'station',station,'note',left(coalesce(raw->>'note',''),180));
  clean:=clean||jsonb_build_array(line);
  vari:=null;
 end loop;
 insert into public.ob_customer_order_requests
 (venue_id,table_no,request_key,items,total,customer_note)
 values(p_venue_id,p_table_no,p_request_key,clean,grand,coalesce(p_note,''))
 returning * into new_order;
 return jsonb_build_object('id',new_order.id,'token',new_order.access_token,
   'status',new_order.status,'total',new_order.total,'table_no',new_order.table_no);
end $$;

create or replace function public.ob_customer_order_status(
 p_venue_id text,p_order_id uuid,p_token uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare r public.ob_customer_order_requests%rowtype;
begin
 if p_venue_id is null or p_order_id is null or p_token is null then
  return jsonb_build_object('found',false);
 end if;
 select * into r from public.ob_customer_order_requests
 where id=p_order_id and venue_id=p_venue_id and access_token=p_token;
 if not found then return jsonb_build_object('found',false); end if;
 return jsonb_build_object('found',true,'id',r.id,'table_no',r.table_no,
   'status',r.status,'total',r.total,'created_at',r.created_at,
   'reject_reason',r.reject_reason,'items',r.items);
end $$;

create or replace function public.ob_customer_orders_list(p_venue_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.ob_adisyon_has_access(p_venue_id) then
  raise exception 'Personel girisi gerekli';
 end if;
 if not exists(select 1 from public.ob_adisyon_settings where venue_id=p_venue_id and enabled)
 then raise exception 'Adisyon kapali'; end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at)
 from (select id,venue_id,table_no,status,items,total,customer_note,created_at
       from public.ob_customer_order_requests
       where venue_id=p_venue_id and status='pending'
       order by created_at asc limit 80) t),'[]'::jsonb);
end $$;

create or replace function public.ob_customer_order_decide(
 p_venue_id text,p_order_id uuid,p_action text,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.ob_customer_order_requests%rowtype;
 t_id uuid; line jsonb; it_id uuid;
begin
 if not public.ob_adisyon_has_access(p_venue_id) then
  raise exception 'Personel girisi gerekli';
 end if;
 if p_action not in ('approve','reject') then raise exception 'Karar gecersiz'; end if;
 select * into r from public.ob_customer_order_requests
  where id=p_order_id and venue_id=p_venue_id and status='pending' for update;
 if not found then raise exception 'Siparis zaten incelendi veya bulunamadi'; end if;
 if not exists(select 1 from public.ob_adisyon_settings
    where venue_id=p_venue_id and enabled and r.table_no between 1 and table_count)
 then raise exception 'Adisyon kapali veya masa gecersiz'; end if;
 if p_action='reject' then
  if length(trim(coalesce(p_reason,'')))<3 or length(p_reason)>200 then
    raise exception 'Red gerekcesi en az 3 karakter olmali';
  end if;
  update public.ob_customer_order_requests set status='rejected',reviewed_by=auth.uid(),
   reviewed_at=now(),reject_reason=left(p_reason,200) where id=p_order_id;
  return jsonb_build_object('status','rejected','id',p_order_id);
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_venue_id||':'||r.table_no::text,0));
 select id into t_id from public.ob_adisyon_tickets
 where venue_id=p_venue_id and table_no=r.table_no and status='open' for update;
 if t_id is null then
  insert into public.ob_adisyon_tickets(venue_id,table_no,opened_by)
  values(p_venue_id,r.table_no,auth.uid()) returning id into t_id;
 end if;
 for line in select value from jsonb_array_elements(r.items)
 loop
  insert into public.ob_adisyon_items(ticket_id,venue_id,menu_item_id,variant_id,name,
   unit_price,quantity,station,note,created_by)
  values(t_id,p_venue_id,line->>'item_id',nullif(line->>'variant_id',''),
    line->>'name',(line->>'unit_price')::numeric,(line->>'quantity')::int,
    line->>'station',trim(concat_ws(' | ',nullif(line->>'variant_name',''),
         nullif(line->>'note',''),nullif(r.customer_note,''))),auth.uid())
  returning id into it_id;
  insert into public.ob_adisyon_audit(venue_id,ticket_id,item_id,action,actor_id,detail)
  values(p_venue_id,t_id,it_id,'qr_approved',auth.uid(),jsonb_build_object('request_id',p_order_id));
 end loop;
 update public.ob_customer_order_requests set status='approved',ticket_id=t_id,
 reviewed_by=auth.uid(),reviewed_at=now() where id=p_order_id;
 return jsonb_build_object('status','approved','id',p_order_id,'ticket_id',t_id);
end $$;

revoke all on function
 public.ob_customer_order_config(text),
 public.ob_customer_order_submit(text,integer,jsonb,text,uuid),
 public.ob_customer_order_status(text,uuid,uuid),
 public.ob_customer_orders_list(text),
 public.ob_customer_order_decide(text,uuid,text,text)
from public,anon,authenticated;
grant execute on function public.ob_customer_order_config(text),
 public.ob_customer_order_submit(text,integer,jsonb,text,uuid),
 public.ob_customer_order_status(text,uuid,uuid) to anon,authenticated;
grant execute on function public.ob_customer_orders_list(text),
 public.ob_customer_order_decide(text,uuid,text,text) to authenticated;
