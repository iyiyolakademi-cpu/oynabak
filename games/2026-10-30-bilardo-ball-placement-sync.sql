-- Keep the cue ball start position synchronized for remote animation after a foul.
CREATE OR REPLACE FUNCTION public.ob_bilardo_act(p_code text, p_token uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.ob_bilardo_rooms%ROWTYPE; seat_ integer:=-1;i int;
  balls_ jsonb; b jsonb; next_ int; winner_ int;
BEGIN
 IF p_token IS NULL THEN RAISE EXCEPTION 'Oyuncu oturumu gerekli' USING errcode='42501';END IF;
 IF p_action NOT IN ('ping','shot','frame','finish') THEN RAISE EXCEPTION 'Geçersiz Bilardo işlemi';END IF;
 SELECT * INTO r FROM public.ob_bilardo_rooms WHERE room_code=btrim(coalesce(p_code,'')) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bilardo masası bulunamadı';END IF;
 FOR i IN 0..jsonb_array_length(r.players)-1 LOOP
  IF r.players->i->>'token'=p_token::text THEN seat_:=i;EXIT;END IF;
 END LOOP;
 IF seat_<0 THEN RAISE EXCEPTION 'Bu masada oyuncu değilsin' USING errcode='42501';END IF;
 r.last_seen:=jsonb_set(r.last_seen,ARRAY[seat_::text],to_jsonb(now()));
 IF p_action='ping' THEN
  UPDATE public.ob_bilardo_rooms SET last_seen=r.last_seen WHERE id=r.id RETURNING * INTO r;
  RETURN oynabak_private.ob_bilardo_snapshot(r,p_token);
 END IF;
 IF r.status<>'playing' OR r.turn<>seat_ THEN
  RAISE EXCEPTION 'Şu anda sıra sende değil veya maç sona erdi' USING errcode='42501';END IF;
 IF p_action='shot' THEN
  IF r.shot_active THEN RAISE EXCEPTION 'Önceki vuruş devam ediyor';END IF;
  IF p_payload->>'dx' IS NULL OR p_payload->>'dy' IS NULL OR p_payload->>'speed' IS NULL THEN
   RAISE EXCEPTION 'Eksik vuruş';END IF;
  IF abs((p_payload->>'dx')::numeric)>1.01 OR abs((p_payload->>'dy')::numeric)>1.01
    OR (p_payload->>'speed')::numeric NOT BETWEEN 4 AND 36 THEN
    RAISE EXCEPTION 'Geçersiz vuruş';END IF;
  -- Coordinates are optional for older clients, but validate them together.
  IF p_payload ? 'cx' OR p_payload ? 'cy' THEN
    IF NOT (p_payload ? 'cx' AND p_payload ? 'cy') THEN
      RAISE EXCEPTION 'Beyaz topun başlangıç konumu eksik';END IF;
    IF (p_payload->>'cx')::numeric NOT BETWEEN 56.1 AND 343.9
       OR (p_payload->>'cy')::numeric NOT BETWEEN 95.1 AND 764.9 THEN
      RAISE EXCEPTION 'Geçersiz beyaz top konumu';END IF;
  END IF;
  r.shot_active:=true;r.shot_no:=r.shot_no+1;
  r.last_action:=jsonb_build_object('type','shot','seat',seat_,'shot',r.shot_no, 'dx',(p_payload->>'dx')::numeric, 'dy',(p_payload->>'dy')::numeric, 'speed',(p_payload->>'speed')::numeric, 'cx',(p_payload->>'cx')::numeric, 'cy',(p_payload->>'cy')::numeric);
 ELSIF p_action IN ('frame','finish') THEN
  IF NOT r.shot_active THEN RAISE EXCEPTION 'Aktif vuruş yok';END IF;
  IF coalesce((p_payload->>'shot')::integer,-1)<>r.shot_no THEN RAISE EXCEPTION 'Vuruş numarası uyuşmuyor';END IF;
  balls_:=p_payload->'balls';
  IF balls_ IS NULL OR jsonb_typeof(balls_)<>'array' OR jsonb_array_length(balls_)<>16
    THEN RAISE EXCEPTION 'Oyun masası verisi eksik';END IF;
  FOR b IN SELECT value FROM jsonb_array_elements(balls_) LOOP
   IF jsonb_typeof(b)<>'object' OR b->>'x' IS NULL OR b->>'y' IS NULL OR b->>'potted' IS NULL
      OR abs((b->>'x')::numeric)>4000 OR abs((b->>'y')::numeric)>2000
      THEN RAISE EXCEPTION 'Geçersiz top koordinatı';END IF;
  END LOOP;
  r.snapshot:=p_payload;
  IF p_action='finish' THEN
   next_:=coalesce((p_payload->>'next')::int,-1);
   IF next_ NOT IN (0,1) THEN RAISE EXCEPTION 'Sıra geçersiz';END IF;
   winner_:=NULL;
   IF p_payload->>'winner' IS NOT NULL THEN
    winner_:=(p_payload->>'winner')::int;
    IF winner_ NOT IN (0,1) THEN RAISE EXCEPTION 'Kazanan geçersiz';END IF;
   END IF;
   r.turn:=next_;r.winner:=winner_;
   r.status:=CASE WHEN winner_ IS NULL THEN 'playing' ELSE 'finished' END;
   r.shot_active:=false;
   r.last_action:=jsonb_build_object('type','finished_shot','shot',r.shot_no,'next',r.turn,'winner',winner_);
  END IF;
 END IF;
 UPDATE public.ob_bilardo_rooms SET snapshot=r.snapshot,status=r.status,turn=r.turn,
  shot_no=r.shot_no,shot_active=r.shot_active,last_action=r.last_action,winner=r.winner,
  frame_no=frame_no+1,last_seen=r.last_seen,updated_at=now()
 WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_bilardo_snapshot(r,p_token);
END $function$
;
