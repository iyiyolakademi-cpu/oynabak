-- Record only server-confirmed completed Tavla matches.
-- These are anonymous usage events, not verified player identities or reward points.
CREATE OR REPLACE FUNCTION public.ob_tavla_record_finish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
 IF NEW.status='finished' AND OLD.status IS DISTINCT FROM 'finished' THEN
  INSERT INTO public.ob_events(venue_id,event_type,table_no,event_key,game_key,score)
  VALUES (NEW.venue_id,'game_finish',0,'tavla:'||NEW.id::text,'tavla',NULL)
  ON CONFLICT(venue_id,event_type,event_key) DO NOTHING;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.ob_tavla_record_finish() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ob_tavla_completed_stats ON public.ob_tavla_rooms;
CREATE TRIGGER ob_tavla_completed_stats
AFTER UPDATE OF status ON public.ob_tavla_rooms
FOR EACH ROW EXECUTE FUNCTION public.ob_tavla_record_finish();
