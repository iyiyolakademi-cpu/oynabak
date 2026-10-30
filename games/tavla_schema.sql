-- OynaBak | Tavla: iki telefon, altı haneli oda kodu.
-- Maç durumu sunucuda tutulur; oyuncular birbirlerinin oturum tokenını göremez.
-- Canlı durum anonim erişime açılmaz; sadece RPC'ler üzerinden kontrol edilir.
CREATE TABLE IF NOT EXISTS public.ob_tavla_rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_code text NOT NULL UNIQUE CHECK (room_code ~ '^[A-F0-9]{6}$'),
 venue_id text NOT NULL,
 status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','playing','finished')),
 players jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(players)='array' AND jsonb_array_length(players)<=2),
 board jsonb NOT NULL DEFAULT '[2,0,0,0,0,-5,0,-3,0,0,0,5,-5,0,0,0,3,0,5,0,0,0,0,-2]'::jsonb,
 bar jsonb NOT NULL DEFAULT '[0,0]'::jsonb,
 borne_off jsonb NOT NULL DEFAULT '[0,0]'::jsonb,
 turn integer NOT NULL DEFAULT 0 CHECK (turn BETWEEN 0 AND 1),
 dice jsonb NOT NULL DEFAULT '[]'::jsonb,
 last_roll jsonb NOT NULL DEFAULT '[]'::jsonb,
 winner integer CHECK (winner BETWEEN 0 AND 1),
 move_no integer NOT NULL DEFAULT 0,
 last_action jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ob_tavla_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ob_tavla_rooms FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS ob_tavla_rooms_recent_idx ON public.ob_tavla_rooms(created_at DESC);

-- 0 = pozitif taş, + yöne doğru; 1 = negatif taş, - yöne doğru.
-- -1 kaynak: bar; 24 hedef: taş toplama.
CREATE OR REPLACE FUNCTION oynabak_private.ob_tavla_legal(
 p_board jsonb,p_bar jsonb,p_seat integer,p_die integer,p_from integer
) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $fn$
DECLARE sign_ int:=CASE WHEN p_seat=0 THEN 1 ELSE -1 END;
 dest int;point_value int;i int; bearing boolean:=true;
BEGIN
 IF p_seat NOT BETWEEN 0 AND 1 OR p_die NOT BETWEEN 1 AND 6 THEN RETURN NULL;END IF;
 IF p_from=-1 THEN
  IF (p_bar->>p_seat)::int<1 THEN RETURN NULL;END IF;
  dest:=CASE WHEN p_seat=0 THEN p_die-1 ELSE 24-p_die END;
 ELSE
  IF p_from NOT BETWEEN 0 AND 23 THEN RETURN NULL;END IF;
  IF (p_bar->>p_seat)::int>0 THEN RETURN NULL;END IF;
  IF (p_board->>p_from)::int*sign_<=0 THEN RETURN NULL;END IF;
  dest:=p_from+sign_*p_die;
 END IF;
 IF dest BETWEEN 0 AND 23 THEN
  point_value:=(p_board->>dest)::int;
  IF point_value*sign_<=-2 THEN RETURN NULL;END IF;
  RETURN dest;
 END IF;
 IF p_from=-1 THEN RETURN NULL;END IF;
 -- Taş toplama: bütün taşlar kendi evinde bulunmalı.
 IF p_seat=0 THEN
  IF p_from<18 OR dest<24 THEN RETURN NULL;END IF;
  FOR i IN 0..17 LOOP
   IF (p_board->>i)::int>0 THEN RETURN NULL;END IF;
  END LOOP;
  -- Büyük zarla toplama: daha geride taş kalmamalı.
  IF dest>24 THEN
   FOR i IN 18..p_from-1 LOOP
    IF (p_board->>i)::int>0 THEN RETURN NULL;END IF;
   END LOOP;
  END IF;
 ELSE
  IF p_from>5 OR dest>=0 THEN RETURN NULL;END IF;
  FOR i IN 6..23 LOOP
   IF (p_board->>i)::int<0 THEN RETURN NULL;END IF;
  END LOOP;
  IF dest< -1 THEN
   FOR i IN p_from+1..5 LOOP
    IF (p_board->>i)::int<0 THEN RETURN NULL;END IF;
   END LOOP;
  END IF;
 END IF;
 RETURN 24;
END $fn$;

CREATE OR REPLACE FUNCTION oynabak_private.ob_tavla_any_move(
 p_board jsonb,p_bar jsonb,p_seat integer,p_dice jsonb
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $fn$
DECLARE die_ jsonb;source_ integer;
BEGIN
 FOR die_ IN SELECT value FROM pg_catalog.jsonb_array_elements(p_dice) LOOP
  FOR source_ IN -1..23 LOOP
   IF oynabak_private.ob_tavla_legal(p_board,p_bar,p_seat,(die_::text)::int,source_) IS NOT NULL THEN RETURN true;END IF;
  END LOOP;
 END LOOP;
 RETURN false;
END $fn$;

CREATE OR REPLACE FUNCTION oynabak_private.ob_tavla_snapshot(
 p_room public.ob_tavla_rooms,p_token uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO '' AS $fn$
DECLARE seat_ int:=-1; names_ jsonb:='[]'::jsonb;i int;
BEGIN
 FOR i IN 0..pg_catalog.jsonb_array_length(p_room.players)-1 LOOP
  IF p_room.players->i->>'token'=p_token::text THEN seat_:=i;END IF;
  names_:=names_ || pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('name',p_room.players->i->>'name','seat',i));
 END LOOP;
 IF seat_<0 THEN RAISE EXCEPTION 'Masa oturumuna erişim yok' USING errcode='42501';END IF;
 RETURN pg_catalog.jsonb_build_object(
  'room',p_room.room_code,'venue',p_room.venue_id,'status',p_room.status,
  'players',names_,'seat',seat_,'board',p_room.board,'bar',p_room.bar,
  'off',p_room.borne_off,'turn',p_room.turn,'dice',p_room.dice,
  'last_roll',p_room.last_roll,'winner',p_room.winner,'move',p_room.move_no,
  'last_action',p_room.last_action,'updated_at',p_room.updated_at);
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
  IF (SELECT count(*) FROM public.ob_tavla_rooms WHERE venue_id=p_venue_id AND created_at>now()-interval '1 hour')>=30
  THEN RAISE EXCEPTION 'Çok fazla masa açıldı, biraz sonra tekrar deneyin';END IF;
  new_token:=gen_random_uuid();
  FOR attempt IN 1..8 LOOP
   code_:=pg_catalog.upper(pg_catalog.substr(pg_catalog.md5(gen_random_uuid()::text),1,6));
   BEGIN
    INSERT INTO public.ob_tavla_rooms(room_code,venue_id,players)
    VALUES(code_,p_venue_id,pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('name',nm,'token',new_token::text)
    )) RETURNING * INTO r;
    EXIT;
   EXCEPTION WHEN unique_violation THEN CONTINUE;
   END;
  END LOOP;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Masa açılamadı, yeniden dene';END IF;
  RETURN oynabak_private.ob_tavla_snapshot(r,new_token) || pg_catalog.jsonb_build_object('token',new_token::text);
 END IF;
 IF code_ !~ '^[A-F0-9]{6}$' THEN RAISE EXCEPTION '6 karakterli geçerli bir oda kodu gir';END IF;
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
 r.status:='playing';
 r.last_action:=pg_catalog.jsonb_build_object('type','joined','seat',1);
 UPDATE public.ob_tavla_rooms SET players=r.players,status=r.status,
  last_action=r.last_action,move_no=move_no+1,updated_at=now()
  WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_tavla_snapshot(r,new_token)||pg_catalog.jsonb_build_object('token',new_token::text);
END $fn$;

CREATE OR REPLACE FUNCTION public.ob_tavla_state(p_code text,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE r public.ob_tavla_rooms%ROWTYPE;
BEGIN
 IF p_token IS NULL THEN RAISE EXCEPTION 'Oyuncu oturumu gerekli' USING errcode='42501';END IF;
 SELECT * INTO r FROM public.ob_tavla_rooms WHERE room_code=upper(btrim(coalesce(p_code,'')));
 IF NOT FOUND THEN RAISE EXCEPTION 'Masa bulunamadı';END IF;
 RETURN oynabak_private.ob_tavla_snapshot(r,p_token);
END $fn$;

CREATE OR REPLACE FUNCTION public.ob_tavla_act(
 p_code text,p_token uuid,p_action text,p_from integer DEFAULT NULL,
 p_to integer DEFAULT NULL,p_die integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE r public.ob_tavla_rooms%ROWTYPE;
 seat_ int:=-1; i int; die1 int;die2 int;legal_to int;sgn int;old_ int;target_ int;
 updated_dice jsonb:='[]'::jsonb;removed_ boolean:=false;
BEGIN
 IF p_token IS NULL THEN RAISE EXCEPTION 'Oyuncu oturumu gerekli' USING errcode='42501';END IF;
 IF p_action NOT IN ('roll','move') THEN RAISE EXCEPTION 'Geçersiz oyun işlemi';END IF;
 SELECT * INTO r FROM public.ob_tavla_rooms
  WHERE room_code=upper(btrim(coalesce(p_code,''))) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Masa bulunamadı';END IF;
 FOR i IN 0..pg_catalog.jsonb_array_length(r.players)-1 LOOP
  IF r.players->i->>'token'=p_token::text THEN seat_:=i;EXIT;END IF;
 END LOOP;
 IF seat_<0 THEN RAISE EXCEPTION 'Bu masada oyuncu değilsin' USING errcode='42501';END IF;
 IF r.status<>'playing' THEN RAISE EXCEPTION 'Oyun henüz başlamadı veya tamamlandı';END IF;
 IF seat_<>r.turn THEN RAISE EXCEPTION 'Şu anda sıra rakibinde';END IF;
 IF p_action='roll' THEN
  IF pg_catalog.jsonb_array_length(r.dice)>0 THEN RAISE EXCEPTION 'Önce mevcut zarları oyna';END IF;
  die1:=1+pg_catalog.floor(pg_catalog.random()*6)::int;
  die2:=1+pg_catalog.floor(pg_catalog.random()*6)::int;
  r.last_roll:=pg_catalog.jsonb_build_array(die1,die2);
  IF die1=die2 THEN
   r.dice:=pg_catalog.jsonb_build_array(die1,die1,die1,die1);
  ELSE
   r.dice:=pg_catalog.jsonb_build_array(die1,die2);
  END IF;
  r.last_action:=pg_catalog.jsonb_build_object('type','roll','seat',seat_,'dice',r.last_roll);
  IF NOT oynabak_private.ob_tavla_any_move(r.board,r.bar,r.turn,r.dice) THEN
   r.last_action:=pg_catalog.jsonb_build_object('type','pass','seat',seat_,'dice',r.last_roll);
   r.dice:='[]'::jsonb;r.turn:=1-r.turn;
  END IF;
 ELSE
  IF p_die NOT BETWEEN 1 AND 6 OR p_from IS NULL OR p_to IS NULL
   THEN RAISE EXCEPTION 'Geçersiz hamle';END IF;
  FOR i IN 0..pg_catalog.jsonb_array_length(r.dice)-1 LOOP
   IF NOT removed_ AND (r.dice->>i)::int=p_die THEN removed_:=true;
   ELSE updated_dice:=updated_dice || pg_catalog.jsonb_build_array((r.dice->>i)::int);
   END IF;
  END LOOP;
  IF NOT removed_ THEN RAISE EXCEPTION 'Bu zar şu anda kullanılamaz';END IF;
  legal_to:=oynabak_private.ob_tavla_legal(r.board,r.bar,r.turn,p_die,p_from);
  IF legal_to IS NULL OR legal_to<>p_to THEN
   RAISE EXCEPTION 'Bu hamle geçersiz: sıra, bar, taş veya zar uygun değil';END IF;
  sgn:=CASE WHEN seat_=0 THEN 1 ELSE -1 END;
  IF p_from=-1 THEN
   r.bar:=pg_catalog.jsonb_set(r.bar,ARRAY[seat_::text],
      pg_catalog.to_jsonb((r.bar->>seat_)::int-1));
  ELSE
   old_:=(r.board->>p_from)::int;
   r.board:=pg_catalog.jsonb_set(r.board,ARRAY[p_from::text],pg_catalog.to_jsonb(old_-sgn));
  END IF;
  IF p_to=24 THEN
   r.borne_off:=pg_catalog.jsonb_set(r.borne_off,ARRAY[seat_::text],
       pg_catalog.to_jsonb((r.borne_off->>seat_)::int+1));
  ELSE
   target_:=(r.board->>p_to)::int;
   IF target_=-sgn THEN
    r.bar:=pg_catalog.jsonb_set(r.bar,ARRAY[(1-seat_)::text],
       pg_catalog.to_jsonb((r.bar->>(1-seat_))::int+1));
    target_:=0;
   END IF;
   r.board:=pg_catalog.jsonb_set(r.board,ARRAY[p_to::text],pg_catalog.to_jsonb(target_+sgn));
  END IF;
  r.dice:=updated_dice;
  r.last_action:=pg_catalog.jsonb_build_object('type','move','seat',seat_,'from',p_from,'to',p_to,'die',p_die);
  IF (r.borne_off->>seat_)::int=15 THEN
   r.status:='finished';r.winner:=seat_;r.dice:='[]'::jsonb;
  ELSIF pg_catalog.jsonb_array_length(r.dice)=0 OR
   NOT oynabak_private.ob_tavla_any_move(r.board,r.bar,r.turn,r.dice) THEN
   r.turn:=1-r.turn;r.dice:='[]'::jsonb;
  END IF;
 END IF;
 UPDATE public.ob_tavla_rooms SET board=r.board,bar=r.bar,borne_off=r.borne_off,
  turn=r.turn,dice=r.dice,last_roll=r.last_roll,winner=r.winner,status=r.status,
  last_action=r.last_action,move_no=move_no+1,updated_at=now()
  WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_tavla_snapshot(r,p_token);
END $fn$;

REVOKE ALL ON FUNCTION public.ob_tavla_open(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ob_tavla_state(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ob_tavla_act(text,uuid,text,integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_tavla_open(text,text,text,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_tavla_state(text,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_tavla_act(text,uuid,text,integer,integer,integer) TO anon,authenticated;
