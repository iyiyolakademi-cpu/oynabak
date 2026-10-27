-- OynaBak waiter-call sales readiness hardening (2026-10-27)
-- Existing QR codes, no-login guest flow and venue permission checks remain unchanged.
-- Normalize equivalent table labels, serialize same-table writes, cap outstanding abuse.
CREATE OR REPLACE FUNCTION public.ob_waiter_create(
  p_venue_id text,p_table_no text,p_request_type text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_id uuid;
  v_venue text := pg_catalog.btrim(coalesce(p_venue_id,''));
  v_raw_table text := pg_catalog.regexp_replace(coalesce(p_table_no,''),'[^0-9]','','g');
  v_table text;
  v_type text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_request_type,'')));
BEGIN
  IF v_venue='' THEN RAISE EXCEPTION 'İşletme bulunamadı.'; END IF;
  IF v_raw_table !~ '^[0-9]{1,3}$' OR v_raw_table::integer<1 THEN
    RAISE EXCEPTION 'Geçerli bir masa numarası yaz.';
  END IF;
  v_table := (v_raw_table::integer)::text;  -- 001 and 1 are the same table.
  IF v_type NOT IN ('waiter','bill','water','napkin') THEN
    RAISE EXCEPTION 'Geçersiz istek türü.';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM oynabak_private.venues v
    JOIN public.ob_venue_features f ON f.venue_id=v.id::text
    WHERE v.id::text=v_venue AND v.active AND v.licensed AND f.waiter
    AND v_table::integer<=coalesce(
      (SELECT s.table_count FROM public.ob_adisyon_settings s
       WHERE s.venue_id=v.id::text AND s.enabled),v.tables,0)
  ) THEN RAISE EXCEPTION 'Bu işletmede veya masada garson çağrısı etkin değil'; END IF;
  -- Prevent simultaneous requests from bypassing a 45-second duplicate check.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ob-waiter:'||v_venue||':'||v_table,0));
  IF EXISTS(
    SELECT 1 FROM public.waiter_calls
    WHERE venue_id=v_venue AND table_no=v_table AND status='pending'
      AND created_at>pg_catalog.now()-interval '45 seconds'
  ) THEN RAISE EXCEPTION 'Bu masa için kısa süre önce bir istek gönderildi. Lütfen biraz bekleyin.'; END IF;
  IF (SELECT count(*) FROM public.waiter_calls
      WHERE venue_id=v_venue AND table_no=v_table AND status='pending')>=4 THEN
    RAISE EXCEPTION 'Bu masanın bekleyen çağrıları var. Garsonun tamamlamasını bekleyin.';
  END IF;
  IF (SELECT count(*) FROM public.waiter_calls
      WHERE venue_id=v_venue AND status='pending')>=300 THEN
    RAISE EXCEPTION 'İşletmede çok sayıda bekleyen çağrı var. Görevliye doğrudan bilgi verin.';
  END IF;
  INSERT INTO public.waiter_calls(venue_id,table_no,request_type,status)
  VALUES(v_venue,v_table,v_type,'pending')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- The former 100-row cap hid calls from legitimate larger venues.
CREATE OR REPLACE FUNCTION public.ob_ops_waiter_list(p_venue_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 IF NOT public.ob_adisyon_permission(p_venue_id,'review') THEN
  RAISE EXCEPTION 'Garson yetkisi gerekli';
 END IF;
 RETURN coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at)
 FROM (
   SELECT w.id,w.venue_id,w.table_no,w.request_type,w.created_at
   FROM public.waiter_calls w
   WHERE w.venue_id=p_venue_id AND w.status='pending'
   ORDER BY w.created_at LIMIT 500
 ) x),'[]'::jsonb);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ob_waiter_create(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_waiter_create(text,text,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.ob_ops_waiter_list(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_ops_waiter_list(text) TO authenticated;
