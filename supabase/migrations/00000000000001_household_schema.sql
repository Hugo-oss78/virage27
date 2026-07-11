-- MHTL Wealth — core household schema
-- Reference: .claude/orchestration-wealth-tracker/research/supabase-react-native-implementation.md
-- Reference: .claude/orchestration-wealth-tracker/DISCOVERY.md (D6, D9-D13, D19, D26, D27, D29)

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  expo_push_token text,
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'invited', 'removed')),
  invited_by_user_id uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  unique (household_id, user_id)
);

-- provider: 'powens' | 'binance' | 'ledger_onchain' | 'manual' (Veracash/Placement Direct fallback, D16/D17)
-- account_type: 'bank' | 'brokerage' | 'crypto_exchange' | 'crypto_wallet' | 'gold' | 'life_insurance' | 'scpi'
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  provider text not null,
  account_type text not null,
  display_name text not null,
  currency text not null default 'EUR',
  last_synced_at timestamptz,
  sync_status text not null default 'ok' check (sync_status in ('ok', 'degraded', 'failed')),
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  asset_symbol text,
  quantity numeric,
  value_eur numeric not null,
  as_of timestamptz not null default now()
);

-- category taxonomy per D19: Logement, Charges & Abonnements, Alimentation, Restaurants,
-- Transport, Santé, Shopping, Loisirs, Voyages, Services, Épargne/Revenus/Virements internes (excluded from averages)
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  amount_eur numeric not null,
  category text,
  is_internal_transfer boolean not null default false,
  description text,
  occurred_at date not null,
  created_at timestamptz not null default now()
);

-- rolling 6-month window per D20
create table public.recurring_expense_stats (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null,
  rolling_median_eur numeric,
  rolling_mean_eur numeric,
  window_months int not null default 6,
  updated_at timestamptz not null default now(),
  unique (household_id, category)
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source text not null,
  status text not null check (status in ('ok', 'failed')),
  error text,
  ran_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.recovery_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  requested_by_user_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
