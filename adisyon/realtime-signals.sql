-- OynaBak: secure tenant-scoped Realtime invalidation without order/customer payload.
-- All operational data stays behind existing authenticated RPCs.
create table if not exists public.ob_adisyon_signals (
 venue_id text primary key,
 revision bigint not null default 0,
 kind text not null default 'change' check (kind in ('order','item','ticket')),
 updated_at timestamptz not null default now()
);
alter table public.ob_adisyon_signals enable row level security;
revoke all on public.ob_adisyon_signals from public, anon, authenticated;
grant select on public.ob_adisyon_signals to authenticated;
drop policy if exists ob_adisyon_signals_staff_read on public.ob_adisyon_signals;
create policy ob_adisyon_signals_staff_read
 on public.ob_adisyon_signals for select to authenticated
 using (public.ob_adisyon_permission(venue_id,'read'));

create or replace function public.ob_adisyon_emit_signal()
returns trigger language plpgsql security definer set search_path=''
as $$
declare target_venue text;
begin
 target_venue:=case when TG_OP='DELETE' then OLD.venue_id else NEW.venue_id end;
 if target_venue is not null and exists
  (select 1 from public.ob_adisyon_settings where venue_id=target_venue and enabled)
 then
  insert into public.ob_adisyon_signals(venue_id,revision,kind,updated_at)
  values(target_venue,1,
   case TG_TABLE_NAME
    when 'ob_customer_order_requests' then 'order'
    when 'ob_adisyon_items' then 'item' else 'ticket' end,now())
  on conflict(venue_id) do update
   set revision=public.ob_adisyon_signals.revision+1,
       kind=excluded.kind,updated_at=excluded.updated_at;
 end if;
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
revoke all on function public.ob_adisyon_emit_signal() from public,anon,authenticated;

drop trigger if exists ob_qr_orders_signal on public.ob_customer_order_requests;
create trigger ob_qr_orders_signal after insert or update of status
on public.ob_customer_order_requests for each row
execute function public.ob_adisyon_emit_signal();

drop trigger if exists ob_adisyon_items_signal on public.ob_adisyon_items;
create trigger ob_adisyon_items_signal after insert or update of status
on public.ob_adisyon_items for each row
execute function public.ob_adisyon_emit_signal();

drop trigger if exists ob_adisyon_tickets_signal on public.ob_adisyon_tickets;
create trigger ob_adisyon_tickets_signal after insert or update of status, table_no
on public.ob_adisyon_tickets for each row
execute function public.ob_adisyon_emit_signal();

do $$
begin
 if not exists (
  select 1 from pg_catalog.pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public'
  and tablename='ob_adisyon_signals'
 ) then
  alter publication supabase_realtime add table public.ob_adisyon_signals;
 end if;
end $$;
