CREATE OR REPLACE FUNCTION public.ob_simple_request(p_venue_id text, p_id uuid, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  where venue_id=p_venue_id and approved_at is null and revoked_at is null and requested_at>now()-interval '30 minutes')>=5
 then raise exception 'Cihaz talebi sinirina ulasildi. Yoneticiniz bekleyen cihazlari onaylasin';end if;
 if (select count(*) from public.ob_simple_devices
  where venue_id=p_venue_id and requested_at>now()-interval '1 hour')>=15
 then raise exception 'Cok fazla yeni cihaz istegi var'; end if;
 insert into public.ob_simple_devices(id,venue_id,token_hash)
 values(p_id,p_venue_id,encode(extensions.digest(p_token,'sha256'),'hex'));
 return jsonb_build_object('requested',true,'approved',false);
end $function$;

CREATE OR REPLACE FUNCTION public.ob_simple_admin_device(p_venue_id text, p_id uuid, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.ob_staff_is_admin() then raise exception 'Yonetici yetkisi gerekli'; end if;
 if p_action='approve' then
  if not exists(select 1 from public.ob_adisyon_settings where venue_id=p_venue_id
    and enabled and simple_console_enabled) then raise exception 'Hizli ekran kapali'; end if;
  update public.ob_simple_devices set approved_at=now(),approved_by=auth.uid()
  where id=p_id and venue_id=p_venue_id and approved_at is null and revoked_at is null and requested_at>now()-interval '30 minutes';
 elsif p_action='revoke' then
  update public.ob_simple_devices set revoked_at=now()
  where id=p_id and venue_id=p_venue_id and revoked_at is null;
 else raise exception 'Islem gecersiz';end if;
 if not found then raise exception 'Cihaz bulunamadi veya daha once islenmis'; end if;
 return true;
end $function$;

CREATE OR REPLACE FUNCTION public.ob_simple_state(p_id uuid, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.ob_simple_devices%rowtype;vid text; data_ jsonb;
begin
 if p_id is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$'
 then return jsonb_build_object('ok',false,'message','Cihaz kimligi gecersiz'); end if;
 select * into d from public.ob_simple_devices where id=p_id
  and token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then return jsonb_build_object('ok',false,'reset',true); end if;
 if d.revoked_at is not null then return jsonb_build_object('ok',false,'revoked',true); end if;
 if d.approved_at is null then
  if d.requested_at<=now()-interval '30 minutes' then return jsonb_build_object('ok',false,'expired',true); end if;
  return jsonb_build_object('ok',false,'pending',true);
 end if;
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
   simple_console_enabled=case when excluded.enabled
      then public.ob_adisyon_settings.simple_console_enabled else false end;
 if not p_enabled then
  update public.ob_staff_pin_devices set unlocked_until=null where venue_id=p_venue_id;
  update public.ob_staff_pairing_invites set expires_at=now()
   where venue_id=p_venue_id and used_at is null and expires_at>now();
 end if;
 return public.ob_adisyon_status(p_venue_id);
end $function$;