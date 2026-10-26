CREATE OR REPLACE FUNCTION public.ob_adisyon_set_enabled(p_venue_id text, p_enabled boolean, p_table_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.ob_adisyon_has_access(p_venue_id,true) then raise exception 'Yetkisiz islem'; end if;
 if p_venue_id is null or p_table_count is null or p_table_count not between 1 and 200 then
  raise exception 'Gecersiz isletme veya masa sayisi';
 end if;
 if not exists (select 1 from oynabak_private.venues v where v.id::text=p_venue_id) then
  raise exception 'Isletme bulunamadi';
 end if;
 insert into public.ob_adisyon_settings(venue_id,enabled,table_count)
 values(p_venue_id,p_enabled,p_table_count)
 on conflict(venue_id) do update
  set enabled=excluded.enabled,table_count=excluded.table_count,updated_at=now(),
   staff_pin_enabled=case when excluded.enabled
      then public.ob_adisyon_settings.staff_pin_enabled else false end;
 if not p_enabled then
  update public.ob_staff_pin_devices set unlocked_until=null where venue_id=p_venue_id;
  update public.ob_staff_pairing_invites set expires_at=now()
   where venue_id=p_venue_id and used_at is null and expires_at>now();
 end if;
 return public.ob_adisyon_status(p_venue_id);
end $function$

CREATE OR REPLACE FUNCTION public.ob_staff_pin_toggle(p_venue_id text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.ob_staff_is_admin() then raise exception 'Yonetici yetkisi gerekli'; end if;
 if not exists(select 1 from oynabak_private.venues v where v.id::text=p_venue_id)
 then raise exception 'Isletme bulunamadi'; end if;
 if p_enabled and not exists(select 1 from public.ob_adisyon_settings
  where venue_id=p_venue_id and enabled) then
  raise exception 'Once isletmenin adisyon paketini acin';
 end if;
 update public.ob_adisyon_settings set staff_pin_enabled=p_enabled,updated_at=now()
 where venue_id=p_venue_id;
 if not found then raise exception 'Adisyon paketi tanimli degil'; end if;
 -- Disabling takes effect immediately via server permission gate.
 if not p_enabled then
  update public.ob_staff_pin_devices set unlocked_until=null
  where venue_id=p_venue_id;
  update public.ob_staff_pairing_invites set expires_at=now()
   where venue_id=p_venue_id and used_at is null and expires_at>now();
 end if;
 return jsonb_build_object('venue_id',p_venue_id,'enabled',p_enabled);
end $function$
