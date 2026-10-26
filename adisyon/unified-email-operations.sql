create or replace function public.ob_order_station(p_category jsonb,p_item jsonb)
returns text language sql immutable set search_path=''
as $$
select case
 when p_item->>'station' in ('kitchen','bar') then p_item->>'station'
 when p_category->>'station' in ('kitchen','bar') then p_category->>'station'
 when pg_catalog.lower(coalesce(p_category->>'name','')) ~
 '(içecek|icecek|drink|kahve|coffee|cocktail|coctail|kokteyl|shot|bar|çay|cay|bira|beer|şarap|sarap|wine|alkol|alcohol|liqueur|rom|rum|whisky|viski|vodka|gin|soft|meşrubat|mesrubat|şişe|sise|beverage)'
 then 'bar'
 else 'kitchen' end
$$;
revoke all on function public.ob_order_station(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ob_order_station(jsonb,jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.ob_adisyon_add_item(p_venue_id text, p_table_no integer, p_name text, p_unit_price numeric, p_quantity integer DEFAULT 1, p_station text DEFAULT 'kitchen'::text, p_note text DEFAULT ''::text, p_menu_item_id text DEFAULT NULL::text, p_variant_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t_id uuid; item_id uuid; product jsonb; variant jsonb; category_ jsonb; expected_price numeric; station_ text;
begin
 if not public.ob_adisyon_permission(p_venue_id,'add') then raise exception 'Yetkisiz islem'; end if;
 if not exists(select 1 from public.ob_adisyon_settings
    where venue_id=p_venue_id and enabled and p_table_no between 1 and table_count)
 then raise exception 'Masa numarasi gecersiz veya adisyon kapali'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 120
    or p_unit_price is null or p_unit_price<0 or p_unit_price>1000000
    or p_quantity not between 1 and 99 or p_station not in ('kitchen','bar')
    or length(coalesce(p_note,''))>300 then raise exception 'Urun bilgileri gecersiz'; end if;
 -- Fiyat, ad ve varyant MUST match the server-stored digital menu.
 if nullif(trim(coalesce(p_menu_item_id,'')),'') is null then
  raise exception 'Menu urunu secilmelidir';
 end if;
 select i,c into product,category_
 from public.ob_venue_menus m
 cross join lateral jsonb_array_elements(coalesce(m.menu->'categories','[]'::jsonb)) c
 cross join lateral jsonb_array_elements(coalesce(c->'items','[]'::jsonb)) i
 where m.venue_id=p_venue_id
   and i->>'id'=p_menu_item_id
   and coalesce(c->>'active','true')<>'false'
   and coalesce(i->>'active','true')<>'false'
   and coalesce(i->>'sold_out','false')<>'true'
 limit 1;
 if product is null or trim(p_name) is distinct from product->>'name' then
   raise exception 'Urun menude bulunamadi veya ad uyusmuyor';
 end if;
 if nullif(p_variant_id,'') is null then
   expected_price := (product->>'price')::numeric;
 else
   select v into variant
   from jsonb_array_elements(coalesce(product->'variants','[]'::jsonb)) v
   where v->>'id'=p_variant_id limit 1;
   if variant is null then raise exception 'Menu varyanti bulunamadi'; end if;
   expected_price := (variant->>'price')::numeric;
 end if;
 if expected_price is null or round(expected_price,2) <> round(p_unit_price,2) then
  raise exception 'Menu fiyati degismis olabilir; menuyu yenileyip tekrar deneyin';
 end if;
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
 values(t_id,p_venue_id,trim(p_name),p_unit_price,p_quantity,public.ob_order_station(category_,product),coalesce(p_note,''),
        p_menu_item_id,p_variant_id,(select auth.uid())) returning id into item_id;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,item_id,action,actor_id,detail)
 values(p_venue_id,t_id,item_id,'add',(select auth.uid()),
   jsonb_build_object('name',p_name,'unit_price',p_unit_price,'quantity',p_quantity));
 return t_id;
end $function$;

CREATE OR REPLACE FUNCTION public.ob_adisyon_close(p_venue_id text, p_ticket_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare updated_count integer;
begin
 if not public.ob_adisyon_permission(p_venue_id,'close') then raise exception 'Yetkisiz islem'; end if;
 if exists(select 1 from public.ob_adisyon_items where ticket_id=p_ticket_id and venue_id=p_venue_id and status in ('new','preparing','ready')) then raise exception 'Hazirlanmamis veya servis edilmemis urunler var. Once tamamlayin ya da gerekceyle iptal edin'; end if;
 update public.ob_adisyon_tickets set status='closed',closed_at=now(),closed_by=(select auth.uid())
 where id=p_ticket_id and venue_id=p_venue_id and status='open';
 get diagnostics updated_count = row_count;
 if updated_count<>1 then raise exception 'Acik adisyon bulunamadi'; end if;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,action,actor_id,detail)
 values(p_venue_id,p_ticket_id,'close',(select auth.uid()),
 jsonb_build_object('note','Disarida halledildi olarak manuel kapatildi; tahsilat kaydi degildir'));
 return true;
end $function$;

CREATE OR REPLACE FUNCTION public.ob_adisyon_set_enabled(p_venue_id text, p_enabled boolean, p_table_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.ob_adisyon_has_access(p_venue_id,true) then raise exception 'Yetkisiz islem'; end if;
 if p_venue_id is null or p_table_count is null or p_table_count not between 1 and 200 then
  raise exception 'Gecersiz isletme veya masa sayisi';
 end if;
 if not exists (select 1 from oynabak_private.venues v where v.id::text=p_venue_id) then
  raise exception 'Isletme bulunamadi';
 end if;
 insert into public.ob_adisyon_settings(venue_id,enabled,table_count)
 values(p_venue_id,p_enabled,p_table_count)
 on conflict(venue_id) do update
  set enabled=excluded.enabled,table_count=excluded.table_count,updated_at=now(),
   staff_pin_enabled=case when excluded.enabled
      then public.ob_adisyon_settings.staff_pin_enabled else false end,
   simple_console_enabled=false, staff_pin_enabled=false;
 if not p_enabled then
  update public.ob_staff_pin_devices set unlocked_until=null where venue_id=p_venue_id;
  update public.ob_staff_pairing_invites set expires_at=now()
   where venue_id=p_venue_id and used_at is null and expires_at>now();
 end if;
 return public.ob_adisyon_status(p_venue_id);
end $function$;

CREATE OR REPLACE FUNCTION public.ob_adisyon_staff_assign(p_venue_id text, p_email text, p_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target uuid;
begin
 if not public.ob_adisyon_owner(p_venue_id) then raise exception 'Isletme sahibi yetkisi gerekli'; end if;
 if p_role not in ('manager','waiter','kitchen','bar','remove') or
 length(trim(coalesce(p_email,''))) not between 5 and 200 then raise exception 'Gecersiz personel bilgisi'; end if;
 if not exists(select 1 from public.ob_adisyon_settings where venue_id=p_venue_id and enabled)
 then raise exception 'Bu isletmede adisyon paketi kapali'; end if;
 select id into target from auth.users where lower(email)=lower(trim(p_email)) and nullif(trim(email),'') is not null and coalesce(is_anonymous,false)=false;
 if target is null then raise exception 'Calisan once OynaBak hesabini olusturmali'; end if;
 if p_role='remove' then
  delete from public.ob_adisyon_staff where venue_id=p_venue_id and user_id=target;
 else
  insert into public.ob_adisyon_staff(venue_id,user_id,staff_role,created_by)
  values(p_venue_id,target,p_role,auth.uid())
  on conflict(venue_id,user_id) do update set staff_role=excluded.staff_role,active=true;
 end if;
 return true;
end $function$;

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
  station:=public.ob_order_station(category,product);
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
end $function$;

CREATE OR REPLACE FUNCTION public.ob_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a oynabak_private.accounts; v jsonb;
begin
 if auth.uid() is null then raise exception 'Giriş yapın.' using errcode='42501'; end if;
 if coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'E-posta ile OynaBak hesabı gerekli'; end if;
 if oynabak_private.is_admin() then return jsonb_build_object('role','admin'); end if;
 select * into a from oynabak_private.accounts where user_id=auth.uid();
 if a.status='active' then select to_jsonb(x) into v from oynabak_private.venues x where id=a.venue_id; end if;
 if a.status is distinct from 'active' and exists(
  select 1 from public.ob_adisyon_staff s
  join public.ob_adisyon_settings x on x.venue_id=s.venue_id
  join oynabak_private.venues loc on loc.id::text=s.venue_id
  where s.user_id=auth.uid() and s.active and x.enabled and loc.active and loc.licensed
 ) then
  return jsonb_build_object('role','staff','account',to_jsonb(a),'venue',null);
 end if;
 return jsonb_build_object('role',case when a.status='active' then 'merchant' else 'pending' end,'account',to_jsonb(a),'venue',v);
end $function$;

CREATE OR REPLACE FUNCTION public.ob_waiter_create(p_venue_id text, p_table_no text, p_request_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_table text := regexp_replace(coalesce(p_table_no,''),'[^0-9]','','g');
  v_type text := lower(trim(coalesce(p_request_type,'')));
begin
  if coalesce(trim(p_venue_id),'')='' then
    raise exception 'İşletme bulunamadı.';
  end if;

  if v_table !~ '^[0-9]{1,3}$' or v_table::int < 1 then
    raise exception 'Geçerli bir masa numarası yaz.';
  end if;

  if not exists(
    select 1 from oynabak_private.venues v
    join public.ob_venue_features f on f.venue_id=v.id::text
    where v.id::text=trim(p_venue_id) and v.active and v.licensed and f.waiter
      and v_table::integer<=coalesce((
       select s.table_count from public.ob_adisyon_settings s
       where s.venue_id=v.id::text and s.enabled),v.tables,0)
  ) then raise exception 'Bu isletmede veya masada garson cagrisi etkin degil'; end if;
  if v_type not in ('waiter','bill','water','napkin') then
    raise exception 'Geçersiz istek türü.';
  end if;

  if exists (
    select 1
      from public.waiter_calls
     where venue_id = trim(p_venue_id)
       and table_no = v_table
       and status = 'pending'
       and created_at > now() - interval '45 seconds'
  ) then
    raise exception 'Bu masa için kısa süre önce bir istek gönderildi. Lütfen biraz bekleyin.';
  end if;

  insert into public.waiter_calls(venue_id,table_no,request_type,status)
  values(trim(p_venue_id),v_table,v_type,'pending')
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.ob_ops_waiter_list(p_venue_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.ob_adisyon_permission(p_venue_id,'review') then raise exception 'Garson yetkisi gerekli'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (
 select w.id,w.venue_id,w.table_no,w.request_type,w.created_at
 from public.waiter_calls w where w.venue_id=p_venue_id and w.status='pending'
 order by w.created_at limit 100
 ) x),'[]'::jsonb);
end $$;
create or replace function public.ob_ops_waiter_done(p_venue_id text,p_call_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if not public.ob_adisyon_permission(p_venue_id,'review') then raise exception 'Garson yetkisi gerekli'; end if;
 update public.waiter_calls set status='done',completed_at=now()
 where id=p_call_id and venue_id=p_venue_id and status='pending';
 if not found then raise exception 'Garson cagrisi zaten tamamlandi veya bulunamadi'; end if;
 return true;
end $$;
revoke all on function public.ob_ops_waiter_list(text),public.ob_ops_waiter_done(text,uuid) from public,anon,authenticated;
grant execute on function public.ob_ops_waiter_list(text),public.ob_ops_waiter_done(text,uuid) to authenticated;


-- Decommission previously published no-login/PIN modes; no device can access operations.
update public.ob_adisyon_settings
 set simple_console_enabled=false,staff_pin_enabled=false,updated_at=now()
 where simple_console_enabled or staff_pin_enabled;
revoke all on function public.ob_simple_venues(),public.ob_simple_request(text,uuid,text),
 public.ob_simple_state(uuid,text),public.ob_simple_decide(uuid,text,uuid,boolean),
 public.ob_simple_item(uuid,text,uuid,text),public.ob_simple_close(uuid,text,uuid),
 public.ob_simple_add(uuid,text,integer,text,text,integer,text),
 public.ob_staff_device_status(),public.ob_staff_device_unlock(text),public.ob_staff_device_pair(text,text),
 public.ob_staff_device_lock() from public,anon,authenticated;
-- Enable waiter calls for Academy's purchased package, not Freed/Ayberk.
insert into public.ob_venue_features(venue_id,games,menu,review,waiter)
select v.id::text,true,true,true,true from oynabak_private.venues v
join public.ob_adisyon_settings a on a.venue_id=v.id::text
where v.name='İyi Yol Akademi' and a.enabled
on conflict(venue_id) do update set waiter=true;
-- Useful indexes for existing ordering queues and busy workspaces.
create index if not exists ob_waiter_calls_open_venue on public.waiter_calls(venue_id,status,created_at) where status='pending';
create index if not exists ob_adisyon_items_open_lookup on public.ob_adisyon_items(venue_id,ticket_id,created_at);
