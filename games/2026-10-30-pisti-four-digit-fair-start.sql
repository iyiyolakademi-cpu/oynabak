-- New Pişti rooms use four numeric digits; existing six-character sessions remain valid.
-- Existing İyi Yol Akademi venue authorization and server card rules are retained.
ALTER TABLE public.ob_pisti_rooms DROP CONSTRAINT ob_pisti_rooms_room_code_check;
ALTER TABLE public.ob_pisti_rooms ADD CONSTRAINT ob_pisti_rooms_room_code_check
 CHECK(room_code ~ '^([0-9]{4}|[A-F0-9]{6})$');
CREATE OR REPLACE FUNCTION public.ob_pisti_open(p_venue_id text, p_name text, p_code text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid)
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

