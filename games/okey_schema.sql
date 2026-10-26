-- OynaBak four-player classic Okey (İyi Yol Akademi pilot).
-- Snapshot of the actual deployed database functions, October 2026.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ob_okey_rooms (
 id uuid primary key default gen_random_uuid(),
 room_code text not null unique check(room_code ~ '^[A-F0-9]{6}$'),
 venue_id text not null check(venue_id='70abef21-053c-4026-b402-e18311f758d5'),
 status text not null default 'waiting' check(status in ('waiting','playing','finished','draw')),
 players jsonb not null default '[]'::jsonb check(jsonb_typeof(players)='array' and jsonb_array_length(players)<=4),
 stock jsonb not null default '[]'::jsonb,
 indicator integer,discard_top integer,discard_by integer,
 turn integer not null default 0,phase text not null default 'discard',
 winner integer,move_no integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(turn between 0 and 3),check(phase in ('draw','discard'))
);
ALTER TABLE public.ob_okey_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ob_okey_rooms FROM public,anon,authenticated;
CREATE INDEX IF NOT EXISTS ob_okey_rooms_updated_idx ON public.ob_okey_rooms(updated_at DESC);
CREATE OR REPLACE FUNCTION oynabak_private.ob_okey_tile_value(p_id integer, p_indicator integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare joker int; col int; num int;
begin
 if p_id not between 0 and 105 or p_indicator not between 0 and 103 then return -999; end if;
 col=(p_indicator%52)/13;
 num=((p_indicator%13+1)%13)+1;
 joker=col*13+num;
 if p_id>=104 then return joker; end if;
 if ((p_id%52)/13)=col and ((p_id%13)+1)=num then return -1; end if;
 return ((p_id%52)/13)*13+(p_id%13)+1;
end $function$

CREATE OR REPLACE FUNCTION oynabak_private.ob_okey_meld(p_tiles integer[], p_indicator integer)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare n int:=coalesce(array_length(p_tiles,1),0); vals int[]:='{}'; x int; v int; target int; j int; start_no int; num int; seen int[]; col int; same_num int; color_seen int[];
begin
 if n<3 or n>13 then return false; end if;
 foreach x in array p_tiles loop
  v:=oynabak_private.ob_okey_tile_value(x,p_indicator);
  if v=-999 then return false; end if;
  if v>=0 then vals:=array_append(vals,v);end if;
 end loop;
 -- Same number, different colors, with up to two wildcard substitutions.
 if n in (3,4) then
   same_num:=null;color_seen:='{}';
   foreach v in array vals loop
    num:=(v-1)%13+1;col:=(v-1)/13;
    if same_num is not null and num<>same_num then exit;end if;
    if col=any(color_seen) then exit;end if;
    same_num:=num;color_seen:=array_append(color_seen,col);
   end loop;
   if coalesce(array_length(color_seen,1),0)=coalesce(array_length(vals,1),0) then return true;end if;
 end if;
 -- Runs may wrap from 13 to 1, but must stop after 1.
 if coalesce(array_length(vals,1),0)>0 then
   col:=(vals[1]-1)/13;
   foreach v in array vals loop
    if (v-1)/13<>col then return false; end if;
   end loop;
 else
   return true; -- all jokers (max two in a real deck)
 end if;
 for start_no in 1..13 loop
  if start_no+n-1>14 then continue;end if;
  seen:='{}';
  for j in 1..n loop
    target:=col*13+((start_no+j-2)%13)+1;
    seen:=array_append(seen,target);
  end loop;
  if vals <@ seen and (select count(distinct z) from unnest(vals) z)=cardinality(vals) then
   return true;
  end if;
 end loop;
 return false;
end $function$

CREATE OR REPLACE FUNCTION oynabak_private.ob_okey_partition(p_tiles integer[], p_indicator integer)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare n int:=coalesce(array_length(p_tiles,1),0); mask int;i int; chosen int[]; rest int[];
begin
 if n=0 then return true;end if;
 if n<3 then return false;end if;
 for mask in 0..((1<<(n-1))-1) loop
  chosen:=array[p_tiles[1]];rest:='{}';
  for i in 2..n loop
   if (mask & (1<<(i-2)))<>0 then chosen:=array_append(chosen,p_tiles[i]);
   else rest:=array_append(rest,p_tiles[i]);end if;
  end loop;
  if cardinality(chosen)<3 or cardinality(chosen)>13 then continue;end if;
  if cardinality(rest) in (1,2) then continue;end if;
  if oynabak_private.ob_okey_meld(chosen,p_indicator)
   and oynabak_private.ob_okey_partition(rest,p_indicator) then return true;end if;
 end loop;
 return false;
end $function$

CREATE OR REPLACE FUNCTION oynabak_private.ob_okey_winning(p_tiles integer[], p_indicator integer)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare odd_count int:=0;wild_count int:=0;
begin
 if cardinality(p_tiles)<>14 then return false;end if;
 select count(*) into wild_count from unnest(p_tiles) z(tile)
 where oynabak_private.ob_okey_tile_value(z.tile,p_indicator)=-1;
 select count(*) into odd_count from (
   select oynabak_private.ob_okey_tile_value(z.tile,p_indicator) v,count(*) c
   from unnest(p_tiles) z(tile)
   where oynabak_private.ob_okey_tile_value(z.tile,p_indicator)>=0 group by 1
 ) t where mod(c,2)=1;
 if odd_count<=wild_count and mod(wild_count-odd_count,2)=0 then return true;end if;
 return oynabak_private.ob_okey_partition(p_tiles,p_indicator);
end $function$

CREATE OR REPLACE FUNCTION oynabak_private.ob_okey_snapshot(p_room ob_okey_rooms, p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare seat_no integer:=-1; i integer; actor jsonb; public_players jsonb:='[]'::jsonb;
begin
 for i in 0..jsonb_array_length(p_room.players)-1 loop
  actor:=p_room.players->i;
  if actor->>'token'=p_token::text then seat_no:=i;end if;
  public_players:=public_players || jsonb_build_array(jsonb_build_object(
    'seat',i,'name',actor->>'name','count',jsonb_array_length(coalesce(actor->'hand','[]'::jsonb))));
 end loop;
 if seat_no<0 then raise exception 'Oturum geçersiz, masaya yeniden katılın' using errcode='42501'; end if;
 return jsonb_build_object('room',p_room.room_code,'venue',p_room.venue_id,
 'status',p_room.status,'seat',seat_no,'players',public_players,
 'hand',coalesce(p_room.players->seat_no->'hand','[]'::jsonb),
 'indicator',p_room.indicator,'stock_count',jsonb_array_length(p_room.stock),
 'discard',p_room.discard_top,'discard_by',p_room.discard_by,
 'turn',p_room.turn,'phase',p_room.phase,'winner',p_room.winner,
 'move',p_room.move_no,'updated_at',p_room.updated_at);
end $function$

CREATE OR REPLACE FUNCTION oynabak_private.ob_okey_deal(p_players jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare pile integer[]; a integer; i integer; j integer; k integer:=2;
 indicator_id integer; participants jsonb:='[]'::jsonb; hand_list jsonb; stock_list jsonb:='[]'::jsonb;
begin
 if jsonb_array_length(p_players)<>4 then raise exception 'Dört oyuncu gerekli';end if;
 select array_agg(n order by random()) into pile from generate_series(0,105) n;
 for i in 1..106 loop
  if pile[i]<104 then
   a:=pile[1];pile[1]:=pile[i];pile[i]:=a;exit;
  end if;
 end loop;
 indicator_id:=pile[1];
 for i in 0..3 loop
  hand_list:='[]'::jsonb;
  for j in 1..(case when i=0 then 15 else 14 end) loop
   hand_list:=hand_list || to_jsonb(pile[k]);k:=k+1;
  end loop;
  participants:=participants || jsonb_build_array(jsonb_set(p_players->i,'{hand}',hand_list,true));
 end loop;
 while k<=106 loop
  stock_list:=stock_list || to_jsonb(pile[k]);k:=k+1;
 end loop;
 return jsonb_build_object('players',participants,'stock',stock_list,'indicator',indicator_id);
end $function$

CREATE OR REPLACE FUNCTION public.ob_okey_open(p_venue_id text, p_name text, p_code text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.ob_okey_rooms%rowtype; nm text; code_ text;
 token_ uuid; seat_no integer:=-1;i integer;d jsonb; attempts integer:=0;
begin
 if p_venue_id<>'70abef21-053c-4026-b402-e18311f758d5' then
  raise exception 'Okey henüz yalnız İyi Yol Akademi işletmesinde açık' using errcode='42501';
 end if;
 nm:=left(btrim(coalesce(p_name,'')),18);
 if char_length(nm)<2 then raise exception 'Oyuncu adı 2-18 karakter olmalıdır';end if;
 code_:=nullif(upper(btrim(coalesce(p_code,''))),'');
 if code_ is null then
  if (select count(*) from public.ob_okey_rooms where created_at>now()-interval '1 hour')>=24 then
   raise exception 'Yeni masa limiti doldu. Bir süre sonra tekrar deneyin';end if;
  code_:=upper(substr(md5(gen_random_uuid()::text),1,6));
  token_:=gen_random_uuid();
  insert into public.ob_okey_rooms(room_code,venue_id,players)
  values(code_,p_venue_id,jsonb_build_array(jsonb_build_object('name',nm,'token',token_::text,'hand','[]'::jsonb)))
  returning * into r;
  return oynabak_private.ob_okey_snapshot(r,token_) || jsonb_build_object('token',token_::text);
 end if;
 if code_ !~ '^[A-F0-9]{6}$' then raise exception 'Masa kodu 6 karakter olmalıdır';end if;
 select * into r from public.ob_okey_rooms where room_code=code_ and venue_id=p_venue_id for update;
 if not found then raise exception 'Masa bulunamadı';end if;
 if p_token is not null then
  for i in 0..jsonb_array_length(r.players)-1 loop
   if r.players->i->>'token'=p_token::text then seat_no:=i;exit;end if;
  end loop;
  if seat_no<0 then raise exception 'Bu masa için oturum anahtarınız geçerli değil';end if;
  return oynabak_private.ob_okey_snapshot(r,p_token) || jsonb_build_object('token',p_token::text);
 end if;
 if r.status<>'waiting' then raise exception 'Oyun başladı, yeni oyuncu katılamaz';end if;
 if jsonb_array_length(r.players)>=4 then raise exception 'Masa dolu';end if;
 token_:=gen_random_uuid();
 r.players:=r.players || jsonb_build_array(jsonb_build_object('name',nm,'token',token_::text,'hand','[]'::jsonb));
 if jsonb_array_length(r.players)=4 then
  d:=oynabak_private.ob_okey_deal(r.players);
  r.players:=d->'players';r.stock:=d->'stock';r.indicator:=(d->>'indicator')::int;
  r.status:='playing';r.turn:=0;r.phase:='discard';
 end if;
 update public.ob_okey_rooms set players=r.players,stock=r.stock,indicator=r.indicator,
 status=r.status,turn=r.turn,phase=r.phase,updated_at=now() where id=r.id returning * into r;
 return oynabak_private.ob_okey_snapshot(r,token_) || jsonb_build_object('token',token_::text);
end $function$

CREATE OR REPLACE FUNCTION public.ob_okey_state(p_code text, p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.ob_okey_rooms%rowtype;
begin
 if p_token is null or p_code is null then raise exception 'Masa oturumu gerekli';end if;
 select * into r from public.ob_okey_rooms
 where room_code=upper(btrim(p_code)) and venue_id='70abef21-053c-4026-b402-e18311f758d5';
 if not found then raise exception 'Masa bulunamadı';end if;
 return oynabak_private.ob_okey_snapshot(r,p_token);
end $function$

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
    from jsonb_array_elements(hand_) with ordinality z(value,ord) where (z.value)::text<>to_jsonb(p_tile)::text;
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

REVOKE EXECUTE ON FUNCTION public.ob_okey_open(text,text,text,uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.ob_okey_state(text,uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.ob_okey_act(text,uuid,text,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.ob_okey_open(text,text,text,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_okey_state(text,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_okey_act(text,uuid,text,integer) TO anon,authenticated;
COMMIT;
