-- MHTL Wealth — Row Level Security for the household model
-- Reference: .claude/orchestration-wealth-tracker/research/supabase-react-native-implementation.md §2-3

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
      and hm.status = 'active'
  );
$$;

grant execute on function public.is_household_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.accounts enable row level security;
alter table public.positions enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_expense_stats enable row level security;
alter table public.sync_runs enable row level security;
alter table public.notifications enable row level security;
alter table public.recovery_requests enable row level security;

create policy "users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "household members can read their household"
  on public.households for select
  to authenticated
  using (public.is_household_member(id));

create policy "members can read their household's membership rows"
  on public.household_members for select
  to authenticated
  using (public.is_household_member(household_id));

-- Repeat this 4-policy shape (select/insert/update/delete, same predicate) for every
-- household-scoped financial table: accounts, positions, transactions, recurring_expense_stats, sync_runs.
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'positions', 'transactions', 'recurring_expense_stats', 'sync_runs']
  loop
    execute format(
      'create policy "household members can read %1$s" on public.%1$s for select to authenticated using (public.is_household_member(household_id));',
      t
    );
    execute format(
      'create policy "household members can insert %1$s" on public.%1$s for insert to authenticated with check (public.is_household_member(household_id));',
      t
    );
    execute format(
      'create policy "household members can update %1$s" on public.%1$s for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));',
      t
    );
    execute format(
      'create policy "household members can delete %1$s" on public.%1$s for delete to authenticated using (public.is_household_member(household_id));',
      t
    );
  end loop;
end $$;

-- D10: restrictive MFA gate — ANDed with the policies above, can only narrow access.
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'positions', 'transactions', 'recurring_expense_stats', 'household_members']
  loop
    execute format(
      'create policy "require aal2 for %1$s" on public.%1$s as restrictive to authenticated using ((select auth.jwt()->>%2$L) = %3$L);',
      t, 'aal', 'aal2'
    );
  end loop;
end $$;

create policy "users can read their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "users can mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "household members can read recovery requests about them"
  on public.recovery_requests for select
  to authenticated
  using (public.is_household_member(household_id));
