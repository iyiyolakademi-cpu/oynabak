-- Allow all explicitly enabled OynaBak business IDs on Pişti rooms.
-- Actual business status, license, game feature and Pişti permission are checked by ob_pisti_open_v2.
ALTER TABLE public.ob_pisti_rooms DROP CONSTRAINT ob_pisti_rooms_venue_id_check;
ALTER TABLE public.ob_pisti_rooms ADD CONSTRAINT ob_pisti_rooms_venue_id_check
 CHECK (venue_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
