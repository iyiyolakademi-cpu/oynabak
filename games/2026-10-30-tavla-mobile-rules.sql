
-- OynaBak Tavla: fair opening dice, server-enforced full-turn rules,
-- recoverable 4-digit rooms, token-based presence, safe match summary.
-- Previous rooms remain playable. No special exit/replay feature or sound added.
ALTER TABLE public.ob_tavla_rooms
 DROP CONSTRAINT IF EXISTS ob_tavla_rooms_status_check;
ALTER TABLE public.ob_tavla_rooms ADD CONSTRAINT ob_tavla_rooms_status_check
 CHECK(status IN ('waiting','opening','playing','finished'));
ALTER TABLE public.ob_tavla_rooms
 ADD COLUMN IF NOT EXISTS opening_dice jsonb NOT NULL DEFAULT '[null,null]'::jsonb,
 ADD COLUMN IF NOT EXISTS last_seen jsonb NOT NULL DEFAULT '[null,null]'::jsonb,
 ADD COLUMN IF NOT EXISTS started_at timestamptz,
 ADD COLUMN IF NOT EXISTS ended_at timestamptz,
 ADD COLUMN IF NOT EXISTS completed_moves integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION oynabak_private.ob_tavla_apply_move(
 p_board jsonb,p_bar jsonb,p_off jsonb,p_seat integer,p_from integer,p_to integer
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $fn$
DECLARE b jsonb:=p_board;bars jsonb:=p_bar;offs jsonb:=p_off;
  sign_ int:=CASE WHEN p_seat=0 THEN 1 ELSE -1 END;
  before_ int;target_ int;
BEGIN
 IF p_from=-1 THEN
  bars:=jsonb_set(bars,ARRAY[p_seat::text],to_jsonb((bars->>p_seat)::int-1));
 ELSE
  before_:=(b->>p_from)::int;
  b:=jsonb_set(b,ARRAY[p_from::text],to_jsonb(before_-sign_));
 END IF;
 IF p_to=24 THEN
  offs:=jsonb_set(offs,ARRAY[p_seat::text],to_jsonb((offs->>p_seat)::int+1));
 ELSE
  target_:=(b->>p_to)::int;
  IF target_=-sign_ THEN
   bars:=jsonb_set(bars,ARRAY[(1-p_seat)::text],to_jsonb((bars->>(1-p_seat))::int+1));
   target_:=0;
  END IF;
  b:=jsonb_set(b,ARRAY[p_to::text],to_jsonb(target_+sign_));
 END IF;
 RETURN jsonb_build_object('board',b,'bar',bars,'off',offs);
END $fn$;

CREATE OR REPLACE FUNCTION oynabak_private.ob_tavla_max_moves(
 p_board jsonb,p_bar jsonb,p_off jsonb,p_seat integer,p_dice jsonb
) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $fn$
DECLARE d int; src int;dst int;j int;removed boolean;remaining jsonb;next_ jsonb;best int:=0;candidate int;
BEGIN
 IF jsonb_array_length(p_dice)=0 THEN RETURN 0;END IF;
 FOR d IN SELECT DISTINCT value::text::int FROM jsonb_array_elements(p_dice) LOOP
  remaining:='[]'::jsonb;removed:=false;
  FOR j IN 0..jsonb_array_length(p_dice)-1 LOOP
   IF NOT removed AND (p_dice->>j)::int=d THEN removed:=true;
   ELSE remaining:=remaining||jsonb_build_array((p_dice->>j)::int);
   END IF;
  END LOOP;
  FOR src IN -1..23 LOOP
   dst:=oynabak_private.ob_tavla_legal(p_board,p_bar,p_seat,d,src);
   IF dst IS NULL THEN CONTINUE;END IF;
   next_:=oynabak_private.ob_tavla_apply_move(p_board,p_bar,p_off,p_seat,src,dst);
   candidate:=1+oynabak_private.ob_tavla_max_moves(next_->'board',next_->'bar',next_->'off',p_seat,remaining);
   IF candidate>best THEN best:=candidate;END IF;
   IF best=jsonb_array_length(p_dice) THEN RETURN best;END IF;
  END LOOP;
 END LOOP;
 RETURN best;
END $fn$;

CREATE OR REPLACE FUNCTION oynabak_private.ob_tavla_snapshot(
 p_room public.ob_tavla_rooms,p_token uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO '' AS $fn$
DECLARE seat_ int:=-1;names_ jsonb:='[]'::jsonb;i int; other_ int;
BEGIN
 FOR i IN 0..jsonb_array_length(p_room.players)-1 LOOP
  IF p_room.players->i->>'token'=p_token::text THEN seat_:=i;END IF;
  names_:=names_||jsonb_build_array(jsonb_build_object(
   'name',p_room.players->i->>'name','seat',i));
 END LOOP;
 IF seat_<0 THEN RAISE EXCEPTION 'Bu Tavla odasına erişim iznin yok' USING errcode='42501';END IF;
 other_:=1-seat_;
 RETURN jsonb_build_object(
  'room',p_room.room_code,'venue',p_room.venue_id,'status',p_room.status,
  'players',names_,'seat',seat_,'board',p_room.board,'bar',p_room.bar,
  'off',p_room.borne_off,'turn',p_room.turn,'dice',p_room.dice,
  'last_roll',p_room.last_roll,'winner',p_room.winner,'move',p_room.move_no,
  'opening_dice',p_room.opening_dice,
  'opponent_online',CASE WHEN jsonb_array_length(p_room.players)<2 THEN false
    ELSE coalesce((p_room.last_seen->>other_)::timestamptz > now()-interval '16 seconds',false) END,
  'completed_moves',p_room.completed_moves,'started_at',p_room.started_at,
  'ended_at',p_room.ended_at,'last_action',p_room.last_action,'updated_at',p_room.updated_at);
END $fn$;

CREATE OR REPLACE FUNCTION public.ob_tavla_open(
 p_venue_id text,p_name text,p_code text DEFAULT NULL,p_token uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE r public.ob_tavla_rooms%ROWTYPE;nm text;code_ text;new_token uuid;i int;attempt int;found_ boolean:=false;
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM oynabak_private.venues v
  WHERE v.id::text=p_venue_id AND v.active AND v.licensed
 ) THEN RAISE EXCEPTION 'Bu işletme için geçerli oyun erişimi bulunamadı.' USING errcode='42501';END IF;
 nm:=pg_catalog.left(pg_catalog.btrim(coalesce(p_name,'')),18);
 IF pg_catalog.length(nm)<2 THEN RAISE EXCEPTION 'Oyuncu adın en az 2 karakter olmalı';END IF;
 code_:=nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_code,''))),'');
 IF code_ IS NULL THEN
  DELETE FROM public.ob_tavla_rooms z WHERE z.venue_id=p_venue_id AND (
    (z.status='waiting' AND z.created_at < now()-interval '45 minutes') OR
    (z.status='finished' AND z.updated_at < now()-interval '6 hours') OR
    (z.status IN ('opening','playing') AND z.updated_at < now()-interval '36 hours'
      AND coalesce((z.last_seen->>0)::timestamptz,z.created_at) < now()-interval '36 hours'
      AND coalesce((z.last_seen->>1)::timestamptz,z.created_at) < now()-interval '36 hours')
  );
  IF (SELECT count(*) FROM public.ob_tavla_rooms WHERE venue_id=p_venue_id AND created_at>now()-interval '1 hour')>=30
  THEN RAISE EXCEPTION 'Çok fazla masa açıldı, biraz sonra tekrar deneyin';END IF;
  new_token:=gen_random_uuid();
  FOR attempt IN 1..40 LOOP
   code_:=pg_catalog.lpad((pg_catalog.floor(pg_catalog.random()*10000)::int)::text,4,'0');
   BEGIN
    INSERT INTO public.ob_tavla_rooms(room_code,venue_id,players,last_seen)
    VALUES(code_,p_venue_id,pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('name',nm,'token',new_token::text)
    ),pg_catalog.jsonb_build_array(now(),null)) RETURNING * INTO r;
    EXIT;
   EXCEPTION WHEN unique_violation THEN CONTINUE;
   END;
  END LOOP;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Masa açılamadı, yeniden dene';END IF;
  RETURN oynabak_private.ob_tavla_snapshot(r,new_token) || pg_catalog.jsonb_build_object('token',new_token::text);
 END IF;
 IF code_ !~ '^[0-9]{4}$' AND (p_token IS NULL OR code_ !~ '^[A-F0-9]{6}$') THEN
  RAISE EXCEPTION '4 rakamlı geçerli oda kodunu gir';END IF;
 SELECT * INTO r FROM public.ob_tavla_rooms
  WHERE room_code=code_ AND venue_id=p_venue_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bu kodla bir Tavla masası bulunamadı';END IF;
 IF p_token IS NOT NULL THEN
  FOR i IN 0..pg_catalog.jsonb_array_length(r.players)-1 LOOP
   IF r.players->i->>'token'=p_token::text THEN found_:=true;EXIT;END IF;
  END LOOP;
  IF NOT found_ THEN RAISE EXCEPTION 'Oyuncu oturumun bu masaya ait değil' USING errcode='42501';END IF;
  RETURN oynabak_private.ob_tavla_snapshot(r,p_token)||pg_catalog.jsonb_build_object('token',p_token::text);
 END IF;
 IF r.status<>'waiting' OR pg_catalog.jsonb_array_length(r.players)>=2 THEN
  RAISE EXCEPTION 'Bu masa dolu ya da oyun başladı';END IF;
 new_token:=gen_random_uuid();
 r.players:=r.players || pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object('name',nm,'token',new_token::text));
 r.status:='opening';
 r.last_seen:=pg_catalog.jsonb_set(r.last_seen,'{1}',pg_catalog.to_jsonb(now()));
 r.last_action:=pg_catalog.jsonb_build_object('type','joined','seat',1);
 UPDATE public.ob_tavla_rooms SET players=r.players,status=r.status,last_seen=r.last_seen,
  last_action=r.last_action,move_no=move_no+1,updated_at=now()
  WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_tavla_snapshot(r,new_token)||pg_catalog.jsonb_build_object('token',new_token::text);
END $fn$;



CREATE OR REPLACE FUNCTION public.ob_tavla_act(
 p_code text,p_token uuid,p_action text,p_from integer DEFAULT NULL,
 p_to integer DEFAULT NULL,p_die integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE r public.ob_tavla_rooms%ROWTYPE;
 seat_ int:=-1;i int;j int;die1 int;die2 int;legal_to int;
 updated_dice jsonb:='[]'::jsonb;removed_ boolean:=false;
 next_ jsonb;before_best int;after_best int;big_die int;source_ int;
BEGIN
 IF p_token IS NULL THEN RAISE EXCEPTION 'Oyuncu oturumu gerekli' USING errcode='42501';END IF;
 IF p_action NOT IN ('opening_roll','roll','move') THEN RAISE EXCEPTION 'Geçersiz oyun işlemi';END IF;
 SELECT * INTO r FROM public.ob_tavla_rooms
 WHERE room_code=upper(btrim(coalesce(p_code,''))) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Masa bulunamadı';END IF;
 FOR i IN 0..jsonb_array_length(r.players)-1 LOOP
  IF r.players->i->>'token'=p_token::text THEN seat_:=i;EXIT;END IF;
 END LOOP;
 IF seat_<0 THEN RAISE EXCEPTION 'Bu masada oyuncu değilsin' USING errcode='42501';END IF;

 IF p_action='opening_roll' THEN
  IF r.status<>'opening' THEN RAISE EXCEPTION 'Başlangıç zarı aşamasında değil';END IF;
  IF r.opening_dice->seat_<>'null'::jsonb THEN
   RAISE EXCEPTION 'Başlangıç zarını zaten attın';END IF;
  die1:=1+floor(random()*6)::int;
  r.opening_dice:=jsonb_set(r.opening_dice,ARRAY[seat_::text],to_jsonb(die1));
  r.last_action:=jsonb_build_object('type','opening_wait','seat',seat_,'die',die1);
  IF r.opening_dice->0<>'null'::jsonb AND r.opening_dice->1<>'null'::jsonb THEN
   die1:=(r.opening_dice->>0)::int;die2:=(r.opening_dice->>1)::int;
   IF die1=die2 THEN
    r.opening_dice:='[null,null]'::jsonb;
    r.last_action:=jsonb_build_object('type','opening_tie','dice',jsonb_build_array(die1,die2));
   ELSE
    r.status:='playing';r.turn:=CASE WHEN die1>die2 THEN 0 ELSE 1 END;
    r.last_roll:=jsonb_build_array(die1,die2);
    r.dice:=jsonb_build_array(die1,die2);r.started_at:=now();
    r.last_action:=jsonb_build_object('type','opening_result','dice',r.last_roll,'seat',r.turn);
   END IF;
  END IF;
 ELSIF p_action='roll' THEN
  IF r.status<>'playing' THEN RAISE EXCEPTION 'Oyun henüz başlamadı';END IF;
  IF seat_<>r.turn THEN RAISE EXCEPTION 'Sıra rakibinde';END IF;
  IF jsonb_array_length(r.dice)>0 THEN RAISE EXCEPTION 'Önce mevcut zarları oyna';END IF;
  die1:=1+floor(random()*6)::int;die2:=1+floor(random()*6)::int;
  r.last_roll:=jsonb_build_array(die1,die2);
  r.dice:=CASE WHEN die1=die2 THEN jsonb_build_array(die1,die1,die1,die1)
    ELSE jsonb_build_array(die1,die2) END;
  r.last_action:=jsonb_build_object('type','roll','seat',seat_,'dice',r.last_roll);
  IF oynabak_private.ob_tavla_max_moves(r.board,r.bar,r.borne_off,r.turn,r.dice)=0 THEN
   r.last_action:=jsonb_build_object('type','pass','seat',seat_,'dice',r.last_roll);
   r.dice:='[]'::jsonb;r.turn:=1-r.turn;
  END IF;
 ELSE
  IF r.status<>'playing' THEN RAISE EXCEPTION 'Oyun henüz başlamadı veya tamamlandı';END IF;
  IF seat_<>r.turn THEN RAISE EXCEPTION 'Şu anda sıra rakibinde';END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_die IS NULL OR p_die NOT BETWEEN 1 AND 6
    THEN RAISE EXCEPTION 'Geçersiz hamle';END IF;
  FOR i IN 0..jsonb_array_length(r.dice)-1 LOOP
   IF NOT removed_ AND (r.dice->>i)::int=p_die THEN removed_:=true;
   ELSE updated_dice:=updated_dice||jsonb_build_array((r.dice->>i)::int);
   END IF;
  END LOOP;
  IF NOT removed_ THEN RAISE EXCEPTION 'Bu zar kullanılamaz';END IF;
  legal_to:=oynabak_private.ob_tavla_legal(r.board,r.bar,r.turn,p_die,p_from);
  IF legal_to IS NULL OR legal_to<>p_to THEN RAISE EXCEPTION 'Bu hamle geçersiz';END IF;
  before_best:=oynabak_private.ob_tavla_max_moves(r.board,r.bar,r.borne_off,r.turn,r.dice);
  -- If just one die can be played, the higher playable die takes priority.
  IF jsonb_array_length(r.dice)=2 AND (r.dice->>0)::int<>(r.dice->>1)::int
    AND before_best=1 THEN
   big_die:=greatest((r.dice->>0)::int,(r.dice->>1)::int);
   IF p_die<big_die THEN
    FOR source_ IN -1..23 LOOP
     IF oynabak_private.ob_tavla_legal(r.board,r.bar,r.turn,big_die,source_) IS NOT NULL
       THEN RAISE EXCEPTION 'Bu tur büyük zarı oynamak zorundasın';END IF;
    END LOOP;
   END IF;
  END IF;
  next_:=oynabak_private.ob_tavla_apply_move(r.board,r.bar,r.borne_off,r.turn,p_from,p_to);
  after_best:=oynabak_private.ob_tavla_max_moves(next_->'board',next_->'bar',next_->'off',r.turn,updated_dice);
  IF 1+after_best<before_best THEN
   RAISE EXCEPTION 'Mümkün olan tüm zarlar oynanmalı; başka taş seç';END IF;
  r.board:=next_->'board';r.bar:=next_->'bar';r.borne_off:=next_->'off';
  r.dice:=updated_dice;r.completed_moves:=r.completed_moves+1;
  r.last_action:=jsonb_build_object('type','move','seat',seat_,'from',p_from,'to',p_to,'die',p_die);
  IF (r.borne_off->>seat_)::int=15 THEN
   r.status:='finished';r.winner:=seat_;r.ended_at:=now();r.dice:='[]'::jsonb;
   r.last_action:=jsonb_build_object('type','finish','seat',seat_,'moves',r.completed_moves);
  ELSIF jsonb_array_length(r.dice)=0 OR after_best=0 THEN
   r.turn:=1-r.turn;r.dice:='[]'::jsonb;
  END IF;
 END IF;
 r.last_seen:=jsonb_set(r.last_seen,ARRAY[seat_::text],to_jsonb(now()));
 UPDATE public.ob_tavla_rooms SET board=r.board,bar=r.bar,borne_off=r.borne_off,
  turn=r.turn,dice=r.dice,last_roll=r.last_roll,winner=r.winner,status=r.status,
  last_action=r.last_action,move_no=move_no+1,updated_at=now(),
  opening_dice=r.opening_dice,started_at=r.started_at,ended_at=r.ended_at,
  completed_moves=r.completed_moves,last_seen=r.last_seen
 WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_tavla_snapshot(r,p_token);
END $fn$;

CREATE OR REPLACE FUNCTION public.ob_tavla_ping(p_code text,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE r public.ob_tavla_rooms%ROWTYPE;seat_ int:=-1;i int;
BEGIN
 IF p_token IS NULL THEN RAISE EXCEPTION 'Oturum gerekli' USING errcode='42501';END IF;
 SELECT * INTO r FROM public.ob_tavla_rooms
 WHERE room_code=upper(btrim(coalesce(p_code,''))) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı';END IF;
 FOR i IN 0..jsonb_array_length(r.players)-1 LOOP
  IF r.players->i->>'token'=p_token::text THEN seat_:=i;EXIT;END IF;
 END LOOP;
 IF seat_<0 THEN RAISE EXCEPTION 'Oturum geçersiz' USING errcode='42501';END IF;
 r.last_seen:=jsonb_set(r.last_seen,ARRAY[seat_::text],to_jsonb(now()));
 UPDATE public.ob_tavla_rooms SET last_seen=r.last_seen WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_tavla_snapshot(r,p_token);
END $fn$;

REVOKE ALL ON FUNCTION public.ob_tavla_ping(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_tavla_ping(text,uuid) TO anon,authenticated;
