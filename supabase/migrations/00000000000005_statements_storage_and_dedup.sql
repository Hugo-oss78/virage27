-- MHTL Wealth — statements Storage bucket + transaction dedup helper (pivot v2)
-- Reference: .claude/orchestration-wealth-tracker/DISCOVERY.md D33-D38
-- Reference: .claude/orchestration-wealth-tracker/research/statement-scanning-extraction-implementation.md §4-5

insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

-- Bucket path convention: statements/{household_id}/{account_id}/{uuid}.{ext} (§4.2 of the research doc).
-- storage.foldername(name) splits the object path into its folder segments, so segment 1 is the household_id.
create policy "household members can read their statement files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'statements'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );

create policy "household members can upload their statement files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'statements'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );

create policy "household members can update their statement files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'statements'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'statements'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );

create policy "household members can delete their statement files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'statements'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );

create policy "require aal2 for statement files"
  on storage.objects
  as restrictive
  to authenticated
  using (
    bucket_id <> 'statements'
    or (select auth.jwt()->>'aal') = 'aal2'
  );

-- D35 deduplication: three-factor heuristic (date proximity, exact amount, fuzzy label match).
create extension if not exists pg_trgm;

-- For each newly-extracted transaction, returns existing transactions on the same account within
-- +/- p_window_days that already match on amount, tiered "probable" (date +/-1 day and label
-- similarity >= 0.85) vs "possible" (date within the window, amount matches, label weaker or unchecked).
-- Called once per extracted row before rendering the D35 correction screen — kept as a plain
-- deterministic query, independent of the vision-model extraction call (research §5.3).
create or replace function public.find_duplicate_transactions(
  p_account_id uuid,
  p_date date,
  p_amount_eur numeric,
  p_label text,
  p_window_days int default 3
)
returns table (
  transaction_id uuid,
  match_tier text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    case
      when abs(t.occurred_at - p_date) <= 1
        and similarity(coalesce(t.description, ''), coalesce(p_label, '')) >= 0.85
        then 'probable'
      else 'possible'
    end
  from public.transactions t
  where t.account_id = p_account_id
    and public.is_household_member(t.household_id)
    and t.occurred_at between p_date - p_window_days and p_date + p_window_days
    and abs(t.amount_eur - p_amount_eur) <= 0.01;
$$;

grant execute on function public.find_duplicate_transactions(uuid, date, numeric, text, int) to authenticated;
