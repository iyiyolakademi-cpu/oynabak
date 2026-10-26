CREATE OR REPLACE FUNCTION public.ob_adisyon_add_item(p_venue_id text, p_table_no integer, p_name text, p_unit_price numeric, p_quantity integer DEFAULT 1, p_station text DEFAULT 'kitchen'::text, p_note text DEFAULT ''::text, p_menu_item_id text DEFAULT NULL::text, p_variant_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t_id uuid; item_id uuid; product jsonb; variant jsonb; expected_price numeric;
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
 select i into product
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
 values(t_id,p_venue_id,trim(p_name),p_unit_price,p_quantity,p_station,coalesce(p_note,''),
        p_menu_item_id,p_variant_id,(select auth.uid())) returning id into item_id;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,item_id,action,actor_id,detail)
 values(p_venue_id,t_id,item_id,'add',(select auth.uid()),
   jsonb_build_object('name',p_name,'unit_price',p_unit_price,'quantity',p_quantity));
 return t_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.ob_adisyon_close(p_venue_id text, p_ticket_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare updated_count integer;
begin
 if not public.ob_adisyon_permission(p_venue_id,'close') then raise exception 'Yetkisiz islem'; end if;
 update public.ob_adisyon_tickets set status='closed',closed_at=now(),closed_by=(select auth.uid())
 where id=p_ticket_id and venue_id=p_venue_id and status='open';
 get diagnostics updated_count = row_count;
 if updated_count<>1 then raise exception 'Acik adisyon bulunamadi'; end if;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,action,actor_id,detail)
 values(p_venue_id,p_ticket_id,'close',(select auth.uid()),
 jsonb_build_object('note','Disarida halledildi olarak manuel kapatildi; tahsilat kaydi degildir'));
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.ob_adisyon_item_status(p_venue_id text, p_item_id uuid, p_status text, p_reason text DEFAULT ''::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare row_ public.ob_adisyon_items%rowtype; ticket_status text;
begin
 if not public.ob_adisyon_permission(p_venue_id,'status',(select station from public.ob_adisyon_items where id=p_item_id and venue_id=p_venue_id)) then raise exception 'Yetkisiz islem'; end if;
 if p_status not in ('new','preparing','ready','served','void') then raise exception 'Gecersiz durum'; end if;
 if p_status='void' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Iptal gerekcesi gerekli'; end if;
 select * into row_ from public.ob_adisyon_items where id=p_item_id and venue_id=p_venue_id for update;
 if not found then raise exception 'Urun bulunamadi'; end if;
 select status into ticket_status from public.ob_adisyon_tickets where id=row_.ticket_id for update;
 if ticket_status<>'open' then raise exception 'Kapali adisyon degistirilemez'; end if;
 if row_.status='void' then raise exception 'Iptal edilmis urun degistirilemez'; end if;
 if p_status <> 'void' and not (
   (row_.status='new' and p_status='preparing') or
   (row_.status='preparing' and p_status='ready') or
   (row_.status='ready' and p_status='served')
 ) then raise exception 'Siparis asamalari sirayla ilerlemelidir'; end if;
 update public.ob_adisyon_items set status=p_status,updated_at=now() where id=p_item_id;
 insert into public.ob_adisyon_audit(venue_id,ticket_id,item_id,action,actor_id,detail)
 values(p_venue_id,row_.ticket_id,p_item_id,'status',(select auth.uid()),
 jsonb_build_object('old',row_.status,'new',p_status,'reason',coalesce(p_reason,'')));
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.ob_adisyon_list(p_venue_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ts jsonb; its jsonb;
begin
 if not public.ob_adisyon_permission(p_venue_id,'read') then raise exception 'Yetkisiz islem'; end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.ob_customer_order_decide(p_venue_id text, p_order_id uuid, p_action text, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.ob_customer_order_requests%rowtype;
 t_id uuid; line jsonb; it_id uuid;
begin
 if not public.ob_adisyon_permission(p_venue_id,'review') then
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
    line->>'station',left(trim(concat_ws(' | ',nullif(line->>'variant_name',''),
         nullif(line->>'note',''),nullif(r.customer_note,''))),300),auth.uid())
  returning id into it_id;
  insert into public.ob_adisyon_audit(venue_id,ticket_id,item_id,action,actor_id,detail)
  values(p_venue_id,t_id,it_id,'qr_approved',auth.uid(),jsonb_build_object('request_id',p_order_id));
 end loop;
 update public.ob_customer_order_requests set status='approved',ticket_id=t_id,
 reviewed_by=auth.uid(),reviewed_at=now() where id=p_order_id;
 return jsonb_build_object('status','approved','id',p_order_id,'ticket_id',t_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.ob_customer_orders_list(p_venue_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.ob_adisyon_permission(p_venue_id,'review') then
  raise exception 'Personel girisi gerekli';
 end if;
 if not exists(select 1 from public.ob_adisyon_settings where venue_id=p_venue_id and enabled)
 then raise exception 'Adisyon kapali'; end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at)
 from (select id,venue_id,table_no,status,items,total,customer_note,created_at
       from public.ob_customer_order_requests
       where venue_id=p_venue_id and status='pending'
       order by created_at asc limit 80) t),'[]'::jsonb);
end $function$
;
create or replace function public.ob_adisyon_has_access(p_venue_id text,p_admin_only boolean default false)
returns boolean language plpgsql stable security definer set search_path=''
as $$
begin
 if p_admin_only then return public.ob_adisyon_owner(p_venue_id); end if;
 return public.ob_adisyon_permission(p_venue_id,'read');
end $$;