-- Online Gol Arena: two phones, five disks each, shot impulses and authoritative final ball positions.
CREATE TABLE IF NOT EXISTS public.ob_goal_rooms(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_code text NOT NULL UNIQUE CHECK(room_code ~ '^[0-9]{4}$'),
 venue_id text NOT NULL,
 players jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(players)='array' AND jsonb_array_length(players)<=2),
 blue_seat int NOT NULL DEFAULT 0 CHECK (blue_seat IN(0,1)),
 goal_target int NOT NULL DEFAULT 3 CHECK(goal_target IN (3,5)),
 status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','playing','finished')),
 turn int NOT NULL DEFAULT 0 CHECK(turn IN(0,1)),
 shot_no int NOT NULL DEFAULT 0,
 active boolean NOT NULL DEFAULT false,
 snapshot jsonb,
 version int NOT NULL DEFAULT 0,
 last_action jsonb NOT NULL DEFAULT '{}'::jsonb,
 score_blue int NOT NULL DEFAULT 0,
 score_red int NOT NULL DEFAULT 0,
 winner int CHECK(winner IN(0,1)),
 last_seen jsonb NOT NULL DEFAULT '[null,null]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ob_goal_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ob_goal_rooms FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS ob_goal_recent_idx ON public.ob_goal_rooms(venue_id,created_at DESC);
CREATE OR REPLACE FUNCTION oynabak_private.ob_goal_public_state(r public.ob_goal_rooms,token_ uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO '' AS $fn$
DECLARE i int;seat_ int:=-1;people jsonb:='[]'::jsonb;
BEGIN
 IF token_ IS NULL THEN RAISE EXCEPTION 'Oturum bilgisi eksik' USING ERRCODE='42501';END IF;
 FOR i IN 0..jsonb_array_length(r.players)-1 LOOP
  IF r.players->i->>'token'=token_::text THEN seat_:=i;END IF;
  people:=people||jsonb_build_array(jsonb_build_object('name',r.players->i->>'name','seat',i));
 END LOOP;
 IF seat_ < 0 THEN RAISE EXCEPTION 'Bu Gol Arena odasına erişimin yok' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object(
  'room',r.room_code,'venue',r.venue_id,'seat',seat_,
  'team',CASE WHEN seat_=r.blue_seat THEN 'blue' ELSE 'red' END,
  'blue_seat',r.blue_seat,'players',people,'goal_target',r.goal_target,
  'status',r.status,'turn',r.turn,'shot',r.shot_no,'active',r.active,'snapshot',r.snapshot,
  'version',r.version,'last_action',r.last_action,
  'score_blue',r.score_blue,'score_red',r.score_red,'winner',r.winner,
  'opponent_online',CASE WHEN jsonb_array_length(r.players)<2 THEN false ELSE
  coalesce((r.last_seen->>(1-seat_))::timestamptz>now()-interval '20 seconds',false) END
 );
END $fn$;
CREATE OR REPLACE FUNCTION public.ob_goal_open(p_venue_id text,p_name text,p_code text DEFAULT NULL,p_token uuid DEFAULT NULL,p_goal_target int DEFAULT 3)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE r public.ob_goal_rooms%ROWTYPE;name_ text;code_ text;secret uuid;n int;
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM oynabak_private.venues v
  JOIN oynabak_private.assignments a ON a.venue_id=v.id
  JOIN oynabak_private.games g ON g.id=a.game_id
  LEFT JOIN public.ob_venue_features f ON f.venue_id=v.id::text
  WHERE v.id::text=p_venue_id AND v.active AND v.licensed
   AND coalesce(f.games,true)
   AND g.id='f3f1d8e7-0726-45c2-b4a8-9b8ecd9eab69'::uuid AND g.published
 ) THEN RAISE EXCEPTION 'Bu işletmede Gol Arena açık değil' USING ERRCODE='42501';END IF;
 name_:=left(btrim(coalesce(p_name,'')),18);
 IF length(name_)<2 THEN RAISE EXCEPTION 'Oyuncu adı en az iki karakter olmalı';END IF;
 code_:=nullif(btrim(coalesce(p_code,'')),'');
 IF code_ IS NULL THEN
  IF p_goal_target NOT IN (3,5) THEN RAISE EXCEPTION '3 veya 5 gollük maç seç';END IF;
  DELETE FROM public.ob_goal_rooms WHERE
   (status='waiting' AND created_at<now()-interval '45 minutes') OR
   (status='finished' AND updated_at<now()-interval '8 hours') OR
   (status='playing' AND updated_at<now()-interval '48 hours');
  IF (SELECT count(*) FROM public.ob_goal_rooms WHERE venue_id=p_venue_id AND created_at>now()-interval '1 hour')>=30
   THEN RAISE EXCEPTION 'Şimdilik yeni oda açılamıyor';END IF;
  secret:=gen_random_uuid();
  FOR n IN 1..50 LOOP
   code_:=lpad((floor(random()*10000)::int)::text,4,'0');
   BEGIN
    INSERT INTO public.ob_goal_rooms(room_code,venue_id,players,blue_seat,goal_target,turn,last_seen)
    VALUES(code_,p_venue_id,jsonb_build_array(jsonb_build_object('name',name_,'token',secret::text)),
    floor(random()*2)::int,p_goal_target,0,jsonb_build_array(now(),null)) RETURNING * INTO r;
    EXIT;
   EXCEPTION WHEN unique_violation THEN CONTINUE;
   END;
  END LOOP;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Oda oluşturulamadı';END IF;
  r.turn:=r.blue_seat;
  UPDATE public.ob_goal_rooms SET turn=r.turn WHERE id=r.id RETURNING * INTO r;
  RETURN oynabak_private.ob_goal_public_state(r,secret)||jsonb_build_object('token',secret::text);
 END IF;
 IF code_ !~ '^[0-9]{4}$' THEN RAISE EXCEPTION '4 haneli oda kodunu yaz';END IF;
 SELECT * INTO r FROM public.ob_goal_rooms WHERE room_code=code_ AND venue_id=p_venue_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Gol Arena odası bulunamadı';END IF;
 IF p_token IS NOT NULL THEN
  PERFORM oynabak_private.ob_goal_public_state(r,p_token);
  RETURN oynabak_private.ob_goal_public_state(r,p_token)||jsonb_build_object('token',p_token::text);
 END IF;
 IF r.status<>'waiting' OR jsonb_array_length(r.players)>1 THEN RAISE EXCEPTION 'Bu oda dolu veya maç başladı';END IF;
 secret:=gen_random_uuid();
 r.players:=r.players||jsonb_build_array(jsonb_build_object('name',name_,'token',secret::text));
 r.last_seen:=jsonb_set(r.last_seen,'{1}',to_jsonb(now()));
 r.status:='playing';r.version:=r.version+1;
 r.last_action:=jsonb_build_object('type','joined');
 UPDATE public.ob_goal_rooms SET players=r.players,last_seen=r.last_seen,status=r.status,version=r.version,
 last_action=r.last_action,updated_at=now() WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_goal_public_state(r,secret)||jsonb_build_object('token',secret::text);
END $fn$;
CREATE OR REPLACE FUNCTION public.ob_goal_state(p_code text,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO '' AS $fn$
DECLARE r public.ob_goal_rooms%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.ob_goal_rooms WHERE room_code=btrim(coalesce(p_code,''));
 IF NOT FOUND THEN RAISE EXCEPTION 'Gol Arena odası bulunamadı';END IF;
 RETURN oynabak_private.ob_goal_public_state(r,p_token);
END $fn$;
CREATE OR REPLACE FUNCTION public.ob_goal_act(p_code text,p_token uuid,p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
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
  r.score_blue:=new_blue;r.score_red:=new_red;r.snapshot:=p_payload;
  next_:=1-r.turn;r.turn:=next_;
  IF greatest(new_blue,new_red)>=r.goal_target THEN
   r.status:='finished';r.winner:=CASE WHEN new_blue>new_red THEN r.blue_seat ELSE 1-r.blue_seat END;
  END IF;
  r.active:=false;
  r.last_action:=jsonb_build_object('type','finished','shot',r.shot_no,'scored',CASE WHEN new_blue>r.score_blue THEN 'blue' WHEN new_red>r.score_red THEN 'red' ELSE NULL END);
 END IF;
 r.version:=r.version+1;
 UPDATE public.ob_goal_rooms SET status=r.status,turn=r.turn,active=r.active,shot_no=r.shot_no,
  snapshot=r.snapshot,version=r.version,last_action=r.last_action,winner=r.winner,
  score_blue=r.score_blue,score_red=r.score_red,last_seen=r.last_seen,updated_at=now()
  WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_goal_public_state(r,p_token);
END $fn$;
REVOKE ALL ON FUNCTION public.ob_goal_open(text,text,text,uuid,int),public.ob_goal_state(text,uuid),
 public.ob_goal_act(text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_goal_open(text,text,text,uuid,int),public.ob_goal_state(text,uuid),
 public.ob_goal_act(text,uuid,text,jsonb) TO anon,authenticated;
