-- One floor plan per subscribed OynaBak venue. Existing QR/printed table numbers unchanged.
-- Only the OynaBak owner/merchant may save; authenticated venue users may view.
create table if not exists public.ob_adisyon_floor_plans(
 venue_id text primary key,
 positions jsonb not null default '[]'::jsonb,
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 constraint ob_adisyon_floor_positions_array check(jsonb_typeof(positions)='array')
);
alter table public.ob_adisyon_floor_plans enable row level security;
revoke all on public.ob_adisyon_floor_plans from public,anon,authenticated;

create or replace function public.ob_adisyon_floor_get(p_venue_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare current_layout public.ob_adisyon_floor_plans%rowtype;
begin
 if not public.ob_adisyon_permission(p_venue_id,'read') then
  raise exception 'Bu isletmenin masa planina erisiminiz yok';
 end if;
 select * into current_layout from public.ob_adisyon_floor_plans where venue_id=p_venue_id;
 if not found then return jsonb_build_object('positions','[]'::jsonb,'version',0); end if;
 return jsonb_build_object('positions',current_layout.positions,'version',current_layout.version,
  'updated_at',current_layout.updated_at);
end $$;

create or replace function public.ob_adisyon_floor_save(
 p_venue_id text,p_positions jsonb,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare n integer; rec record; seen integer[]:='{}'::integer[];
 new_version integer;
begin
 if not public.ob_adisyon_owner(p_venue_id) then
  raise exception 'Masa planini sadece isletme yoneticisi kaydedebilir';
 end if;
 select table_count into n from public.ob_adisyon_settings
  where venue_id=p_venue_id and enabled for share;
 if n is null or n not between 1 and 200 then raise exception 'Adisyon paketi kapali'; end if;
 if p_positions is null or jsonb_typeof(p_positions)<>'array'
    or jsonb_array_length(p_positions)<>n then
  raise exception 'Plan butun masalari birer kez icermeli'; end if;
 for rec in select value as item from jsonb_array_elements(p_positions)
 loop
  if jsonb_typeof(rec.item)<>'object'
   or jsonb_typeof(rec.item->'table')<>'number'
   or jsonb_typeof(rec.item->'x')<>'number'
   or jsonb_typeof(rec.item->'y')<>'number'
   or (rec.item->>'table') !~ '^[0-9]{1,3}$'
   or (rec.item->>'x') !~ '^[0-9]+([.][0-9]+)?$'
   or (rec.item->>'y') !~ '^[0-9]+([.][0-9]+)?$'
  then raise exception 'Masa koordinatlari veya numarasi gecersiz'; end if;
  if (rec.item->>'table')::integer not between 1 and n
   or (rec.item->>'table')::integer=any(seen)
   or (rec.item->>'x')::numeric not between 0 and 100
   or (rec.item->>'y')::numeric not between 0 and 100 then
   raise exception 'Masa numarasi tekrarlaniyor veya konumu sinir disinda'; end if;
  seen:=array_append(seen,(rec.item->>'table')::integer);
 end loop;
 if p_expected_version=0 then
  insert into public.ob_adisyon_floor_plans(venue_id,positions,version,updated_by)
  values(p_venue_id,p_positions,1,auth.uid()) on conflict do nothing
  returning version into new_version;
 else
  update public.ob_adisyon_floor_plans set
   positions=p_positions,version=version+1,updated_at=now(),updated_by=auth.uid()
  where venue_id=p_venue_id and version=p_expected_version
  returning version into new_version;
 end if;
 if new_version is null then
  raise exception 'Masa plani baska cihazda degistirildi. Yenileyip tekrar deneyin';
 end if;
 return jsonb_build_object('positions',p_positions,'version',new_version);
end $$;

revoke all on function public.ob_adisyon_floor_get(text),
 public.ob_adisyon_floor_save(text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.ob_adisyon_floor_get(text),
 public.ob_adisyon_floor_save(text,jsonb,integer) to authenticated;
