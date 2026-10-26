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
 if p_status='void' and not public.ob_adisyon_permission(p_venue_id,'review') then
   raise exception 'Siparis iptali icin garson yonetimi yetkisi gerekir';
 end if;
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

CREATE OR REPLACE FUNCTION public.ob_adisyon_table_code_action(p_venue_id text, p_table_no integer, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      values(p_venue_id,i,lpad((mod((get_byte(extensions.gen_random_bytes(4),0)::bigint*16777216+
  get_byte(extensions.gen_random_bytes(4),1)::bigint*65536+
  get_byte(extensions.gen_random_bytes(4),2)::bigint*256+
  get_byte(extensions.gen_random_bytes(4),3)::bigint),1000000))::text,6,'0'))
      on conflict(venue_id,table_no) do nothing;
    end loop;
  end if;
 elsif p_action='rotate' then
  if not public.ob_adisyon_owner(p_venue_id) then raise exception 'Sadece isletme sahibi'; end if;
  if not exists(select 1 from public.ob_adisyon_settings
    where venue_id=p_venue_id and enabled and p_table_no between 1 and table_count)
  then raise exception 'Masa gecersiz'; end if;
  insert into public.ob_adisyon_table_codes(venue_id,table_no,code,updated_at)
  values(p_venue_id,p_table_no,lpad((mod((get_byte(extensions.gen_random_bytes(4),0)::bigint*16777216+
  get_byte(extensions.gen_random_bytes(4),1)::bigint*65536+
  get_byte(extensions.gen_random_bytes(4),2)::bigint*256+
  get_byte(extensions.gen_random_bytes(4),3)::bigint),1000000))::text,6,'0'),now())
  on conflict(venue_id,table_no) do update set code=excluded.code,updated_at=now();
 else raise exception 'Islem gecersiz'; end if;
 return public.ob_adisyon_table_security(p_venue_id);
end $function$
;