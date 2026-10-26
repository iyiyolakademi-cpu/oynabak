-- OynaBak 2026-10-27 operational quality upgrade.
-- This deployment was already applied to the production project.
-- Keep this file as reproducible schema documentation; do NOT run blindly twice.
-- Existing printed QR codes, license/feature switches and staff login are unchanged.

BEGIN;

-- Security: these are trigger functions, not REST endpoints.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.ob_finance_audit_capture() FROM PUBLIC,anon,authenticated;

-- Store the Instagram URL and the edited table count, not a hard-coded 1.
CREATE OR REPLACE FUNCTION public.ob_merchant_save(p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE n integer; insta text;
BEGIN
 n:=coalesce((p->>'tables')::int,1); insta:=coalesce(p->>'instagram_url','');
 IF n NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Masa sayısı 1-200 arasında olmalıdır'; END IF;
 IF length(insta)>1999 OR (insta<>'' AND insta !~* '^https://(www\.)?instagram\.com/[^[:space:]]+$')
 THEN RAISE EXCEPTION 'Instagram bağlantısı geçersiz'; END IF;
 UPDATE oynabak_private.venues v SET
   name=btrim(p->>'name'),color=p->>'color',review_url=coalesce(p->>'review_url',''),
   instagram_url=CASE WHEN p ? 'instagram_url' THEN insta ELSE v.instagram_url END,
   tables=n
 WHERE v.id=(p->>'id')::uuid
   AND EXISTS (SELECT 1 FROM oynabak_private.accounts a
       WHERE a.user_id=auth.uid() AND a.venue_id=v.id AND a.status='active');
 IF NOT FOUND THEN RAISE EXCEPTION 'Bu işletmeyi düzenleme yetkiniz yok.' USING errcode='42501'; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.ob_save_venue(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE vid uuid; en text[]; n integer; insta text;
BEGIN
 PERFORM oynabak_private.check_admin();
 SELECT coalesce(array_agg(value),'{}'::text[]) INTO en FROM jsonb_array_elements_text(p->'enabled');
 n:=coalesce((p->>'tables')::int,1);insta:=coalesce(p->>'instagram_url','');
 IF n NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Masa sayısı 1-200 arasında olmalıdır'; END IF;
 IF length(insta)>1999 OR (insta<>'' AND insta !~* '^https://(www\.)?instagram\.com/[^[:space:]]+$')
 THEN RAISE EXCEPTION 'Instagram bağlantısı geçersiz'; END IF;
 vid:=nullif(p->>'id','')::uuid;
 IF vid IS NULL THEN
  INSERT INTO oynabak_private.venues(name,sector,color,review_url,instagram_url,tables,enabled,active,licensed)
  VALUES(btrim(p->>'name'),p->>'sector',p->>'color',coalesce(p->>'review_url',''),
    insta,n,en,(p->>'active')::boolean,(p->>'licensed')::boolean)
  RETURNING id INTO vid;
 ELSE
  UPDATE oynabak_private.venues SET name=btrim(p->>'name'),sector=p->>'sector',color=p->>'color',
  review_url=coalesce(p->>'review_url',''),
  instagram_url=CASE WHEN p ? 'instagram_url' THEN insta ELSE instagram_url END,
  tables=n,enabled=en,active=(p->>'active')::boolean,licensed=(p->>'licensed')::boolean
  WHERE id=vid;
  IF NOT FOUND THEN RAISE EXCEPTION 'İşletme bulunamadı'; END IF;
 END IF;
 RETURN vid;
END $fn$;

-- Reports count customer interactions without recording payment.
CREATE OR REPLACE FUNCTION public.ob_ops_daily_summary(p_venue_id text,p_days integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE start_at timestamptz; d integer:=least(greatest(coalesce(p_days,1),1),30);
BEGIN
 IF NOT public.ob_adisyon_owner(p_venue_id) THEN RAISE EXCEPTION 'Bu işletmeye erişim yok' USING errcode='42501'; END IF;
 start_at:=((now() AT TIME ZONE 'Europe/Istanbul')::date-(d-1))::timestamp AT TIME ZONE 'Europe/Istanbul';
 RETURN jsonb_build_object(
  'days',d,
  'qr',(SELECT count(*) FROM public.ob_events WHERE venue_id=p_venue_id AND event_type='qr_open' AND created_at>=start_at),
  'games',(SELECT count(*) FROM public.ob_events WHERE venue_id=p_venue_id AND event_type='game_open' AND created_at>=start_at),
  'menu',(SELECT count(*) FROM public.ob_events WHERE venue_id=p_venue_id AND event_type='menu_open' AND created_at>=start_at),
  'waiter',(SELECT count(*) FROM public.waiter_calls WHERE venue_id=p_venue_id AND created_at>=start_at),
  'order_requests',(SELECT count(*) FROM public.ob_customer_order_requests WHERE venue_id=p_venue_id AND created_at>=start_at),
  'pending_orders',(SELECT count(*) FROM public.ob_customer_order_requests WHERE venue_id=p_venue_id AND status='pending'),
  'pending_waiter',(SELECT count(*) FROM public.waiter_calls WHERE venue_id=p_venue_id AND status='pending')
 );
END $fn$;
REVOKE ALL ON FUNCTION public.ob_ops_daily_summary(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_ops_daily_summary(text,integer) TO authenticated;

-- Event table=0 stands for an unknown table; stops fabricated Table 1 analytics.
ALTER TABLE public.ob_events DROP CONSTRAINT IF EXISTS ob_events_table_check;
ALTER TABLE public.ob_events ADD CONSTRAINT ob_events_table_check CHECK (table_no BETWEEN 0 AND 1000);
CREATE OR REPLACE FUNCTION public.ob_event_v3(vid text,et text,t integer,k text,g text DEFAULT NULL,s integer DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF btrim(coalesce(vid,''))='' OR et NOT IN ('qr_open','games_open','review_click','game_open','game_finish','menu_open','menu_category')
 OR btrim(coalesce(k,''))='' THEN RETURN false; END IF;
 INSERT INTO public.ob_events(venue_id,event_type,table_no,event_key,game_key,score)
 VALUES(btrim(vid),et,greatest(0,least(coalesce(t,0),1000)),left(k,180),
  nullif(left(coalesce(g,''),140),''),CASE WHEN s IS NULL THEN NULL ELSE greatest(0,least(s,100)) END)
 ON CONFLICT (venue_id,event_type,event_key) DO NOTHING;
 RETURN true;
END $fn$;

-- Cover referenced fields and reduce work done per row for an RLS expression.
CREATE INDEX IF NOT EXISTS ob_adisyon_floor_updated_by_idx ON public.ob_adisyon_floor_plans(updated_by);
CREATE INDEX IF NOT EXISTS ob_adisyon_split_item_id_idx ON public.ob_adisyon_split_allocations(item_id);
CREATE INDEX IF NOT EXISTS ob_customer_orders_ticket_id_idx ON public.ob_customer_order_requests(ticket_id);
CREATE INDEX IF NOT EXISTS ob_finance_accounts_venue_id_idx ON public.ob_finance_accounts(venue_id);
CREATE INDEX IF NOT EXISTS ob_finance_contacts_venue_id_idx ON public.ob_finance_contacts(venue_id);
CREATE INDEX IF NOT EXISTS ob_finance_entries_venue_account_idx ON public.ob_finance_entries(account_id,venue_id);
CREATE INDEX IF NOT EXISTS ob_finance_entries_contact_idx ON public.ob_finance_entries(contact_id);
CREATE INDEX IF NOT EXISTS ob_finance_members_user_id_idx ON public.ob_finance_members(user_id);
CREATE INDEX IF NOT EXISTS ob_finance_payroll_venue_id_idx ON public.ob_finance_payroll(venue_id);
CREATE INDEX IF NOT EXISTS ob_finance_schedule_account_idx ON public.ob_finance_schedule(account_id);
CREATE INDEX IF NOT EXISTS ob_finance_schedule_paid_entry_idx ON public.ob_finance_schedule(paid_entry_id);
CREATE INDEX IF NOT EXISTS ob_finance_stock_venue_id_idx ON public.ob_finance_stock(venue_id);
CREATE INDEX IF NOT EXISTS ob_finance_stock_moves_item_id_idx ON public.ob_finance_stock_moves(item_id);
CREATE INDEX IF NOT EXISTS ob_finance_stock_moves_venue_id_idx ON public.ob_finance_stock_moves(venue_id);
CREATE INDEX IF NOT EXISTS ob_staff_invites_used_by_idx ON public.ob_staff_pairing_invites(used_by);
ALTER POLICY ob_finance_members_read ON public.ob_finance_members
 USING ((user_id=(select auth.uid())) AND (ob_finance_role(venue_id) IS NOT NULL));

COMMIT;

-- Instance-only correction executed separately: Freed 35 tables + existing Instagram
-- link, Ayberk 10 tables. Not embedded here to avoid changing other deployments.
