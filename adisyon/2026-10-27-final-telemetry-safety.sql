-- Anonymous telemetry is a customer UI feature, not proof of visits or payment.
-- Prevent arbitrary tenant IDs and runaway write volume from polluting venue statistics.
CREATE OR REPLACE FUNCTION public.ob_event_v3(
  vid text,et text,t integer,k text,g text DEFAULT NULL,s integer DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v text:=pg_catalog.btrim(coalesce(vid,''));
  ev text:=pg_catalog.btrim(coalesce(et,''));
  key_ text:=pg_catalog.btrim(coalesce(k,''));
BEGIN
 IF v='' OR pg_catalog.length(v)>120 OR key_='' OR pg_catalog.length(key_)>180
 OR ev NOT IN ('qr_open','games_open','review_click','game_open','game_finish','menu_open','menu_category')
 THEN RETURN false; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM oynabak_private.venues venue
   WHERE venue.id::text=v AND venue.active AND venue.licensed
 ) THEN RETURN false; END IF;
 -- Server-side per-venue soft cap. If exceeded, telemetry can be dropped without
 -- blocking the QR menu or any game. These anonymous metrics are not billable.
 IF (SELECT count(*) FROM public.ob_events
     WHERE venue_id=v AND created_at>pg_catalog.now()-interval '1 minute')>=400
 THEN RETURN false; END IF;
 INSERT INTO public.ob_events(venue_id,event_type,table_no,event_key,game_key,score)
 VALUES(v,ev,greatest(0,least(coalesce(t,0),1000)),key_,
   nullif(pg_catalog.left(coalesce(g,''),140),''),
   CASE WHEN s IS NULL THEN NULL ELSE greatest(0,least(s,100)) END)
 ON CONFLICT(venue_id,event_type,event_key) DO NOTHING;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.ob_event_v3(text,text,integer,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_event_v3(text,text,integer,text,text,integer) TO anon,authenticated;
