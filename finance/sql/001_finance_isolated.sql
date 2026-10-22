-- OynaBak Ön Muhasebe - isolated install; run only in OynaBak's own Supabase project.
-- Venue ids must match existing oynabak_private.venues.id. No existing objects modified.
create table if not exists public.ob_finance_access (
 venue_id uuid primary key, enabled boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.ob_finance_members (
 venue_id uuid not null references public.ob_finance_access(venue_id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','editor','viewer')),
 primary key(venue_id,user_id)
);
create table if not exists public.ob_finance_accounts (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.ob_finance_access(venue_id),
 name text not null check(length(trim(name)) between 1 and 100),
 kind text not null check(kind in ('cash','pos','bank')),
 opening_balance numeric(15,2) not null default 0,
 created_at timestamptz not null default now(),
 unique(id,venue_id)
);
create table if not exists public.ob_finance_contacts (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.ob_finance_access(venue_id),
 name text not null check(length(trim(name)) between 1 and 150),
 kind text not null check(kind in ('customer','supplier')),
 phone text, note text, created_at timestamptz not null default now(),
 unique(id,venue_id)
);
create table if not exists public.ob_finance_entries (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.ob_finance_access(venue_id),
 kind text not null check(kind in ('income','expense','transfer_in','transfer_out','receivable','payable','contact_payment')),
 amount numeric(15,2) not null check(amount>0 and amount<100000000000),
 account_id uuid, contact_id uuid, related_id uuid,
 category text not null default 'Diğer', note text not null default '',
 occurred_on date not null default current_date,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 voided_at timestamptz, void_reason text,
 foreign key(account_id,venue_id) references public.ob_finance_accounts(id,venue_id),
 foreign key(contact_id,venue_id) references public.ob_finance_contacts(id,venue_id)
);
create table if not exists public.ob_finance_schedule (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.ob_finance_access(venue_id),
 title text not null check(length(trim(title)) between 1 and 150),
 amount numeric(15,2) not null check(amount>0),
 due_on date not null, recurrence text not null default 'none' check(recurrence in ('none','monthly')),
 status text not null default 'planned' check(status in ('planned','paid','cancelled')),
 created_at timestamptz not null default now()
);
create table if not exists public.ob_finance_stock (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.ob_finance_access(venue_id),
 name text not null check(length(trim(name)) between 1 and 150),
 unit text not null default 'adet', quantity numeric(15,3) not null default 0,
 critical_level numeric(15,3) not null default 0 check(critical_level>=0),
 updated_at timestamptz not null default now()
);
create table if not exists public.ob_finance_payroll (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.ob_finance_access(venue_id),
 staff_name text not null check(length(trim(staff_name)) between 1 and 150),
 kind text not null check(kind in ('salary','advance','other')),
 amount numeric(15,2) not null check(amount>0),
 paid_on date not null default current_date, note text not null default '',
 created_at timestamptz not null default now()
);
create table if not exists public.ob_finance_closings (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.ob_finance_access(venue_id),
 closing_date date not null, counted_cash numeric(15,2) not null check(counted_cash>=0),
 expected_cash numeric(15,2) not null,
 note text not null default '', closed_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 unique(venue_id,closing_date)
);
create index if not exists ob_finance_entries_venue_date on public.ob_finance_entries(venue_id,occurred_on desc);
create index if not exists ob_finance_schedule_due on public.ob_finance_schedule(venue_id,due_on);
create index if not exists ob_finance_members_user on public.ob_finance_members(user_id,venue_id);
-- Deny by default. Finance access and owner memberships must be provisioned out-of-band by OynaBak admin.
alter table public.ob_finance_access enable row level security;
alter table public.ob_finance_members enable row level security;
alter table public.ob_finance_accounts enable row level security;
alter table public.ob_finance_contacts enable row level security;
alter table public.ob_finance_entries enable row level security;
alter table public.ob_finance_schedule enable row level security;
alter table public.ob_finance_stock enable row level security;
alter table public.ob_finance_payroll enable row level security;
alter table public.ob_finance_closings enable row level security;
-- Membership self read only. Users cannot give themselves owner or enable finance.
create policy ob_fin_members_self on public.ob_finance_members for select to authenticated using(user_id=(select auth.uid()));
create policy ob_fin_access_read on public.ob_finance_access for select to authenticated using(
 enabled and exists(select 1 from public.ob_finance_members m where m.venue_id=ob_finance_access.venue_id and m.user_id=(select auth.uid()))
);
-- Helper predicates only reference self-visible membership rows and enabled access.
create or replace function public.ob_finance_can_read(p_venue uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.ob_finance_access a join public.ob_finance_members m on m.venue_id=a.venue_id
 where a.venue_id=p_venue and a.enabled and m.user_id=(select auth.uid()))
$$;
create or replace function public.ob_finance_can_write(p_venue uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.ob_finance_access a join public.ob_finance_members m on m.venue_id=a.venue_id
 where a.venue_id=p_venue and a.enabled and m.user_id=(select auth.uid()) and m.role in ('owner','editor'))
$$;
-- Careful: helper function on access table reads via its own RLS, never grants access.
create policy ob_fin_accounts_r on public.ob_finance_accounts for select to authenticated using(public.ob_finance_can_read(venue_id));
create policy ob_fin_accounts_i on public.ob_finance_accounts for insert to authenticated with check(public.ob_finance_can_write(venue_id));
create policy ob_fin_accounts_u on public.ob_finance_accounts for update to authenticated using(public.ob_finance_can_write(venue_id)) with check(public.ob_finance_can_write(venue_id));
create policy ob_fin_contacts_r on public.ob_finance_contacts for select to authenticated using(public.ob_finance_can_read(venue_id));
create policy ob_fin_contacts_i on public.ob_finance_contacts for insert to authenticated with check(public.ob_finance_can_write(venue_id));
create policy ob_fin_contacts_u on public.ob_finance_contacts for update to authenticated using(public.ob_finance_can_write(venue_id)) with check(public.ob_finance_can_write(venue_id));
create policy ob_fin_entries_r on public.ob_finance_entries for select to authenticated using(public.ob_finance_can_read(venue_id));
create policy ob_fin_entries_i on public.ob_finance_entries for insert to authenticated with check(public.ob_finance_can_write(venue_id) and created_by=(select auth.uid()) and voided_at is null);
-- Financial entries are immutable from the client to preserve a basic audit trail.
create policy ob_fin_schedule_r on public.ob_finance_schedule for select to authenticated using(public.ob_finance_can_read(venue_id));
create policy ob_fin_schedule_i on public.ob_finance_schedule for insert to authenticated with check(public.ob_finance_can_write(venue_id));
create policy ob_fin_schedule_u on public.ob_finance_schedule for update to authenticated using(public.ob_finance_can_write(venue_id)) with check(public.ob_finance_can_write(venue_id));
create policy ob_fin_stock_r on public.ob_finance_stock for select to authenticated using(public.ob_finance_can_read(venue_id));
create policy ob_fin_stock_i on public.ob_finance_stock for insert to authenticated with check(public.ob_finance_can_write(venue_id));
create policy ob_fin_stock_u on public.ob_finance_stock for update to authenticated using(public.ob_finance_can_write(venue_id)) with check(public.ob_finance_can_write(venue_id));
create policy ob_fin_payroll_r on public.ob_finance_payroll for select to authenticated using(public.ob_finance_can_read(venue_id));
create policy ob_fin_payroll_i on public.ob_finance_payroll for insert to authenticated with check(public.ob_finance_can_write(venue_id));
create policy ob_fin_closings_r on public.ob_finance_closings for select to authenticated using(public.ob_finance_can_read(venue_id));
create policy ob_fin_closings_i on public.ob_finance_closings for insert to authenticated with check(public.ob_finance_can_write(venue_id));
-- Allow access to eligible authenticated users, subject to RLS.
grant select on public.ob_finance_access,public.ob_finance_members to authenticated;
grant select,insert,update on public.ob_finance_accounts,public.ob_finance_contacts,public.ob_finance_schedule,public.ob_finance_stock to authenticated;
grant select,insert on public.ob_finance_entries,public.ob_finance_payroll,public.ob_finance_closings to authenticated;
grant execute on function public.ob_finance_can_read(uuid),public.ob_finance_can_write(uuid) to authenticated;
-- INSTALLER ACTION REQUIRED:
-- 1. Verify existing auth mapping and add the correct venue UUID to ob_finance_access, enabled=false.
-- 2. Assign owner's auth.users.id to ob_finance_members (role=owner) using trusted admin SQL.
-- 3. Test isolation under two real merchant sessions.
-- 4. Only after testing set enabled=true for an explicitly selected venue.
