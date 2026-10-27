-- Okey duplicates: discard exactly one matching tile while retaining all other checks.
CREATE OR REPLACE FUNCTION public.ob_okey_act(p_code text, p_token uuid, p_action text, p_tile integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.ob_okey_rooms%rowtype;seat_no integer:=-1;i integer;
 hand_ jsonb; oldhand int[]; remaining int[];t integer;new_status text;
begin
 if p_token is null then raise exception 'Oturum anahtarı gerekli';end if;
 select * into r from public.ob_okey_rooms where room_code=upper(btrim(coalesce(p_code,'')))
 and venue_id='70abef21-053c-4026-b402-e18311f758d5' for update;
 if not found then raise exception 'Masa bulunamadı';end if;
 for i in 0..jsonb_array_length(r.players)-1 loop
  if r.players->i->>'token'=p_token::text then seat_no:=i;exit;end if;
 end loop;
 if seat_no<0 then raise exception 'Yetkisiz masa işlemi' using errcode='42501';end if;
 if r.status<>'playing' then raise exception 'Oyun aktif değil';end if;
 if r.turn<>seat_no then raise exception 'Henüz sizin sıranız değil';end if;
 hand_:=r.players->seat_no->'hand';
 if p_action='draw' then
  if r.phase<>'draw' then raise exception 'Önce bir taş atmalısınız';end if;
  if jsonb_array_length(r.stock)=0 then
   r.status:='draw';
  else
   t:=(r.stock->>0)::int;
   hand_:=hand_ || to_jsonb(t);
   select coalesce(jsonb_agg(z.value order by z.ord),'[]'::jsonb) into r.stock
     from jsonb_array_elements(r.stock) with ordinality z(value,ord) where z.ord>1;
   r.players:=jsonb_set(r.players,array[seat_no::text,'hand'],hand_);
   r.phase:='discard';
  end if;
 elsif p_action='take' then
  if r.phase<>'draw' then raise exception 'Önce bir taş atmalısınız';end if;
  if r.discard_top is null or r.discard_by=seat_no then raise exception 'Alınabilecek taş yok';end if;
  hand_:=hand_ || to_jsonb(r.discard_top);
  r.players:=jsonb_set(r.players,array[seat_no::text,'hand'],hand_);
  r.discard_top:=null;r.discard_by:=null;r.phase:='discard';
 elsif p_action in ('discard','finish') then
  if r.phase<>'discard' or jsonb_array_length(hand_)<>15 then
   raise exception 'Taş atmak için sıranızda 15 taşınız olmalı';end if;
  if p_tile is null or not exists(select 1 from jsonb_array_elements_text(hand_) z where z::int=p_tile) then
   raise exception 'Bu taş elinizde bulunmuyor';end if;
  select coalesce(jsonb_agg(z.value order by z.ord),'[]'::jsonb) into hand_
    from jsonb_array_elements(hand_) with ordinality z(value,ord) where z.ord <> (
    select min(d.ord) from jsonb_array_elements(hand_) with ordinality d(value,ord)
    where (d.value)::text=to_jsonb(p_tile)::text
  );
  select array_agg(z.value::int) into remaining from jsonb_array_elements_text(hand_) z(value);
  if p_action='finish' and not oynabak_private.ob_okey_winning(remaining,r.indicator) then
   raise exception 'Bitmek için kalan 14 taş geçerli per veya çift olmalı';end if;
  r.players:=jsonb_set(r.players,array[seat_no::text,'hand'],hand_);
  r.discard_top:=p_tile;r.discard_by:=seat_no;
  if p_action='finish' then r.status:='finished';r.winner:=seat_no;
  else r.turn:=mod(seat_no+1,4);r.phase:='draw';end if;
 else
  raise exception 'Bilinmeyen Okey hamlesi';
 end if;
 r.move_no:=r.move_no+1;
 update public.ob_okey_rooms set players=r.players,stock=r.stock,status=r.status,
  discard_top=r.discard_top,discard_by=r.discard_by,turn=r.turn,phase=r.phase,
  winner=r.winner,move_no=r.move_no,updated_at=now() where id=r.id returning * into r;
 return oynabak_private.ob_okey_snapshot(r,p_token);
end $function$

