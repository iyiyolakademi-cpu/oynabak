-- 27 Oct 2026: final public QR, image and plan input guards
-- No existing saved QR codes, floor maps, or asset IDs are changed.
CREATE OR REPLACE FUNCTION public.ob_adisyon_floor_save(p_venue_id text, p_positions jsonb, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer; rec record; seen integer[]:='{}'::integer[];
 new_version integer;
begin
 if not public.ob_adisyon_owner(p_venue_id) then
  raise exception 'Masa planini sadece isletme yoneticisi kaydedebilir';
 end if;
 select table_count into n from public.ob_adisyon_settings
  where venue_id=p_venue_id and enabled for share;
 if n is null or n not between 1 and 200 then raise exception 'Adisyon paketi kapali'; end if;
 if p_positions is null or jsonb_typeof(p_positions)<>'array'
    or jsonb_array_length(p_positions)<>n then
  raise exception 'Plan butun masalari birer kez icermeli'; end if;
 for rec in select value as item from jsonb_array_elements(p_positions)
 loop
  if jsonb_typeof(rec.item)<>'object'
   or jsonb_typeof(rec.item->'table')<>'number'
   or jsonb_typeof(rec.item->'x')<>'number'
   or jsonb_typeof(rec.item->'y')<>'number'
   or (rec.item->>'table') !~ '^[0-9]{1,3}$'
   or (rec.item->>'x') !~ '^[0-9]+([.][0-9]+)?$'
   or (rec.item->>'y') !~ '^[0-9]+([.][0-9]+)?$'
  then raise exception 'Masa koordinatlari veya numarasi gecersiz'; end if;
  if (rec.item->>'table')::integer not between 1 and n
   or (rec.item->>'table')::integer=any(seen)
   or (rec.item->>'x')::numeric not between 0 and 100
   or (rec.item->>'y')::numeric not between 0 and 100 then
   raise exception 'Masa numarasi tekrarlaniyor veya konumu sinir disinda'; end if;
  seen:=array_append(seen,(rec.item->>'table')::integer);
 end loop;
 -- Reject duplicate physical positions from direct API clients as well as UI drag saves.
 if exists (
  select 1 from pg_catalog.jsonb_array_elements(p_positions) a,
                pg_catalog.jsonb_array_elements(p_positions) b
  where (a->>'table')::integer < (b->>'table')::integer
    and pg_catalog.abs((a->>'x')::numeric-(b->>'x')::numeric)<0.5
    and pg_catalog.abs((a->>'y')::numeric-(b->>'y')::numeric)<0.5
 ) then
   raise exception 'Masalar birbiriyle cakisiyor. Kaydetmeden once ayirin';
 end if;
 if p_expected_version=0 then
  insert into public.ob_adisyon_floor_plans(venue_id,positions,version,updated_by)
  values(p_venue_id,p_positions,1,auth.uid()) on conflict do nothing
  returning version into new_version;
 else
  update public.ob_adisyon_floor_plans set
   positions=p_positions,version=version+1,updated_at=now(),updated_by=auth.uid()
  where venue_id=p_venue_id and version=p_expected_version
  returning version into new_version;
 end if;
 if new_version is null then
  raise exception 'Masa plani baska cihazda degistirildi. Yenileyip tekrar deneyin';
 end if;
 return jsonb_build_object('positions',p_positions,'version',new_version);
end $function$
;
CREATE OR REPLACE FUNCTION public.ob_code_resolve(p_code text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.venue_id
  from public.ob_venue_codes c
  join oynabak_private.venues venue on venue.id::text=c.venue_id
  where venue.active and venue.licensed
    and c.code = upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9]','','g'))
  limit 1;
$function$
;
CREATE OR REPLACE FUNCTION public.ob_game_media_many(gids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 IF gids IS NULL OR pg_catalog.cardinality(gids)>64 OR
    EXISTS (SELECT 1 FROM pg_catalog.unnest(gids) AS u(gid)
            WHERE u.gid IS NULL OR pg_catalog.length(u.gid)<1
            OR pg_catalog.length(u.gid)>160)
 THEN RETURN '{}'::jsonb; END IF;
 SELECT pg_catalog.coalesce(
  pg_catalog.jsonb_object_agg(m.game_id,
   pg_catalog.jsonb_build_object('image_data',m.image_data)),'{}'::jsonb)
 INTO result
 FROM public.ob_game_media m
 WHERE m.game_id=ANY(gids);
 RETURN pg_catalog.coalesce(result,'{}'::jsonb);
END;
$function$;
