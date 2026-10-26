CREATE OR REPLACE FUNCTION public.ob_customer_order_status(p_venue_id text, p_order_id uuid, p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.ob_customer_order_requests%rowtype;
begin
 if p_venue_id is null or p_order_id is null or p_token is null then
  return jsonb_build_object('found',false);
 end if;
 select * into r from public.ob_customer_order_requests
 where id=p_order_id and venue_id=p_venue_id and access_token=p_token;
 if not found then return jsonb_build_object('found',false); end if;
 return jsonb_build_object('items_status',
 case when r.ticket_id is not null then (
  select coalesce(jsonb_agg(jsonb_build_object('name',i.name,'status',i.status)
   order by i.created_at),'[]'::jsonb)
  from public.ob_adisyon_items i where i.ticket_id=r.ticket_id
 ) else '[]'::jsonb end,
 'found',true,'id',r.id,'table_no',r.table_no,
   'status',r.status,'total',r.total,'created_at',r.created_at,
   'reject_reason',r.reject_reason,'items',r.items);
end $function$
;

CREATE OR REPLACE FUNCTION public.ob_customer_order_submit(p_venue_id text, p_table_no integer, p_items jsonb, p_note text, p_request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if coalesce((select require_table_code from public.ob_adisyon_settings
  where venue_id=p_venue_id),false) then
  if not exists(select 1 from public.ob_adisyon_table_codes c
    where c.venue_id=p_venue_id and c.table_no=p_table_no
    and c.code=coalesce(p_items->0->>'table_code','')) then
    raise exception 'Masa dogrulama kodu yanlis';
  end if;
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
end $function$
;

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
 ),0),'require_table_code',coalesce((select a.require_table_code
 from public.ob_adisyon_settings a where a.venue_id=p_venue_id and a.enabled),false))
$$;