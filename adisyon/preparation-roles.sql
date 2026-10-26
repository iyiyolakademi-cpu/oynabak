CREATE OR REPLACE FUNCTION public.ob_adisyon_item_status(p_venue_id text, p_item_id uuid, p_status text, p_reason text DEFAULT ''::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare row_ public.ob_adisyon_items%rowtype; ticket_status text;
begin
 -- Kitchen and bar prepare their own products; waiters can serve and cancel only.
 if not (
  (p_status in ('preparing','ready') and public.ob_adisyon_permission(p_venue_id,'status',
    (select station from public.ob_adisyon_items where id=p_item_id and venue_id=p_venue_id)))
  or (p_status in ('served','void') and public.ob_adisyon_permission(p_venue_id,'review'))
 ) then raise exception 'Bu islem icin personel yetkiniz yok'; end if;
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
