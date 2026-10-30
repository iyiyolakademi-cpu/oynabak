-- OynaBak two-phone chess, private room credentials and ordered moves.
CREATE TABLE IF NOT EXISTS public.ob_chess_rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_code text NOT NULL UNIQUE CHECK (room_code ~ '^[0-9]{4}$'),
 venue_id text NOT NULL,
 players jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(players)='array' AND jsonb_array_length(players)<=2),
 white_seat int NOT NULL DEFAULT 0 CHECK(white_seat IN(0,1)),
 status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','playing','finished')),
 turn text NOT NULL DEFAULT 'w' CHECK(turn IN ('w','b')),
 moves jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(moves)='array'),
 version int NOT NULL DEFAULT 0,
 last_action jsonb NOT NULL DEFAULT '{}'::jsonb,
 winner text CHECK(winner IN ('w','b')),
 result_reason text,
 draw_offer int CHECK(draw_offer IN (0,1)),
 last_seen jsonb NOT NULL DEFAULT '[null,null]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ob_chess_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ob_chess_rooms FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS ob_chess_recent_idx ON public.ob_chess_rooms (venue_id,created_at DESC);

CREATE OR REPLACE FUNCTION oynabak_private.ob_chess_public_state(p_room public.ob_chess_rooms,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO '' AS $body$
DECLARE seat_ int:=-1;i int; people jsonb:='[]'::jsonb;
BEGIN
 IF p_token IS NULL THEN RAISE EXCEPTION 'Satranç oturumu eksik' USING ERRCODE='42501';END IF;
 FOR i IN 0..jsonb_array_length(p_room.players)-1 LOOP
  IF p_room.players->i->>'token'=p_token::text THEN seat_:=i;END IF;
  people:=people||jsonb_build_array(jsonb_build_object('name',p_room.players->i->>'name','seat',i));
 END LOOP;
 IF seat_ < 0 THEN RAISE EXCEPTION 'Bu satranç odasına erişim yetkin yok' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object(
  'room',p_room.room_code,'venue',p_room.venue_id,'seat',seat_,
  'color',CASE WHEN seat_=p_room.white_seat THEN 'w' ELSE 'b' END,
  'players',people,'white_seat',p_room.white_seat,
  'status',p_room.status,'turn',p_room.turn,
  'moves',p_room.moves,'version',p_room.version,
  'last_action',p_room.last_action,'winner',p_room.winner,'reason',p_room.result_reason,
  'draw_offer',p_room.draw_offer,
  'opponent_online',CASE WHEN jsonb_array_length(p_room.players)<2 THEN false ELSE
   coalesce((p_room.last_seen->>(1-seat_))::timestamptz>now()-interval '24 seconds',false) END
 );
END $body$;

CREATE OR REPLACE FUNCTION public.ob_chess_open(p_venue_id text,p_name text,p_code text DEFAULT NULL,p_token uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $body$
DECLARE r public.ob_chess_rooms%ROWTYPE;nm text;code_ text;secret uuid;n int;
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM oynabak_private.venues v
  JOIN oynabak_private.assignments a ON a.venue_id=v.id
  JOIN oynabak_private.games g ON g.id=a.game_id
  LEFT JOIN public.ob_venue_features f ON f.venue_id=v.id::text
  WHERE v.id::text=p_venue_id AND v.active AND v.licensed
   AND coalesce(f.games,true)
   AND g.id='a4dd1af2-309d-4c90-b7a7-f0e38b230425'::uuid AND g.published
 ) THEN RAISE EXCEPTION 'Bu işletmede Satranç etkin değil' USING ERRCODE='42501';END IF;
 nm:=left(btrim(coalesce(p_name,'')),18);
 IF length(nm)<2 THEN RAISE EXCEPTION 'Oyuncu adın en az iki karakter olmalı';END IF;
 code_:=nullif(btrim(coalesce(p_code,'')),'');
 IF code_ IS NULL THEN
  DELETE FROM public.ob_chess_rooms r0 WHERE
   (r0.status='waiting' AND r0.created_at<now()-interval '45 minutes') OR
   (r0.status='finished' AND r0.updated_at<now()-interval '8 hours') OR
   (r0.status='playing' AND r0.updated_at<now()-interval '48 hours');
  IF (SELECT count(*) FROM public.ob_chess_rooms WHERE venue_id=p_venue_id AND created_at>now()-interval '1 hour')>=30
   THEN RAISE EXCEPTION 'Şimdilik yeni oda açılamıyor; biraz sonra dene';END IF;
  secret:=gen_random_uuid();
  FOR n IN 1..50 LOOP
   code_:=lpad((floor(random()*10000)::int)::text,4,'0');
   BEGIN
    INSERT INTO public.ob_chess_rooms(room_code,venue_id,players,white_seat,last_seen)
    VALUES(code_,p_venue_id,jsonb_build_array(jsonb_build_object('name',nm,'token',secret::text)),
           floor(random()*2)::int,jsonb_build_array(now(),null)) RETURNING * INTO r;
    EXIT;
   EXCEPTION WHEN unique_violation THEN CONTINUE;
   END;
  END LOOP;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Satranç odası açılamadı';END IF;
  RETURN oynabak_private.ob_chess_public_state(r,secret)||jsonb_build_object('token',secret::text);
 END IF;
 IF code_ !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Dört haneli oda kodunu gir';END IF;
 SELECT * INTO r FROM public.ob_chess_rooms WHERE room_code=code_ AND venue_id=p_venue_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Satranç odası bulunamadı';END IF;
 IF p_token IS NOT NULL THEN
  PERFORM oynabak_private.ob_chess_public_state(r,p_token);
  RETURN oynabak_private.ob_chess_public_state(r,p_token)||jsonb_build_object('token',p_token::text);
 END IF;
 IF r.status<>'waiting' OR jsonb_array_length(r.players)>1 THEN
  RAISE EXCEPTION 'Bu satranç odası dolu veya maç başladı';END IF;
 secret:=gen_random_uuid();
 r.players:=r.players||jsonb_build_array(jsonb_build_object('name',nm,'token',secret::text));
 r.last_seen:=jsonb_set(r.last_seen,'{1}',to_jsonb(now()));
 r.status:='playing';r.version:=r.version+1;r.last_action:=jsonb_build_object('type','joined');
 UPDATE public.ob_chess_rooms SET players=r.players,last_seen=r.last_seen,status=r.status,
 version=r.version,last_action=r.last_action,updated_at=now()
 WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_chess_public_state(r,secret)||jsonb_build_object('token',secret::text);
END $body$;

CREATE OR REPLACE FUNCTION public.ob_chess_state(p_code text,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO '' AS $body$
DECLARE r public.ob_chess_rooms%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.ob_chess_rooms WHERE room_code=btrim(coalesce(p_code,''));
 IF NOT FOUND THEN RAISE EXCEPTION 'Satranç odası bulunamadı';END IF;
 RETURN oynabak_private.ob_chess_public_state(r,p_token);
END $body$;

CREATE OR REPLACE FUNCTION public.ob_chess_act(p_code text,p_token uuid,p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $body$
DECLARE r public.ob_chess_rooms%ROWTYPE;seat_ int:=-1;i int;color_ text;from_ int;to_ int;promotion_ text;
BEGIN
 IF p_token IS NULL THEN RAISE EXCEPTION 'Satranç oturumu eksik' USING ERRCODE='42501';END IF;
 IF p_action NOT IN ('ping','move','resign','draw_offer','draw_accept','draw_decline') THEN
  RAISE EXCEPTION 'Geçersiz satranç işlemi';END IF;
 SELECT * INTO r FROM public.ob_chess_rooms WHERE room_code=btrim(coalesce(p_code,'')) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Satranç odası bulunamadı';END IF;
 FOR i IN 0..jsonb_array_length(r.players)-1 LOOP
  IF r.players->i->>'token'=p_token::text THEN seat_:=i;EXIT;END IF;
 END LOOP;
 IF seat_<0 THEN RAISE EXCEPTION 'Bu odada oyuncu değilsin' USING ERRCODE='42501';END IF;
 r.last_seen:=jsonb_set(r.last_seen,ARRAY[seat_::text],to_jsonb(now()));
 color_:=CASE WHEN seat_=r.white_seat THEN 'w' ELSE 'b' END;
 IF p_action='ping' THEN
  UPDATE public.ob_chess_rooms SET last_seen=r.last_seen WHERE id=r.id RETURNING * INTO r;
  RETURN oynabak_private.ob_chess_public_state(r,p_token);
 END IF;
 IF r.status<>'playing' THEN RAISE EXCEPTION 'Satranç maçı henüz başlamadı veya sona erdi' USING ERRCODE='42501';END IF;
 IF p_action='move' THEN
  IF r.turn<>color_ THEN RAISE EXCEPTION 'Şu anda sıra sende değil' USING ERRCODE='42501';END IF;
  IF coalesce((p_payload->>'version')::int,-1)<>r.version THEN
   RAISE EXCEPTION 'Hamle sırasında oda güncellendi; yenile';END IF;
  from_:=(p_payload->>'from')::int;to_:=(p_payload->>'to')::int;
  promotion_:=coalesce(p_payload->>'promo','q');
  IF from_ NOT BETWEEN 0 AND 63 OR to_ NOT BETWEEN 0 AND 63 OR from_=to_
     OR promotion_ NOT IN ('q','r','b','n') THEN RAISE EXCEPTION 'Geçersiz satranç hamlesi';END IF;
  IF jsonb_array_length(r.moves)>=300 THEN RAISE EXCEPTION 'Hamle sınırına ulaşıldı';END IF;
  -- The official move rules are replayed by the chess client using the
  -- existing OynaBak legal-move engine; this endpoint enforces identity,
  -- turn ownership, move ordering and atomic version progression.
  r.moves:=r.moves||jsonb_build_array(jsonb_build_object('from',from_,'to',to_,'promo',promotion_));
  r.turn:=CASE WHEN r.turn='w' THEN 'b' ELSE 'w' END;
  r.draw_offer:=NULL;r.version:=r.version+1;
  r.last_action:=jsonb_build_object('type','move','seat',seat_,'index',jsonb_array_length(r.moves));
 ELSIF p_action='resign' THEN
  r.status:='finished';r.winner:=CASE WHEN color_='w' THEN 'b' ELSE 'w' END;
  r.result_reason:='Pes';r.version:=r.version+1;r.last_action:=jsonb_build_object('type','resign','seat',seat_);
 ELSIF p_action='draw_offer' THEN
  IF r.draw_offer IS NOT NULL THEN RAISE EXCEPTION 'Zaten bir beraberlik teklifi var';END IF;
  r.draw_offer:=seat_;r.version:=r.version+1;
  r.last_action:=jsonb_build_object('type','draw_offer','seat',seat_);
 ELSIF p_action='draw_accept' THEN
  IF r.draw_offer IS NULL OR r.draw_offer=seat_ THEN
   RAISE EXCEPTION 'Rakipten gelen bir beraberlik teklifi yok';END IF;
  r.status:='finished';r.winner:=NULL;r.result_reason:='Anlaşmalı beraberlik';r.draw_offer:=NULL;r.version:=r.version+1;
  r.last_action:=jsonb_build_object('type','draw_accept','seat',seat_);
 ELSIF p_action='draw_decline' THEN
  IF r.draw_offer IS NULL OR r.draw_offer=seat_ THEN RAISE EXCEPTION 'Reddedilecek teklif yok';END IF;
  r.draw_offer:=NULL;r.version:=r.version+1;r.last_action:=jsonb_build_object('type','draw_decline','seat',seat_);
 END IF;
 UPDATE public.ob_chess_rooms SET moves=r.moves,turn=r.turn,status=r.status,winner=r.winner,
  result_reason=r.result_reason,draw_offer=r.draw_offer,version=r.version,last_action=r.last_action,
  last_seen=r.last_seen,updated_at=now() WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_chess_public_state(r,p_token);
END $body$;

REVOKE ALL ON FUNCTION public.ob_chess_open(text,text,text,uuid),
 public.ob_chess_state(text,uuid),public.ob_chess_act(text,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_chess_open(text,text,text,uuid),
 public.ob_chess_state(text,uuid),public.ob_chess_act(text,uuid,text,jsonb)
 TO anon,authenticated;
