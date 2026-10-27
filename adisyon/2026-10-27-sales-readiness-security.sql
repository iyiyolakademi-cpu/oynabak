-- Production security hardening 27 October 2026.
-- Existing customer-facing anonymous QR APIs remain operational.
-- Tables with RLS but without policies are intentionally RPC-only, NOT made public.
CREATE OR REPLACE FUNCTION public.ob_event_v3(vid text, et text, t integer, k text, g text DEFAULT NULL::text, s integer DEFAULT NULL::integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v text:=pg_catalog.btrim(coalesce(vid,''));
  ev text:=pg_catalog.btrim(coalesce(et,''));
  key_ text:=pg_catalog.btrim(coalesce(k,''));
BEGIN
 IF v='' OR pg_catalog.length(v)>120 OR key_='' OR pg_catalog.length(key_)>180
 OR ev NOT IN ('qr_open','games_open','quote_open','review_click','game_open','game_finish','menu_open','menu_category')
 THEN RETURN false; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM oynabak_private.venues venue
   WHERE venue.id::text=v AND venue.active AND venue.licensed
 ) THEN RETURN false; END IF;
 -- Server-side per-venue soft cap. If exceeded, telemetry can be dropped without
 -- blocking the QR menu or any game. These anonymous metrics are not billable.
 -- Serialize per venue so simultaneous anonymous requests cannot bypass soft cap.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ob-telemetry:'||v,0));
 IF (SELECT count(*) FROM public.ob_events
     WHERE venue_id=v AND created_at>pg_catalog.now()-interval '1 minute')>=400
 THEN RETURN false; END IF;
 INSERT INTO public.ob_events(venue_id,event_type,table_no,event_key,game_key,score)
 VALUES(v,ev,greatest(0,least(coalesce(t,0),1000)),key_,
   nullif(pg_catalog.left(coalesce(g,''),140),''),
   CASE WHEN s IS NULL THEN NULL ELSE greatest(0,least(s,100)) END)
 ON CONFLICT(venue_id,event_type,event_key) DO NOTHING;
 RETURN true;
END $function$
;
CREATE OR REPLACE FUNCTION public.ob_event(vid text,et text,t integer,k text,g text DEFAULT NULL::text,s integer DEFAULT NULL::integer)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT public.ob_event_v3(vid,et,t,k,g,s)
$function$;
CREATE OR REPLACE FUNCTION public.ob_adisyon_permission(p_venue_id text, p_action text, p_station text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare role_name text;
begin
 if auth.uid() is null or p_venue_id is null then return false; end if;
 if not exists(select 1 from public.ob_adisyon_settings
   where venue_id=p_venue_id and enabled) then return false; end if;
 -- A disabled or unlicensed venue must not retain operations access.
 if not exists (select 1 from oynabak_private.venues v
                where v.id::text=p_venue_id and v.active and v.licensed)
 then return false; end if;
 if not public.ob_staff_device_gate(p_venue_id) then return false; end if;
 if public.ob_adisyon_owner(p_venue_id) then return true; end if;
 select s.staff_role into role_name from public.ob_adisyon_staff s
 where s.venue_id=p_venue_id and s.user_id=auth.uid() and s.active;
 if role_name is null then return false; end if;
 if role_name='manager' then return true; end if;
 if role_name='waiter' then return p_action in ('read','add','review','close','move','split'); end if;
 if role_name in ('kitchen','bar') then
  return p_action='read' or
   (p_action='status' and p_station=role_name);
 end if;
 return false;
end $function$
;
CREATE OR REPLACE FUNCTION public.ob_score(vid uuid, g text, s integer, t integer, rid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if vid is null or rid is null or g is null or t is null or s is null
    or s < 0 or s > 100000 then
   raise exception 'Oyun sonucu gecersiz';
 end if;
 -- Demo scores are client-reported, not evidence for rewards or payment.
 perform 1 from oynabak_private.venues where id=vid and active and licensed and g=any(enabled) and t between 1 and tables for update;
 if not found then raise exception 'Sonuç kaydedilemedi.'; end if;
 if exists(select 1 from oynabak_private.results where id=rid) then return; end if;
 -- Bound public writes per venue to 30/minute. Stronger anti-abuse belongs in a server gateway.
 if (select count(*) from oynabak_private.results where venue_id=vid and created_at>now()-interval '1 minute')>=30 then raise exception 'Kayıt limiti doldu. Biraz sonra tekrar deneyin.'; end if;
 insert into oynabak_private.results(id,venue_id,game,score,table_no) values(rid,vid,g,s,t);
end $function$
;
-- Legacy game score reports are untrusted demo telemetry; never authoritative for rewards/payments.
