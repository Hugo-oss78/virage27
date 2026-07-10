# Research: Supabase + React Native Implementation Patterns — MHTL Wealth

**Aspect:** supabase-react-native-implementation (second-wave / implementation-focused)
**Project:** MHTL Wealth — household net-worth tracker, 2-user household, React Native + Expo + Supabase
**Scope:** concrete implementation patterns for a stack already decided (D5 React Native/Expo, D6 Supabase). Not a tool comparison — this is code-example-oriented, meant to drive task files directly.
**Date:** 2026-07-10

Relevant Discovery decisions referenced throughout: D5 (RN/Expo), D6 (Supabase), D9 (solo maintainer, operational simplicity), D10 (mandatory TOTP MFA), D11 (biometric unlock layered on session, not a replacement), D12 (partner-assisted recovery), D13 (no audit log needed), D25 (Apple-free-account dev-client constraint), D26 (sync-failure push+in-app alerts), D27 (nightly auto sync + manual pull-to-refresh).

---

## 1. Summary

All the concrete pieces needed to implement the decided stack exist as first-class, documented Supabase/Expo features — nothing here requires an exotic workaround except **partner-assisted recovery (D12)**, which has no native Supabase primitive and must be a custom Edge Function.

- **Household RLS**: standard "tenant_id on every table + membership join table" pattern. Use a `SECURITY DEFINER` helper function (`is_household_member(household_id)`) rather than inlining the subquery in every policy — cleaner, and avoids the classic RLS-on-joined-tables pitfall where each table's own RLS is evaluated independently.
- **MFA**: Supabase Auth's built-in TOTP factor (`supabase.auth.mfa.enroll/challenge/verify`) plus a JWT `aal` claim that RLS policies can check directly (`(select auth.jwt()->>'aal') = 'aal2'`) — no external TOTP library needed, and MFA enforcement can live at the database layer, not just app-layer, which matters for defense-in-depth for financial data (D10).
- **Partner-assisted recovery (D12)**: no Supabase-native feature does this. Must be a custom Edge Function using the **service-role key** + `admin.generateLink({ type: 'recovery' })` (or `admin.updateUserById`), gated by a query that confirms both users share an *active* `household_members` row. This is the one genuinely custom piece of backend logic in the whole system.
- **Nightly sync job (D27)**: `pg_cron` (enabled by default on every Supabase project) scheduling a `net.http_post` call to an Edge Function, secured via a secret stored in Supabase Vault rather than hardcoded in SQL. **Important pitfall**: pg_cron's HTTP call via `pg_net` is fire-and-forget — no built-in retry on 5xx and no built-in alerting on failure. Failure detection/alerting (D26) must be built explicitly into the Edge Function's own error handling (write a `sync_runs` row, then a second, simpler always-succeeds step reads that table and fires the push notification on failure — don't rely on pg_cron itself to notice).
- **Expo native layers**: `expo-secure-store` for tokens (Keychain/Keystore-backed, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` on iOS), `expo-local-authentication` as a pure local unlock gate in front of a SecureStore-held session (never a replacement for the Supabase session/password/MFA), `expo-notifications` + Expo's push service + a `push_tokens` table + Database Webhook → Edge Function → `https://exp.host/--/api/v2/push/send` for D21/D26 alerts.
- **EAS Build**: two build profiles are enough for the whole v1 lifecycle — `development` (`developmentClient: true`, `distribution: "internal"`, works with a free Apple ID for solo on-device testing per D25) and `preview`/`production` (real Apple Developer Program build for TestFlight once the $99/yr account is activated, D24/D25) plus an Android `apk` profile for pure sideload distribution to the spouse at zero cost.

---

## 2. Household RLS Pattern (concrete SQL)

### 2.1 Core tables

```sql
-- Identity stays in auth.users (Supabase-managed). Add an app-level profile only if needed for
-- display name / avatar — do NOT duplicate password/MFA state, Supabase Auth owns that.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
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

-- Every financial table carries household_id, never user_id, as the tenancy key.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  provider text not null,             -- 'powens' | 'binance' | 'manual' | 'veracash' | ...
  account_type text not null,         -- 'bank' | 'brokerage' | 'crypto_exchange' | 'crypto_wallet' | 'gold' | ...
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

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  amount_eur numeric not null,
  category text,
  description text,
  occurred_at date not null,
  created_at timestamptz not null default now()
);

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null,
  rolling_median_eur numeric,
  rolling_mean_eur numeric,
  window_months int not null default 6,
  updated_at timestamptz not null default now()
);
```

### 2.2 Helper function (avoid inlining the join in every policy)

```sql
-- SECURITY DEFINER so it can read household_members regardless of the caller's own RLS grants,
-- STABLE so Postgres can cache the result within a single statement/query plan.
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
```

### 2.3 Enable RLS + policies (repeat shape per financial table)

```sql
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.accounts enable row level security;
alter table public.positions enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_expenses enable row level security;

-- households: a user can see a household iff they're an active member of it.
create policy "household members can read their household"
  on public.households for select
  to authenticated
  using (public.is_household_member(id));

-- household_members: a user can see the membership rows of households they belong to
-- (so each partner can see the other's row — needed for D12 partner-assisted recovery UI).
create policy "members can read their household's membership rows"
  on public.household_members for select
  to authenticated
  using (public.is_household_member(household_id));

-- Example concrete policy for a financial table — this shape is IDENTICAL across
-- accounts / positions / transactions / recurring_expenses, just swap the table name:
create policy "household members can read accounts"
  on public.accounts for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "household members can insert accounts"
  on public.accounts for insert
  to authenticated
  with check (public.is_household_member(household_id));

create policy "household members can update accounts"
  on public.accounts for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "household members can delete accounts"
  on public.accounts for delete
  to authenticated
  using (public.is_household_member(household_id));

-- Repeat the same 4 policies (select/insert/update/delete), same predicate, for:
--   positions, transactions, recurring_expenses
```

### 2.4 Pitfalls specific to this pattern

- **RLS on joined tables is evaluated independently per table.** If a query joins `accounts` to `positions`, Postgres checks each table's own RLS policy separately — a row can silently disappear from a join result even though the "parent" row was visible. Since every table here carries its own `household_id` and the same `is_household_member()` predicate, this isn't a correctness problem for this schema, but it's the reason to keep `household_id` denormalized onto every child table (positions, transactions) rather than relying on a join back up to `accounts` to determine visibility.
- **Wrap `auth.uid()`/`auth.jwt()` calls in `(select ...)`** inside policies (as shown in the MFA policy in §3) — Postgres's planner can then treat it as an `initplan` evaluated once per statement instead of once per row, which matters once transaction/position tables grow.
- **Never use `SECURITY DEFINER` without `set search_path`** — a stale/attacker-influenced `search_path` in a `SECURITY DEFINER` function is a classic Postgres privilege-escalation vector.
- Because there is no audit log requirement (D13), no additional trigger-based logging is needed on these tables — keep the schema exactly this lean.

---

## 3. Auth + MFA Implementation (D10)

### 3.1 Enrollment flow (TOTP, mandatory for both household members)

Client-side (React Native, same `supabase-js` API as web — no separate mobile MFA SDK needed):

```ts
// Step 1: start enrollment (call once when user opts into / is forced into MFA setup)
const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
// data.id            -> factorId, needed for challenge/verify
// data.totp.qr_code  -> SVG data URL; render as <Image> via a data-URI-to-PNG helper
//                       (react-native-svg or a QR rendering lib, since RN <img> doesn't exist —
//                       simplest is to also show data.totp.secret as manual-entry text)

// Step 2: user scans QR / enters secret in Authenticator app, then types the 6-digit code.
const challenge = await supabase.auth.mfa.challenge({ factorId: data.id });

const verify = await supabase.auth.mfa.verify({
  factorId: data.id,
  challengeId: challenge.data.id,
  code: userEnteredCode,
});
// On success, session is upgraded to aal2 immediately.
```

Note for RN: `data.totp.qr_code` is an SVG string, not directly usable as a React Native `<Image source={{uri}}>` the way it is on web with an `<img>` tag. Practical options: render the QR with `react-native-qrcode-svg` using `data.totp.secret` as the payload string (`otpauth://totp/...`), or convert the returned SVG to a data URI and use `react-native-svg`'s `SvgXml`. Always also show the raw secret as selectable text for manual entry — necessary fallback when QR scanning fails on-device.

### 3.2 Login-time AAL check and challenge

```ts
async function needsMfaChallenge() {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // data.currentLevel: the level of the *current* session
  // data.nextLevel: the highest level the user *could* reach given enrolled factors
  return data.nextLevel === 'aal2' && data.nextLevel !== data.currentLevel;
}

// After email+password sign-in succeeds (session is aal1), call needsMfaChallenge().
// If true, show the TOTP entry screen, then:
async function verifyTotp(code: string) {
  const factors = await supabase.auth.mfa.listFactors();
  const totpFactor = factors.data.totp[0];
  const challenge = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
  return supabase.auth.mfa.verify({
    factorId: totpFactor.id,
    challengeId: challenge.data.id,
    code,
  });
  // On success the session JWT's `aal` claim becomes 'aal2'.
}
```

### 3.3 Enforcing "MFA required" at the database level (defense in depth)

Supabase issues an `aal` claim (`aal1` or `aal2`) in every JWT. RLS policies can check it directly — this means even if a client bug lets a user reach a screen before completing MFA, the database still refuses to serve financial data:

```sql
-- Restrictive policy = ANDed with all other policies on the table (not OR'd), so it can only
-- narrow access, never grant it. This is what makes it a hard MFA gate rather than a permissive
-- opt-in policy that a broader "select" policy could bypass.
create policy "require aal2 for all household financial tables"
  on public.accounts
  as restrictive
  to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2');

-- Repeat identically (as restrictive, same predicate) on positions, transactions,
-- recurring_expenses, and household_members if you want membership data itself gated too.
```

Since D10 makes MFA **mandatory** (not optional) for both household members, the practical app-level rule is: refuse to let a user finish onboarding until `mfa.enroll` + `mfa.verify` succeeds at least once, and treat "has no verified TOTP factor" as a permanent redirect-to-enrollment state, not just a login-time nudge. The restrictive RLS policy above is what actually enforces this even if that app-level gate is ever bypassed by a bug.

### 3.4 Session refresh + biometric unlock layering (D11)

- The Supabase session (access token ~1hr default + refresh token) is stored via `expo-secure-store`, **not** AsyncStorage (see §6.1).
- Biometric unlock (`expo-local-authentication`) never talks to Supabase directly — it's a **local gate in front of already-stored SecureStore session data**. Concretely: on app foreground/cold-start, if a valid (non-expired) Supabase session exists in SecureStore, call `LocalAuthentication.authenticateAsync()`; only after that resolves `success: true` do you rehydrate `supabase.auth.setSession(...)` from the stored tokens and let the UI proceed. If biometric auth fails or is cancelled, fall back to requiring the full password (+ MFA if session has fully expired) login screen — never silently grant access.
- Full password+MFA login (not just biometric) is required again once the underlying Supabase session/refresh token has actually expired (per D11 — "Login complet ... à la première connexion / après expiration de session"), which is a Supabase Auth session-lifetime setting, independent of the biometric convenience layer.

---

## 4. Partner Recovery Pattern (D12)

**No Supabase-native feature implements this.** Supabase's own password-reset flow (`resetPasswordForEmail`) is single-user and email-only. "Partner can assist in unblocking/validating recovery for the other member of the same household" requires a **custom Edge Function** using the **service role key** (server-side only, never shipped to the client).

### 4.1 Design

1. Locked-out member (User A) requests recovery from the app (as today, standard `resetPasswordForEmail` email flow — this must remain available per D12: "en plus (pas à la place) du flux standard").
2. **Additionally**, User B (the partner, same household, `status = 'active'`) can, from *their own authenticated+MFA'd session*, trigger a "help my partner recover access" action for User A.
3. This action must **not** silently reset User A's password (that would let User B fully take over User A's account without User A's own action) — the safer pattern is: User B's action generates a **short-lived, single-use recovery link** that is sent to User A's own verified email (not shown to User B, not returned to User B's client) or that flips a `recovery_assist_requested` flag that unblocks a subsequent reset flow for User A. This preserves "only the account owner can actually complete the reset" while letting the partner *initiate/vouch for* it — matching the "assist, don't replace" framing.

### 4.2 Edge Function sketch

```ts
// supabase/functions/partner-assisted-recovery/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  // Client bound to the CALLER's JWT — used only to verify who's calling and that they're aal2.
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user: callerUser }, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerUser) return new Response('Unauthorized', { status: 401 });

  // Require the caller's own session to be aal2 — a partner who hasn't completed their OWN
  // MFA shouldn't be able to kick off a recovery action for someone else.
  const { data: aalData } = await callerClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalData?.currentLevel !== 'aal2') {
    return new Response('MFA required', { status: 403 });
  }

  const { targetUserId } = await req.json();

  // Service-role client — only used for the admin-privileged household check + link generation,
  // never exposed to the client.
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Confirm both users share an ACTIVE household_members row for the SAME household.
  const { data: sharedHousehold } = await adminClient
    .from('household_members')
    .select('household_id')
    .in('user_id', [callerUser.id, targetUserId])
    .eq('status', 'active');

  const householdIds = new Set((sharedHousehold ?? []).map((r) => r.household_id));
  const bothPresent =
    (sharedHousehold ?? []).filter((r) => r.household_id && householdIds.has(r.household_id)).length >= 2;

  if (!bothPresent) {
    return new Response('Not in the same household', { status: 403 });
  }

  // Generate a recovery link server-side; email it to the TARGET user's own address only —
  // never return the link in the HTTP response to the caller (User B never sees User A's link).
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: (await adminClient.auth.admin.getUserById(targetUserId)).data.user!.email!,
  });
  if (linkErr) return new Response('Failed to generate link', { status: 500 });

  // Send via your own transactional email (Resend/Postmark/etc — Supabase's own SMTP for
  // generateLink() does NOT auto-send; you get the link back and must deliver it yourself
  // when calling generateLink() directly, unlike resetPasswordForEmail() which auto-sends).
  await sendRecoveryEmail(targetUserId, linkData.properties.action_link);

  // Optional: also flag an in-app banner ("Your partner requested a recovery link be sent
  // to you") for extra visibility, written to a lightweight `recovery_requests` table
  // (household_id, requested_by_user_id, target_user_id, created_at) — no audit log needed
  // for anything else per D13, but this one action is worth a minimal trace given it touches
  // account access.
  return new Response(JSON.stringify({ status: 'sent' }), { status: 200 });
});
```

### 4.3 Key implementation notes

- `admin.generateLink({ type: 'recovery', ... })` and `admin.updateUserById()` both work from Edge Functions when the client is instantiated with the **service role key** — confirmed current Supabase behavior. (Some other `auth.admin.*` methods like `signInWithUserId`/`createUser` have had inconsistent Deno-runtime behavior reported — stick to `generateLink`/`updateUserById`/`getUserById`, which are well-supported.)
- `generateLink()` returns the link but does **not** email it automatically — that's different from the client-facing `resetPasswordForEmail()`, which does send. Plan for your own email delivery (Resend, Postmark, or Supabase's SMTP via a direct API call) in this Edge Function.
- Gate the *caller* (the assisting partner) at `aal2`, not just "logged in" — otherwise this becomes a lower-security bypass path around the very MFA requirement D10 establishes for direct login.
- Keep the service-role key exclusively in Edge Function secrets (`supabase secrets set`), never in the mobile client bundle.
- This is the one place in the whole system that needs bespoke backend logic beyond configuration — flag it clearly as its own task in PHASES.md/task files, it is not a "wire up a Supabase feature" task like the rest.

---

## 5. Scheduled Sync Job Pattern (D27, D26)

### 5.1 Architecture

```
pg_cron (runs nightly, e.g. 02:00 UTC)
  -> SQL function using pg_net's net.http_post()
    -> invokes an Edge Function "nightly-sync"
       -> for each connected source (Powens, Binance, CoinGecko/gold price feed, Veracash/Placement
          Direct if/when integrated): fetch, upsert into `positions`/`accounts.last_synced_at`,
          per-item try/catch so one failing account doesn't abort the whole batch (per D29)
       -> writes one row per run into `sync_runs` (household_id, source, status, error, ran_at)
       -> at the end of the run, for any source with status='failed', insert a row into
          `notifications` (user_id, body) for each affected household member
            -> a DB Webhook on `notifications` INSERT fires a second Edge Function "push"
               that reads the member's push token from `profiles.expo_push_token` and calls
               the Expo push API (see §6.3) — this satisfies D26 (push + in-app banner on
               sync failure) and D29 (partial-failure-tolerant, other sources keep serving
               "last known good" data).
```

### 5.2 Enabling pg_cron + pg_net and scheduling the job

```sql
-- Both extensions are available by default on Supabase projects; enable explicitly if not already.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Store the Edge Function's invocation secret in Vault rather than hardcoding it in the
-- scheduled SQL body (Vault entries are encrypted at rest and not visible via \df+/pg_dump).
select vault.create_secret('<service-role-or-function-secret>', 'nightly_sync_secret');

create or replace function public.trigger_nightly_sync()
returns void
language sql
as $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/nightly-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'nightly_sync_secret'
      )
    ),
    body := jsonb_build_object('triggered_at', now())
  );
$$;

select cron.schedule(
  'nightly-wealth-sync',
  '0 2 * * *',              -- 02:00 UTC daily; adjust for desired local time given D27's "1x/jour"
  $$ select public.trigger_nightly_sync(); $$
);
```

Inspect/manage:

```sql
select * from cron.job;                          -- list all scheduled jobs
select * from cron.job_run_details
  order by start_time desc limit 20;              -- run history, including pg_cron-level success/fail
select * from net._http_response
  order by created desc limit 20;                 -- raw HTTP response/status from the last calls
select cron.unschedule('nightly-wealth-sync');    -- remove if needed
```

### 5.3 Critical pitfall: pg_net calls are fire-and-forget

`net.http_post` from `pg_cron` does **not** retry on a 5xx and does **not** alert on a non-2xx response by itself — it just leaves a row in `net._http_response`. This is not sufficient for D26 ("notification push + bannière in-app dès qu'une source ... ne se synchronise plus correctement"). Two mitigations, both worth implementing (they're complementary, not either/or):

1. **Push failure detection into the Edge Function itself**, not pg_cron: the `nightly-sync` function should be the thing that writes `sync_runs` rows and triggers the notification insert on failure, as described in §5.1 — this covers "the sync ran but a specific source failed," which is the common case (aggregator outage, expired DSP2 consent after 180 days, rate limit).
2. **A second, independent cron job as a watchdog** for the rarer case where the Edge Function invocation itself never completed (network-level failure, function crash before it could write anything): schedule a second, simpler job ~30–60 minutes after the main one that checks whether a `sync_runs` row was written for "today" at all, and if not, writes its own failure/notification row. This catches "the whole job silently didn't run," which `net._http_response` alone won't surface to the user.

```sql
select cron.schedule(
  'nightly-sync-watchdog',
  '30 2 * * *',
  $$
    insert into public.notifications (user_id, body)
    select hm.user_id, 'La synchronisation nocturne ne s''est pas exécutée correctement.'
    from public.household_members hm
    where hm.status = 'active'
      and not exists (
        select 1 from public.sync_runs sr
        where sr.household_id = hm.household_id
          and sr.ran_at::date = current_date
      );
  $$
);
```

### 5.4 Per-source partial-failure handling inside the Edge Function (D29)

```ts
// supabase/functions/nightly-sync/index.ts (sketch)
const sources = await getActiveSourcesForAllHouseholds(adminClient);

for (const source of sources) {
  try {
    const result = await syncOneSource(source);   // Powens / Binance / CoinGecko / gold-api / etc.
    await adminClient.from('accounts').update({
      last_synced_at: new Date().toISOString(),
      sync_status: 'ok',
    }).eq('id', source.accountId);
    await adminClient.from('sync_runs').insert({
      household_id: source.householdId, source: source.provider, status: 'ok', ran_at: new Date().toISOString(),
    });
  } catch (err) {
    // Log and continue — do NOT let one source's failure abort the loop (D29).
    await adminClient.from('accounts').update({ sync_status: 'failed' }).eq('id', source.accountId);
    await adminClient.from('sync_runs').insert({
      household_id: source.householdId, source: source.provider, status: 'failed',
      error: String(err), ran_at: new Date().toISOString(),
    });
    await notifyHouseholdOfSyncFailure(adminClient, source.householdId, source.provider);
  }
}
```

---

## 6. Expo Native Feature Integration

### 6.1 expo-secure-store (session tokens)

```ts
import * as SecureStore from 'expo-secure-store';

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, // iOS: don't survive to a new device via backup
    }),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // not applicable on native
  },
});
```

- SecureStore has a practical per-item size ceiling on iOS (historically ~2KB) — fine for JWTs/refresh tokens, but never store bulk cached financial data here.
- Explicitly call `SecureStoreAdapter.removeItem` for every stored key on logout (don't rely only on `supabase.auth.signOut()` clearing storage) to avoid stale-session leakage after uninstall/reinstall, since iOS Keychain items can otherwise persist across reinstall.

### 6.2 expo-local-authentication (biometric unlock layer)

```ts
import * as LocalAuthentication from 'expo-local-authentication';

async function tryBiometricUnlock(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !isEnrolled) return false; // fall back to password+MFA screen

  const level = await LocalAuthentication.getEnrolledLevelAsync();
  // Prefer requiring SECURITY_LEVEL.BIOMETRIC_STRONG where available; fall back gracefully.

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Déverrouiller MHTL Wealth',
    disableDeviceFallback: false, // allow device PIN as OS-level fallback, not an app-level bypass
  });

  return result.success;
}

// App entry / foreground handler:
// 1. Check SecureStore for a stored, non-expired Supabase session.
// 2. If present -> tryBiometricUnlock(); on success, supabase.auth.setSession(storedSession).
// 3. On failure/no biometrics/no stored session -> render full email+password (+MFA) login.
```

Because both partners may occasionally use each other's device (D11's 2-user household framing), always keep a visible password-login fallback path — never make biometric the *only* entry point on a shared device.

### 6.3 expo-notifications (push for D21 anomaly alerts + D26 sync failures)

Client-side registration:

```ts
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(userId: string) {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return; // degrade to in-app banners only (D21/D26 still require in-app)

  const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

  await supabase.from('profiles').update({ expo_push_token: expoPushToken }).eq('id', userId);
}
```

Server-side send (Edge Function `push`, triggered by a Database Webhook on `notifications` INSERT):

```ts
// supabase/functions/push/index.ts
Deno.serve(async (req) => {
  const payload = await req.json(); // { record: { user_id, body } } from the DB Webhook
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: profile } = await adminClient
    .from('profiles')
    .select('expo_push_token')
    .eq('id', payload.record.user_id)
    .single();

  if (!profile?.expo_push_token) return new Response('no token', { status: 200 });

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}`, // enable "Enhanced Security" on this token in Expo dashboard
    },
    body: JSON.stringify({
      to: profile.expo_push_token,
      sound: 'default',
      body: payload.record.body,
    }),
  });
  return new Response(await res.text(), { status: 200 });
});
```

Database Webhook config (Dashboard → Database → Webhooks): table `notifications`, event `INSERT`, target the `push` Edge Function, method `POST`, header `Authorization: Bearer <service_role key>`, `Content-Type: application/json`, timeout ~1000ms.

Wire both D21 (expense-category anomaly vs. 6-month rolling median, D20) and D26 (sync failure) alerts through the same `notifications` table/webhook/push pipeline — one mechanism, two triggers (an anomaly-detection SQL/Edge Function job and the nightly-sync failure path from §5).

---

## 7. EAS Build Notes (D24, D25)

`eas.json` — minimum viable profile set for this project's lifecycle:

```json
{
  "cli": { "version": ">= 13.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

- **`development` profile**: this is the free-tier-compatible path for D25. With `developmentClient: true` + `distribution: internal`, this build depends on `expo-dev-client` and is installed directly via cable/Xcode using a free (non-paid) Apple ID — the real constraint here isn't EAS/Expo, it's Apple's own rule that a free Apple ID's on-device provisioning profile expires and must be re-signed roughly every **7 days**, which is an Xcode/Apple-account limitation, not something EAS can bypass. On Android there is no equivalent constraint: the `apk` build type from the same profile can be sideloaded indefinitely at zero cost, no expiry.
- **`preview`/`production` profiles**: once the $99/yr Apple Developer Program is activated (deferred per D25 until it's genuinely needed for the spouse's install experience), switch to a real ad-hoc/App Store provisioning profile and use `eas build --profile production --platform ios` + `eas submit` for TestFlight (D24). Android at that point can either stay on sideloaded APKs (still free, matches D24's "pas de publication publique") or move to Google Play's internal testing track if a $25 one-time Play Console registration is ever added.
- **Local/simulator builds**: add `"ios": { "simulator": true }` to a build profile if testing on the iOS Simulator (no Apple ID/device constraints at all, useful for pure dev-loop iteration before needing on-device biometric/push testing, which do require a physical device).
- **EAS free tier** covers 15 iOS + 15 Android builds/month — comfortably enough for a 2-user app's release cadence per the earlier stack research; no paid EAS plan needed for v1.
- Push notifications (§6.3) require `projectId` from `app.json`/`eas.json`'s configured EAS project — set this up once via `eas init` before wiring `expo-notifications`, otherwise `getExpoPushTokenAsync` will fail silently on token retrieval.

---

## 8. Pitfalls (consolidated, implementation-specific)

1. **RLS-on-joins blind spot**: don't assume a visible `accounts` row guarantees visible `positions`/`transactions` rows in a join — each table's RLS is evaluated independently. Denormalizing `household_id` onto every child table (as done in §2.1) sidesteps this for this schema.
2. **`SECURITY DEFINER` without `set search_path`** in the `is_household_member()` helper (or any future one) is a privilege-escalation footgun — always pin `search_path`.
3. **pg_cron + pg_net is fire-and-forget** — a failed nightly sync HTTP call does not automatically retry or alert. D26 compliance requires the Edge Function itself to record failures and a watchdog job to catch "didn't run at all" cases (§5.3).
4. **`admin.generateLink()` does not auto-send email** (unlike the client-facing `resetPasswordForEmail()`) — the partner-recovery Edge Function must handle its own email delivery.
5. **Gate the assisting partner at aal2** in the recovery flow, not just "authenticated" — otherwise D12's assist feature becomes an MFA bypass path around D10.
6. **Biometric unlock must never be the sole gate on a shared device** — both partners may use either phone; always keep the password(+MFA) path reachable.
7. **SecureStore ≠ bulk storage** — ~2KB practical ceiling on iOS; tokens only, never cached account/transaction data.
8. **Apple free-account 7-day provisioning expiry is an Apple/Xcode constraint, not an EAS one** — don't expect `eas build --profile development` alone to solve it; it still requires periodic re-install via Xcode until a paid Apple Developer account is activated.
9. **Expo push tokens require a configured EAS `projectId`** — set up `eas init` before wiring `expo-notifications`, or `getExpoPushTokenAsync` silently fails.
10. **Restrictive RLS policies (`as restrictive`) are required for the aal2 MFA gate** — a normal permissive policy would be OR'd with other permissive policies and could be bypassed; restrictive policies AND together and can only narrow access.

---

## 9. References / Sources

- [Row Level Security | Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Authorization via Row Level Security | Supabase Features](https://supabase.com/features/row-level-security)
- [Supabase RLS Best Practices: Production Patterns for Secure Multi-Tenant Apps (MakerKit)](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [Row-Level Security in Supabase: Multi-Tenant SaaS from Day One (dev.to)](https://dev.to/issuecapture/row-level-security-in-supabase-multi-tenant-saas-from-day-one-4lon)
- [row-level security policies in Supabase for a multitenant application (GitHub Discussion)](https://github.com/orgs/community/discussions/149922)
- [Multi-Factor Authentication | Supabase Docs](https://supabase.com/docs/guides/auth/auth-mfa)
- [Multi-Factor Authentication (TOTP) | Supabase Docs](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [Multi-factor Authentication via Row Level Security Enforcement (Supabase Blog)](https://supabase.com/blog/mfa-auth-via-rls)
- [supabase/apps/docs .../auth-mfa/totp.mdx (source)](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-mfa/totp.mdx)
- [supabase/apps/docs .../auth-mfa.mdx (source)](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-mfa.mdx)
- [JavaScript: generateLink | Supabase Docs](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
- [JavaScript: updateUserById | Supabase Docs](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)
- [Password-based Auth | Supabase Docs](https://supabase.com/docs/guides/auth/passwords)
- [Supabase Custom Password Reset Flow (Code with Sachintha)](https://codewithsachintha.com/blog/supabase-password-reset-otp-flow/)
- [Cron | Supabase Docs](https://supabase.com/docs/guides/cron)
- [pg_cron: Schedule Recurring Jobs with Cron Syntax in Postgres | Supabase Docs](https://supabase.com/docs/guides/database/extensions/pg_cron)
- [Scheduling Edge Functions | Supabase Docs](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase cron jobs: pg_cron, scheduled Edge Functions, and external triggers (2026) (crontap)](https://crontap.com/guides/supabase-cron-jobs)
- [🚀 How to Set Up Cron Jobs with Supabase Edge Functions Using pg_cron (Medium)](https://medium.com/@samuelmpwanyi/how-to-set-up-cron-jobs-with-supabase-edge-functions-using-pg-cron-a0689da81362)
- [calling functions in supabase cron job (GitHub Discussion #5612)](https://github.com/orgs/supabase/discussions/5612)
- [Sending Push Notifications | Supabase Docs](https://supabase.com/docs/guides/functions/examples/push-notifications)
- [supabase/apps/docs .../push-notifications.mdx (source)](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/functions/examples/push-notifications.mdx)
- [Expo push notifications setup - Expo Documentation](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Send notifications with the Expo Push Service - Expo Documentation](https://docs.expo.dev/push-notifications/sending-notifications/)
- [SecureStore - Expo Documentation](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [LocalAuthentication - Expo Documentation](https://docs.expo.dev/versions/latest/sdk/local-authentication/)
- [Biometric Authentication in React Native Expo: A Complete Guide (Medium)](https://sasandasaumya.medium.com/biometric-authentication-in-react-native-expo-a-complete-guide-face-id-fingerprint-732d80e5e423)
- [Configure EAS Build with eas.json - Expo Documentation](https://docs.expo.dev/build/eas-json/)
- [Configuration with eas.json - Expo Documentation](https://docs.expo.dev/eas/json/)
- [Create and share internal distribution build - Expo Documentation](https://docs.expo.dev/tutorial/eas/internal-distribution-builds/)
- [EAS Build - Expo Documentation](https://docs.expo.dev/build/introduction/)
- Prior first-wave research: `.claude/orchestration-wealth-tracker/research/mobile-app-stack.md`, `.claude/orchestration-wealth-tracker/research/shared-account-auth-security.md`
