-- Four Pişti modes: quick 51, classic 101, long 151, single complete deck.
-- Prior rooms stay in classic mode. All card draws and scores remain server authoritative.
ALTER TABLE public.ob_pisti_rooms
 ADD COLUMN IF NOT EXISTS match_mode text NOT NULL DEFAULT 'classic'
 CHECK (match_mode IN ('quick','classic','long','single'));
CREATE OR REPLACE FUNCTION oynabak_private.ob_pisti_snapshot(p_room ob_pisti_rooms, p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE seat_no int:=-1;i int;participants jsonb:='[]';p jsonb;
BEGIN
 FOR i IN 0..jsonb_array_length(p_room.players)-1 LOOP
   p:=p_room.players->i;
   IF p->>'token'=p_token::text THEN seat_no:=i;END IF;
   participants:=participants || jsonb_build_array(jsonb_build_object(
    'seat',i,'name',p->>'name','hand_count',jsonb_array_length(coalesce(p->'hand','[]'::jsonb)),
    'collected_count',jsonb_array_length(coalesce(p->'captured','[]'::jsonb))));
 END LOOP;
 IF seat_no<0 THEN RAISE EXCEPTION 'Bu masa için oyuncu oturumu geçersiz' USING errcode='42501';END IF;
 RETURN jsonb_build_object('room',p_room.room_code,'venue',p_room.venue_id,'status',p_room.status,
 'seat',seat_no,'players',participants,'hand',p_room.players->seat_no->'hand',
 'pile_count',jsonb_array_length(p_room.pile),
 'pile_top',CASE WHEN jsonb_array_length(p_room.pile)>0 THEN (p_room.pile->>(jsonb_array_length(p_room.pile)-1))::int ELSE null END,
 'stock_count',jsonb_array_length(p_room.stock),'turn',p_room.turn,'round',p_room.round_no,
 'scores',p_room.scores,'bonus',p_room.bonus,'ready',p_room.ready,
 'move',p_room.move_no,'last_action',p_room.last_action,'updated_at',p_room.updated_at,
 'target',p_room.target_score,'mode',p_room.match_mode);
END $function$
;
CREATE OR REPLACE FUNCTION public.ob_pisti_open_v2(p_venue_id text, p_name text, p_code text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid, p_mode text DEFAULT 'classic')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.ob_pisti_rooms%rowtype;nm text;code_ text;new_token uuid;i int;found_seat int:=-1;d jsonb;attempt int;
BEGIN
 IF p_venue_id<>'70abef21-053c-4026-b402-e18311f758d5' THEN
  RAISE EXCEPTION 'Pişti şimdilik yalnızca İyi Yol Akademi içinde açık' USING errcode='42501';END IF;
 nm:=left(btrim(coalesce(p_name,'')),18);
 IF length(nm)<2 THEN RAISE EXCEPTION 'Oyuncu adını en az 2 karakter yaz';END IF;
 code_:=nullif(upper(btrim(coalesce(p_code,''))),'');
 IF code_ IS NULL THEN
  IF p_mode IS NULL OR p_mode NOT IN ('quick','classic','long','single') THEN
    RAISE EXCEPTION 'Geçerli bir oyun modu seç';
  END IF;
  DELETE FROM public.ob_pisti_rooms z WHERE
    (z.status='waiting' AND z.created_at<now()-interval '45 minutes')
    OR (z.status='finished' AND z.updated_at<now()-interval '8 hours')
    OR (z.status IN ('playing','round_finished') AND z.updated_at<now()-interval '36 hours');
  IF (SELECT count(*) FROM public.ob_pisti_rooms WHERE created_at>now()-interval '1 hour')>=24
    THEN RAISE EXCEPTION 'Çok fazla masa kuruldu; biraz sonra tekrar deneyin';END IF;
  new_token:=gen_random_uuid();
  FOR attempt IN 1..50 LOOP
    code_:=lpad((floor(random()*10000)::int)::text,4,'0');
    BEGIN
     INSERT INTO public.ob_pisti_rooms(room_code,venue_id,players)
      VALUES(code_,p_venue_id,jsonb_build_array(jsonb_build_object('name',nm,'token',new_token::text,'hand','[]'::jsonb,'captured','[]'::jsonb)))
      RETURNING * INTO r;
     EXIT;
    EXCEPTION WHEN unique_violation THEN CONTINUE;
    END;
  END LOOP;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Masa oluşturulamadı, tekrar deneyin';END IF;
  UPDATE public.ob_pisti_rooms SET match_mode=p_mode,
    target_score=CASE p_mode WHEN 'quick' THEN 51 WHEN 'long' THEN 151 ELSE 101 END
    WHERE id=r.id RETURNING * INTO r;
  RETURN oynabak_private.ob_pisti_snapshot(r,new_token) || jsonb_build_object('token',new_token::text);
 END IF;
 IF code_ !~ '^[0-9]{4}$' AND (p_token IS NULL OR code_ !~ '^[A-F0-9]{6}$') THEN RAISE EXCEPTION '4 rakamlı geçerli masa kodunu yaz';END IF;
 SELECT * INTO r FROM public.ob_pisti_rooms WHERE room_code=code_ AND venue_id=p_venue_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bu kodla masa bulunamadı';END IF;
 IF p_token IS NOT NULL THEN
  FOR i IN 0..jsonb_array_length(r.players)-1 LOOP
   IF r.players->i->>'token'=p_token::text THEN found_seat:=i;EXIT;END IF;
  END LOOP;
  IF found_seat<0 THEN RAISE EXCEPTION 'Oyuncu oturumu uyuşmuyor' USING errcode='42501';END IF;
  RETURN oynabak_private.ob_pisti_snapshot(r,p_token)||jsonb_build_object('token',p_token::text);
 END IF;
 IF r.status<>'waiting' THEN RAISE EXCEPTION 'Oyun başlamış; yeni oyuncu katılamaz';END IF;
 IF jsonb_array_length(r.players)>=2 THEN RAISE EXCEPTION 'Masa dolu';END IF;
 new_token:=gen_random_uuid();
 r.players:=r.players || jsonb_build_array(jsonb_build_object('name',nm,'token',new_token::text,'hand','[]'::jsonb,'captured','[]'::jsonb));
 IF jsonb_array_length(r.players)=2 THEN
  d:=oynabak_private.ob_pisti_deal(r.players,0);
  r.players:=d->'players';r.stock:=d->'stock';r.pile:=d->'pile';
  r.status:='playing';r.round_no:=1;r.turn:=floor(random()*2)::int;r.last_action:=jsonb_build_object('event','start','first_seat',r.turn);
 END IF;
 UPDATE public.ob_pisti_rooms SET players=r.players,stock=r.stock,pile=r.pile,
  status=r.status,round_no=r.round_no,turn=r.turn,last_action=r.last_action,
  updated_at=now(),move_no=move_no+1 WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_pisti_snapshot(r,new_token)||jsonb_build_object('token',new_token::text);
END $function$
;
CREATE OR REPLACE FUNCTION public.ob_pisti_act(p_code text, p_token uuid, p_action text, p_card integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.ob_pisti_rooms%rowtype;seat_no int:=-1;i int;hand_ jsonb;
 rank_ int;top_rank int;capture_ boolean:=false;bonus_ int:=0;extra_ int;
 remaining int;new_score int;captured_ jsonb;pile_ jsonb;d jsonb;score0 int;score1 int;
 total0 int;total1 int;round_count0 int;round_count1 int;last_won int;fresh_scores jsonb;
BEGIN
 IF p_token IS NULL OR p_action NOT IN ('play','ready') THEN RAISE EXCEPTION 'Geçersiz hamle' USING errcode='42501';END IF;
 SELECT * INTO r FROM public.ob_pisti_rooms WHERE room_code=upper(btrim(coalesce(p_code,'')))
 AND venue_id='70abef21-053c-4026-b402-e18311f758d5' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Masa bulunamadı';END IF;
 FOR i IN 0..jsonb_array_length(r.players)-1 LOOP
  IF r.players->i->>'token'=p_token::text THEN seat_no:=i;EXIT;END IF;
 END LOOP;
 IF seat_no<0 THEN RAISE EXCEPTION 'Bu oyuncuya ait masa değil' USING errcode='42501';END IF;
 IF p_action='ready' THEN
  IF r.status NOT IN ('round_finished','finished') THEN RAISE EXCEPTION 'Yeni el henüz başlayamaz';END IF;
  r.ready:=jsonb_set(r.ready,ARRAY[seat_no::text],'true'::jsonb);
  IF r.ready->>0='true' AND r.ready->>1='true' THEN
    IF r.status='finished' THEN r.scores:='[0,0]'::jsonb;r.round_no:=0;END IF;
    r.round_no:=r.round_no+1;
    d:=oynabak_private.ob_pisti_deal(r.players,0);
    r.players:=d->'players';r.stock:=d->'stock';r.pile:=d->'pile';
    r.bonus:='[0,0]'::jsonb;r.ready:='[false,false]'::jsonb;
    r.last_collector:=null;r.turn:=(r.round_no-1)%2;
    r.status:='playing';
    r.last_action:=jsonb_build_object('event','round_start','round',r.round_no);
  ELSE
    r.last_action:=jsonb_build_object('event','ready','seat',seat_no);
  END IF;
 ELSE
  IF r.status<>'playing' THEN RAISE EXCEPTION 'Şu an kart oynanamaz';END IF;
  IF r.turn<>seat_no THEN RAISE EXCEPTION 'Sıra rakibinizde';END IF;
  IF p_card IS NULL OR p_card NOT BETWEEN 0 AND 51 THEN RAISE EXCEPTION 'Geçerli bir kart seçin';END IF;
  hand_:=r.players->seat_no->'hand';
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(hand_) a(card) WHERE a.card::int=p_card)
   THEN RAISE EXCEPTION 'Bu kart elinizde yok';END IF;
  SELECT coalesce(jsonb_agg(x.value ORDER BY x.ord),'[]'::jsonb)
   INTO hand_ FROM jsonb_array_elements(hand_) WITH ORDINALITY x(value,ord)
    WHERE (x.value)::text<>to_jsonb(p_card)::text;
  r.players:=jsonb_set(r.players,ARRAY[seat_no::text,'hand'],hand_);
  rank_:=p_card%13+1;
  IF jsonb_array_length(r.pile)>0 THEN
   top_rank:=((r.pile->>(jsonb_array_length(r.pile)-1))::int)%13+1;
   capture_:=(rank_=top_rank OR rank_=11);
   IF capture_ AND jsonb_array_length(r.pile)=1 AND rank_=top_rank THEN
     bonus_:=CASE WHEN rank_=11 THEN 20 ELSE 10 END;
   END IF;
  END IF;
  IF capture_ THEN
   captured_:=r.players->seat_no->'captured';
   captured_:=captured_ || r.pile || to_jsonb(p_card);
   r.players:=jsonb_set(r.players,ARRAY[seat_no::text,'captured'],captured_);
   remaining:=jsonb_array_length(r.pile)+1;
   r.pile:='[]'::jsonb;r.last_collector:=seat_no;
   r.bonus:=jsonb_set(r.bonus,ARRAY[seat_no::text],to_jsonb((r.bonus->>seat_no)::int+bonus_));
  ELSE
   r.pile:=r.pile || to_jsonb(p_card);
   remaining:=0;
  END IF;
  r.last_action:=jsonb_build_object('event','play','seat',seat_no,'card',p_card,
   'collected',capture_,'count',remaining,'pisti',bonus_,'round',r.round_no);
  r.turn:=1-seat_no;
  IF jsonb_array_length(r.players->0->'hand')=0 AND jsonb_array_length(r.players->1->'hand')=0 THEN
   IF jsonb_array_length(r.stock)>0 THEN
    IF jsonb_array_length(r.stock)<8 THEN RAISE EXCEPTION 'Deste durumu geçersiz';END IF;
    FOR i IN 0..1 LOOP
     r.players:=jsonb_set(r.players,ARRAY[i::text,'hand'],
      (SELECT coalesce(jsonb_agg(e.value ORDER BY e.ord),'[]'::jsonb)
       FROM jsonb_array_elements(r.stock) WITH ORDINALITY e(value,ord)
       WHERE e.ord BETWEEN (1+i*4) AND (4+i*4)));
    END LOOP;
    SELECT coalesce(jsonb_agg(e.value ORDER BY e.ord),'[]'::jsonb)
     INTO r.stock FROM jsonb_array_elements(r.stock) WITH ORDINALITY e(value,ord) WHERE e.ord>8;
   ELSE
    IF jsonb_array_length(r.pile)>0 THEN
     last_won:=coalesce(r.last_collector,seat_no);
     r.players:=jsonb_set(r.players,ARRAY[last_won::text,'captured'],
      r.players->last_won->'captured' || r.pile);
     r.pile:='[]'::jsonb;
    END IF;
    round_count0:=jsonb_array_length(r.players->0->'captured');
    round_count1:=jsonb_array_length(r.players->1->'captured');
    SELECT coalesce(sum(oynabak_private.ob_pisti_card_points(x.value::int)),0)::int
     INTO score0 FROM jsonb_array_elements_text(r.players->0->'captured') x(value);
    SELECT coalesce(sum(oynabak_private.ob_pisti_card_points(x.value::int)),0)::int
     INTO score1 FROM jsonb_array_elements_text(r.players->1->'captured') x(value);
    score0:=score0+(r.bonus->>0)::int+CASE WHEN round_count0>round_count1 THEN 3 ELSE 0 END;
    score1:=score1+(r.bonus->>1)::int+CASE WHEN round_count1>round_count0 THEN 3 ELSE 0 END;
    total0:=(r.scores->>0)::int+score0;total1:=(r.scores->>1)::int+score1;
    r.scores:=jsonb_build_array(total0,total1);
    r.status:=CASE WHEN r.match_mode='single' THEN 'finished'
      WHEN greatest(total0,total1)>=r.target_score AND total0<>total1
      THEN 'finished' ELSE 'round_finished' END;
    r.last_action:=jsonb_build_object('event','round_end','seat',seat_no,'card',p_card,
      'round',r.round_no,'round_scores',jsonb_build_array(score0,score1),
      'totals',r.scores,'winner',CASE WHEN total0>total1 THEN 0 WHEN total1>total0 THEN 1 ELSE null END,
      'match_finished',r.status='finished');
    r.ready:='[false,false]'::jsonb;
   END IF;
  END IF;
 END IF;
 r.move_no:=r.move_no+1;
 UPDATE public.ob_pisti_rooms SET players=r.players,stock=r.stock,pile=r.pile,turn=r.turn,
  status=r.status,round_no=r.round_no,last_collector=r.last_collector,scores=r.scores,
  bonus=r.bonus,ready=r.ready,move_no=r.move_no,last_action=r.last_action,updated_at=now()
  WHERE id=r.id RETURNING * INTO r;
 RETURN oynabak_private.ob_pisti_snapshot(r,p_token);
END $function$
;
REVOKE ALL ON FUNCTION public.ob_pisti_open_v2(text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_pisti_open_v2(text,text,text,uuid,text) TO anon,authenticated;
