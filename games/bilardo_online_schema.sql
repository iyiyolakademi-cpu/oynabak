-- OynaBak multiplayer billiards (two phones, four-digit private rooms).
-- Server controls room membership, turns, shot sequence, and client state writes.
-- Physics remains the existing billiards engine: coordinates are synchronized
-- for casual play and are not a server-certified competition result.
CREATE TABLE IF NOT EXISTS public.ob_bilardo_rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_code text NOT NULL UNIQUE CHECK(room_code ~ '^[0-9]{4}$'),
 venue_id text NOT NULL,
 status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','playing','finished')),
 players jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(players)='array' AND jsonb_array_length(players)<=2),
 turn integer NOT NULL DEFAULT 0 CHECK(turn IN (0,1)),
 shot_no integer NOT NULL DEFAULT 0,
 shot_active boolean NOT NULL DEFAULT false,
 snapshot jsonb,
 frame_no bigint NOT NULL DEFAULT 0,
 last_action jsonb NOT NULL DEFAULT '{}'::jsonb,
 winner integer CHECK(winner IN (0,1)),
 last_seen jsonb NOT NULL DEFAULT '[null,null]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ob_bilardo_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ob_bilardo_rooms FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS ob_bilardo_recent_idx ON public.ob_bilardo_rooms(venue_id,created_at DESC);

CREATE OR REPLACE FUNCTION oynabak_private.ob_bilardo_snapshot(p_room public.ob_bilardo_rooms,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE seat_ int:=-1; i int; clean_players jsonb:='[]'::jsonb;
BEGIN
 FOR i IN 0..jsonb_array_length(p_room.players)-1 LOOP
  IF p_room.players->i->>'token'=p_token::text THEN seat_:=i;END IF;
  clean_players:=clean_players||jsonb_build_array(jsonb_build_object('seat',i,'name',p_room.players->i->>'name'));
 END LOOP;
 IF seat_<0 THEN RAISE EXCEPTION 'Bu bilardo masasında oturumun yok' USING errcode='42501';END IF;
 RETURN jsonb_build_object(
  'room',p_room.room_code,'venue',p_room.venue_id,'seat',seat_,'players',clean_players,
  'status',p_room.status,'turn',p_room.turn,'shot',p_room.shot_no,'active',p_room.shot_active,
  'snapshot',p_room.snapshot,'frame',p_room.frame_no,'last_action',p_room.last_action,
  'winner',p_room.winner,'opponent_online',CASE WHEN jsonb_array_length(p_room.players)<2
    THEN false ELSE coalesce((p_room.last_seen->>(1-seat_))::timestamptz>now()-interval '18 seconds',false) END
 );
END $fn$;

CREATE OR REPLACE FUNCTION public.ob_bilardo_open(
 p_venue_id text,p_name text,p_code text DEFAULT NULL,p_token uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE r public.ob_bilardo_rooms%ROWTYPE; nm text; code_ text; new_token uuid; attempts int;i int;
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM oynabak_private.venues v
  JOIN oynabak_private.assignments a ON a.venue_id=v.id
  JOIN oynabak_private.games g ON g.id=a.game_id
  LEFT JOIN public.ob_venue_features f ON f.venue_id=v.id::text
  WHERE v.id::text=p_venue_id AND v.active AND v.licensed
   AND coalesce(f.games,true) AND g.id='25d9a28b-9b2b-4788-96ee-e9191f2de5d8'::uuid AND g.published
 ) THEN RAISE EXCEPTION 'Bu işletmede Bilardo oyunu açık değil' USING errcode='42501';END IF;
 nm:=left(btrim(coalesce(p_name,'')),18);
 IF length(nm)<2 THEN RAISE EXCEPTION 'Oyuncu adını en az iki karakter yaz';END IF;
 code_:=nullif(btrim(coalesce(p_code,'')),'');
 IF code_ IS NULL THEN
  DELETE FROM public.ob_bilardo_rooms r0 WHERE
   (r0.status='waiting' AND r0.created_at<now()-interval '45 minutes') OR
   (r0.status='finished' AND r0.updated_at<now()-interval '8 hours') OR
   (r0.status='playing' AND r0.updated_at<now()-interval '36 hours');
  IF (SELECT count(*) FROM public.ob_bilardo_rooms WHERE venue_id=p_venue_id AND created_at>now()-interval '1 hour')>=30
   THEN RAISE EXCEPTION 'Çok fazla masa açıldı, daha sonra tekrar dene';END IF;
  new_token:=gen_random_uuid();
  FOR attempts IN 1..50 LOOP
   code_:=lpad((floor(random()*10000)::int)::text,4,'0');
   BEGIN
    INSERT INTO public.ob_bilardo_rooms(room_code,venue_id,players,last_seen)
    VALUES(code_,p_venue_id,jsonb_build_array(jsonb_build_object('name',nm,'token',new_token::text)),
           jsonb_build_array(now(),null))
    RETURNING * INTO r;
    EXIT;
   EXCEPTION WHEN unique_violation THEN CONTINUE;
   END;
  END LOOP;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Oda oluşturulamadı; yeniden dene';END IF;
  RETURN oynabak_private.ob_bilardo_snapshot(r,new_token)||jsonb_build_object('token',new_token::text);
 END IF;
 IF code_ !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Dört rakamlı oda kodunu yaz';END IF;
 SELECT * INTO r FROM public.ob_bilardo_rooms WHERE room_code=code_ AND venue_id=p_venue_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bu kodla Bilardo masası bulunamadı';END IF;
 IF p_token IS NOT NULL THEN
  PERFORM oynabak_private.ob_bilardo_snapshot(r,p_token);
  RETURN oynabak_private.ob_bilardo_snapshot(r,p_token)||jsonb_build_object('token',p_token::text);
 END IF;
 IF r.status<>'waiting' OR jsonb_array_length(r.players)>1 THEN
  RAISE EXCEPTION 'Bu masa dolu veya oyun başlamış';END IF;
 new_token:=gen_random_uuid();
 r.players:=r.players||jsonb_build_array(jsonb_build_object('name',nm,'token',new_token::text));
 r.status:='playing';r.turn:=floor(random()*2)::int;
 r.last_action:=jsonb_build_object('type','joined','first',r.turn);
 r.last_seen:=jsonb_set(r.last_seen,'{1}',to_jsonb(now()));
 UPDATE public.ob_bilardo_rooms SET players=r.players,status=r.status,turn=r.turn,
  last_action=r.last_action,last_seen=r.last_seen,frame_no=frame_no+1,updated_at=now()
 WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_bilardo_snapshot(r,new_token)||jsonb_build_object('token',new_token::text);
END $fn$;

CREATE OR REPLACE FUNCTION public.ob_bilardo_state(p_code text,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE r public.ob_bilardo_rooms%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.ob_bilardo_rooms WHERE room_code=btrim(coalesce(p_code,''));
 IF NOT FOUND THEN RAISE EXCEPTION 'Bilardo masası bulunamadı';END IF;
 RETURN oynabak_private.ob_bilardo_snapshot(r,p_token);
END $fn$;

CREATE OR REPLACE FUNCTION public.ob_bilardo_act(
 p_code text,p_token uuid,p_action text,p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
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
  r.shot_active:=true;r.shot_no:=r.shot_no+1;
  r.last_action:=jsonb_build_object('type','shot','seat',seat_,'shot',r.shot_no);
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
END $fn$;

REVOKE ALL ON FUNCTION public.ob_bilardo_open(text,text,text,uuid),
 public.ob_bilardo_state(text,uuid),public.ob_bilardo_act(text,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_bilardo_open(text,text,text,uuid),
 public.ob_bilardo_state(text,uuid),public.ob_bilardo_act(text,uuid,text,jsonb)
 TO anon,authenticated;
