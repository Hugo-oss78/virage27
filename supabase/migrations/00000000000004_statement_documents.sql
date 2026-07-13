-- MHTL Wealth — statement scanning (pivot v2, replaces Powens/DSP2 aggregation)
-- Reference: .claude/orchestration-wealth-tracker/DISCOVERY.md D33-D38

create table public.statement_documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  storage_path text not null,              -- Supabase Storage path, private bucket per household
  uploaded_by_user_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'extracted', 'failed', 'confirmed')),
  extraction_raw jsonb,                    -- raw structured output from the vision model, pre-correction
  extraction_error text,
  document_date date,                      -- statement date if extracted, used for D36 "as of" badge
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

alter table public.statement_documents enable row level security;

create policy "household members can read statement documents"
  on public.statement_documents for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "household members can insert statement documents"
  on public.statement_documents for insert
  to authenticated
  with check (public.is_household_member(household_id));

create policy "household members can update statement documents"
  on public.statement_documents for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "household members can delete statement documents"
  on public.statement_documents for delete
  to authenticated
  using (public.is_household_member(household_id));

create policy "require aal2 for statement_documents"
  on public.statement_documents
  as restrictive
  to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2');

-- D36: accounts.last_synced_at is repurposed for scanned accounts as "date of last confirmed statement",
-- set by the app when a statement_documents row transitions to 'confirmed'. No schema change needed —
-- the column already exists on public.accounts (00000000000001_household_schema.sql).

comment on column public.accounts.last_synced_at is
  'For API-backed accounts (crypto/gold/stocks): last automatic sync. For scanned accounts (bank/PEA/assurance-vie/Veracash/Placement Direct, D33): date of last confirmed statement upload.';
