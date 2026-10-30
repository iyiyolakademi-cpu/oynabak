-- Preserve goal scorer before overwriting score fields.
CREATE OR REPLACE FUNCTION public.ob_goal_act(p_code text, p_token uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.ob_goal_rooms%ROWTYPE;seat_ int:=-1;i int;player_ int;vx_ numeric;vy_ numeric;arr jsonb;obj jsonb;
new_blue int;new_red int;winner_ int;next_ int;
BEGIN
 IF p_token IS NULL THEN RAISE EXCEPTION 'Oturum eksik' USING ERRCODE='42501';END IF;
 IF p_action NOT IN('ping','shot','finish','resign') THEN RAISE EXCEPTION 'Geçersiz Gol Arena işlemi';END IF;
 SELECT * INTO r FROM public.ob_goal_rooms WHERE room_code=btrim(coalesce(p_code,'')) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Gol Arena odası bulunamadı';END IF;
 FOR i IN 0..jsonb_array_length(r.players)-1 LOOP
  IF r.players->i->>'token'=p_token::text THEN seat_:=i;EXIT;END IF;
 END LOOP;
 IF seat_<0 THEN RAISE EXCEPTION 'Bu odada oyuncu değilsin' USING ERRCODE='42501';END IF;
 r.last_seen:=jsonb_set(r.last_seen,ARRAY[seat_::text],to_jsonb(now()));
 IF p_action='ping' THEN
  UPDATE public.ob_goal_rooms SET last_seen=r.last_seen WHERE id=r.id RETURNING * INTO r;
  RETURN oynabak_private.ob_goal_public_state(r,p_token);
 END IF;
 IF r.status<>'playing' THEN RAISE EXCEPTION 'Maç başlamadı veya tamamlandı' USING ERRCODE='42501';END IF;
 IF p_action='resign' THEN
  r.status:='finished';r.winner:=1-seat_;r.active:=false;
  r.last_action:=jsonb_build_object('type','resign','seat',seat_);
 ELSIF p_action='shot' THEN
  IF r.turn<>seat_ OR r.active THEN RAISE EXCEPTION 'Şu anda sıra sende değil' USING ERRCODE='42501';END IF;
  IF coalesce((p_payload->>'version')::int,-1)<>r.version THEN
   RAISE EXCEPTION 'Masa güncellendi; yeniden dene';END IF;
  player_:=(p_payload->>'player')::int;vx_:=(p_payload->>'vx')::numeric;vy_:=(p_payload->>'vy')::numeric;
  IF player_ NOT BETWEEN 0 AND 9 OR (seat_=r.blue_seat AND player_>=5)
    OR (seat_<>r.blue_seat AND player_<5) THEN RAISE EXCEPTION 'Bu oyuncu senin takımında değil';END IF;
  IF vx_ IS NULL OR vy_ IS NULL OR vx_^2+vy_^2>35^2 OR vx_^2+vy_^2<1 THEN RAISE EXCEPTION 'Geçersiz vuruş';END IF;
  r.active:=true;r.shot_no:=r.shot_no+1;
  r.last_action:=jsonb_build_object('type','shot','shot',r.shot_no,'player',player_,'vx',vx_,'vy',vy_);
 ELSIF p_action='finish' THEN
  IF r.turn<>seat_ OR NOT r.active THEN RAISE EXCEPTION 'Vuruş hakkın yok' USING ERRCODE='42501';END IF;
  IF coalesce((p_payload->>'shot')::int,-1)<>r.shot_no THEN RAISE EXCEPTION 'Vuruş numarası uyuşmuyor';END IF;
  arr:=p_payload->'pieces';
  IF arr IS NULL OR jsonb_typeof(arr)<>'array' OR jsonb_array_length(arr)<>11 THEN RAISE EXCEPTION 'Saha konumları eksik';END IF;
  FOR obj IN SELECT value FROM jsonb_array_elements(arr) LOOP
   IF jsonb_typeof(obj)<>'object' OR obj->>'x' IS NULL OR obj->>'y' IS NULL OR
      abs((obj->>'x')::numeric)>1800 OR abs((obj->>'y')::numeric)>1300
      THEN RAISE EXCEPTION 'Geçersiz saha koordinatı';END IF;
  END LOOP;
  new_blue:=coalesce((p_payload->>'score_blue')::int,-1);
  new_red:=coalesce((p_payload->>'score_red')::int,-1);
  IF new_blue NOT BETWEEN r.score_blue AND r.score_blue+1 OR new_red NOT BETWEEN r.score_red AND r.score_red+1
     OR (new_blue-r.score_blue)+(new_red-r.score_red)>1 THEN RAISE EXCEPTION 'Geçersiz skor';END IF;
  r.last_action:=jsonb_build_object('type','finished','shot',r.shot_no,'scored',CASE WHEN new_blue>r.score_blue THEN 'blue' WHEN new_red>r.score_red THEN 'red' ELSE NULL END);
  r.score_blue:=new_blue;r.score_red:=new_red;r.snapshot:=p_payload;
  next_:=1-r.turn;r.turn:=next_;
  IF greatest(new_blue,new_red)>=r.goal_target THEN
   r.status:='finished';r.winner:=CASE WHEN new_blue>new_red THEN r.blue_seat ELSE 1-r.blue_seat END;
  END IF;
  r.active:=false;

 END IF;
 r.version:=r.version+1;
 UPDATE public.ob_goal_rooms SET status=r.status,turn=r.turn,active=r.active,shot_no=r.shot_no,
  snapshot=r.snapshot,version=r.version,last_action=r.last_action,winner=r.winner,
  score_blue=r.score_blue,score_red=r.score_red,last_seen=r.last_seen,updated_at=now()
  WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_goal_public_state(r,p_token);
END $function$
;
