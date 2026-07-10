# Research — Testing Fixtures & Sandbox Strategy

Aspect covered: how MHTL Wealth is developed and tested end-to-end **without ever touching real bank/crypto credentials**, per D4 ("mode démo/sandbox") and D28 ("sandbox-only testing during dev, real data only on explicit user request"), and how partial-sync-failure UI (D29) gets exercised in tests. Feeds Phase 5 (build) and Phase 7 (test/QA) task files: what fixtures get created, where they live in the repo, and what tooling drives them.

---

## 1. Summary

- **Powens sandbox** ships two built-in, zero-setup ways to drive a full bank-linking webview flow with fake data: the **Demo Institution** (accepts *any* password, never errors, returns fake Bank/Wealth/Bill/Trust data including a PEA account with market orders) and a **Test Connector** (fixed UUID `338178e6-3d01-564f-9a7b-52ca442459bf`, login = any username, password = **`1234`**, and it can also deliberately simulate failure scenarios like `wrongpass`/website-unavailable — directly exercises D29's degraded-sync UI). Getting sandbox access is self-service and free: create a Powens Console account, spin up a domain (auto-suffixed `-sandbox.biapi.pro`, capped at 50 connections), create a Client (yields `client_id`/`client_secret`), done — no sales contact needed for sandbox (only production requires a signed contract).
- **CoinGecko** needs no auth at all for basic price lookups: the **keyless public API** (`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur`) works with zero signup, ~10-30 calls/min. Because this returns **real, live prices** (not fictional), it's best framed as "free live sandbox data" — safe to call in dev/test since it's read-only public market data, no credentials involved, and it costs nothing. An optional free account upgrades to the Demo API plan (10,000 calls/month, 30/min) if the keyless rate limit is hit during test runs.
- **Fixture data still needs to be hand-authored** for everything Powens/CoinGecko's own sandbox can't produce realistically: (a) a synthetic 6-12 month transaction history with genuine recurring patterns (rent, subscriptions, groceries) to validate the recurrence-detection algorithm from `recurring-expense-analytics.md`; (b) a synthetic position + daily price history to validate TWR/XIRR math; (c) a fictional multi-asset household (bank + PEA + crypto + gold) to validate net-worth aggregation. Concrete JSON shapes for all three are below (§3).
- **Storage/seeding**: plain JSON fixture files under `supabase/fixtures/`, loaded by a `supabase/seed.sql` (or a small Node/TS seed script called from it via `\i`/COPY, since JSON→relational needs light transformation) that runs automatically on `supabase start`/`supabase db reset` against the **local** Supabase instance — never against a hosted/production project. This is the standard Supabase local-dev pattern (seed files execute after migrations, on every `db reset`, giving a reproducible dataset with hardcoded UUIDs the E2E tests can assert against by ID).
- **Playwright's actual role here is narrow**: this is a React Native/Expo **mobile** app, and Playwright cannot drive an iOS Simulator/Android Emulator or simulate native gestures/permission dialogs — it has no access to that layer at all. Its legitimate uses in this project are all **browser-based, not mobile-UI**: (1) automating the Powens Console / sandbox setup and Supabase Studio dashboard for repeatable environment provisioning, (2) smoke-testing the Expo Web preview (`expo start --web`) as a cheap, fast sanity check of shared UI logic/navigation in a real browser — useful but **not equivalent to testing the actual iOS/Android app**, since native-only modules (biometrics, secure storage, push) don't run in Expo Web, and (3) later, automating App Store Connect/TestFlight-adjacent web flows if needed.
- **Mobile UI testing recommendation**: use **Maestro** (YAML-driven, no native build step required, first-class Expo/EAS support, works against Expo Go and dev builds, can run in EAS Workflows CI) as the actual mobile E2E driver for iOS/Android — it is purpose-built for exactly what Playwright cannot do. Playwright is a complementary, secondary tool for the web-only surfaces (Expo Web smoke tests, dashboard automation), not a substitute for Maestro.

---

## 2. Sandbox Assets Per Service

### 2.1 Powens sandbox — bank-linking flow

| Element | Detail |
|---|---|
| **Getting access** | Self-service, free. Create a Powens Console account → create a **Sandbox domain** (auto-suffixed `-sandbox.biapi.pro`, capped at **50 connections** — plenty for household-of-2 dev/test) → create a **Client** (application), which yields the `client_id`/`client_secret` used for all API calls and the webview. No sales/KYB step required at this stage — that's only needed to graduate to production. |
| **Demo Institution** | Purpose-built for demos: returns fake data across Bank, Wealth, Bill and Trust products, and **never triggers errors** (no wrongpass, no "website unavailable"). The password field exists cosmetically only — enter anything, it is never validated. Good for a "happy path" full walkthrough but not for testing error/degraded-sync handling (D29) since it can't fail. |
| **Test Connector** | Fixed UUID **`338178e6-3d01-564f-9a7b-52ca442459bf`**, enabled on every sandbox domain. Login = any username; password = **`1234`**. Unlike the Demo Institution, the Test Connector **can simulate real-world failure scenarios** (wrongpass, site-unavailable, etc.) that occur against real banks — this is the one to use for testing D29's graceful-degradation UI (badge/warning on a failed source while other data still renders) and D26's sync-failure alerts. In some flows the webview skips login entirely and redirects straight to a fake bank interface — just continue the flow. |
| **Wealth/PEA test data** | The demo data explicitly includes **1 PEA account plus market orders** on both the market account and the PEA, alongside other account types — sufficient to validate PEA-specific investment aggregation without needing a real Boursorama/Trade Republic/DEGIRO sandbox account. |
| **Production graduation** | By default you cannot create a production environment from Console self-service — it requires a signed contract and a customer success manager conversation. Confirms D28's framing: sandbox-only is not just a policy choice but the only thing available without a commercial step anyway, so there's no accidental "slip into prod" risk during dev. |
| **Mobile integration shape** | No React Native SDK; integration is REST + a hosted webview/redirect (OAuth2/PSD2 SCA flow) — meaning in Expo this is a `WebView` component or in-app browser session pointed at the Powens-hosted connect URL, not native form fields. Relevant for how the E2E test (Maestro) needs to drive it: it must handle a WebView screen, not native inputs. |

Sources:
- Powens — Demo institution and test connectors: https://docs.powens.com/console-webview/webview/demo-institution-and-test-connectors
- Powens — Quick Start: https://docs.powens.com/documentation/integration-guides/quick-start
- Powens — Set up your Console account: https://docs.powens.com/console-webview/console/introduction/set-up-your-powens-console-account
- Powens — Add a first user and connection: https://docs.powens.com/documentation/integration-guides/quick-start/add-a-first-user-and-connection
- Powens — Introduction to Bank: https://docs.powens.com/documentation/integration-guides/bank/introduction-to-bank
- Powens — Wealth integration guide: https://docs.powens.com/documentation/integration-guides/wealth
- Powens — Investments API reference: https://docs.powens.com/api-reference/products/wealth-aggregation/investments
- (Note: direct WebFetch of docs.powens.com returned HTTP 403 — the WAF blocks automated fetchers, consistent with what `open-banking-aggregation.md` already flagged for `bridgeapi.io`. The details above come from search-result snippets/summaries of the same pages, not a raw fetch. **Re-verify exact UUID/password verbatim against the live docs page in a browser during Phase 5 setup**, in case of drift since this research pass.)

### 2.2 CoinGecko — crypto price data ("live sandbox")

| Element | Detail |
|---|---|
| **Keyless public API** | No signup, no key, no header needed at all. Direct call: `GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=eur`. Explicitly documented as the "Keyless Public API" — sending an API key header is unnecessary and ignored. |
| **Rate limit (keyless)** | ~10 calls/min. Fine for local dev/test runs (a handful of coins, refreshed occasionally by an automated test), not for production polling. |
| **Demo API plan (optional, still free)** | Create a free CoinGecko account → generate a Demo API key → 30 calls/min, 10,000 calls/month cap. This matches what `asset-price-apis.md` already recommended as the production-lean choice; for testing purposes the **keyless tier is sufficient and simpler** (zero credentials to manage/rotate, nothing to put in `.env` or CI secrets). |
| **Is this "sandbox" or "real" data?** | It's real, live market data — not fictional. That's fine and actually preferable here: it's public, free, read-only, and involves no user credentials whatsoever, so it doesn't violate D28's "no real bank/crypto credentials" mandate (the mandate is about *credentials*, not about market-data realism). Recommendation: use CoinGecko live prices directly against **fictional/test crypto holdings** (fixture positions, e.g. "0.5 BTC, 3 ETH" as fake balances) rather than trying to fabricate fictional price data — this gives realistic TWR/XIRR test numbers for free. |

Sources:
- CoinGecko — Keyless Public API: https://docs.coingecko.com/docs/keyless-public-api
- CoinGecko — Demo API signup guide: https://support.coingecko.com/hc/en-us/articles/21880397454233-User-Guide-How-to-sign-up-for-CoinGecko-Demo-API-and-generate-an-API-key
- CoinGecko — Best Free Crypto APIs 2026: https://www.coingecko.com/learn/best-free-crypto-api
- CoinGecko — Pricing: https://www.coingecko.com/en/api/pricing

### 2.3 Other price APIs (Twelve Data, Frankfurter, gold-api.com)

Not re-researched in depth here (already covered by `asset-price-apis.md`), but for fixture/testing purposes the same principle as CoinGecko applies: **Frankfurter (FX) and gold-api.com (XAU/XAG spot) are both keyless/no-signup and safe to call live in tests** since they're public market data with no account credentials. **Twelve Data's free tier requires an API key** (800 calls/day) — for automated test runs, either register one free dev-only key stored as a CI secret (never a personal/paid key), or stub/mock the Twelve Data response in unit tests and reserve the live free key for occasional manual/integration verification to avoid burning the daily quota via CI runs.

---

## 3. Fixture Data Design

All fixtures are **fictional but structurally realistic** — French household, EUR-denominated, matching the categories/account types already decided in DISCOVERY (D2, D19). Store as JSON under `supabase/fixtures/`, one file per concern, loaded by the seed script (§4).

### 3.1 Recurring-expense detection fixture

Needs 6-12 months of transactions per `recurring-expense-analytics.md`'s recommendation (Plaid: 180 days minimum; the app's own D20 uses a 6-month rolling window). Must include: monthly rent (fixed amount, same day-of-month), a couple of subscriptions (fixed amount, monthly), groceries (variable amount, weekly-ish, same-ish merchant), one annual/quarterly outlier (insurance) to test amortization, and one genuinely one-off large purchase (to test that medians aren't blown out by it — this is exactly the median-vs-mean case flagged in the research).

`supabase/fixtures/transactions.json` (excerpt — full file spans Jan–Jun 2026, ~150-200 rows):

```json
{
  "household_id": "00000000-0000-0000-0000-000000000001",
  "account_id": "00000000-0000-0000-0000-0000000000a1",
  "transactions": [
    { "id": "tx-2026-01-01-rent", "date": "2026-01-01", "label": "VIR SCI DUPONT IMMOBILIER", "amount": -1200.00, "category": "Logement", "merchant_key": "sci-dupont-immobilier" },
    { "id": "tx-2026-02-01-rent", "date": "2026-02-01", "label": "VIR SCI DUPONT IMMOBILIER", "amount": -1200.00, "category": "Logement", "merchant_key": "sci-dupont-immobilier" },
    { "id": "tx-2026-01-05-netflix", "date": "2026-01-05", "label": "NETFLIX.COM", "amount": -15.99, "category": "Charges & Abonnements", "merchant_key": "netflix" },
    { "id": "tx-2026-02-06-netflix", "date": "2026-02-06", "label": "NETFLIX.COM", "amount": -17.99, "category": "Charges & Abonnements", "merchant_key": "netflix" },
    { "id": "tx-2026-01-03-carrefour", "date": "2026-01-03", "label": "CARREFOUR MARKET 7512", "amount": -84.32, "category": "Alimentation", "merchant_key": "carrefour" },
    { "id": "tx-2026-01-10-carrefour", "date": "2026-01-10", "label": "CARREFOUR CITY 7512", "amount": -41.10, "category": "Alimentation", "merchant_key": "carrefour" },
    { "id": "tx-2026-03-15-assurance-auto", "date": "2026-03-15", "label": "PRLV AXA ASSURANCE AUTO", "amount": -480.00, "category": "Transport", "merchant_key": "axa-auto", "expected_frequency": "annual" },
    { "id": "tx-2026-04-22-canape", "date": "2026-04-22", "label": "CB IKEA FRANCE", "amount": -1899.00, "category": "Shopping", "merchant_key": "ikea-one-off" }
  ]
}
```

Design notes baked in: `netflix` amount drifts €15.99→€17.99 (price-increase realism, within/at the ~5% fuzzy-match tolerance the research describes), `carrefour` label varies slightly between transactions (fuzzy merchant match, not exact string), rent lands on the 1st every month (stable interval, low tolerance needed), `axa-auto` is a single annual charge that a correct detector should tag `frequency: annual` and amortize to ~€40/month rather than spiking "Transport" once, and `ikea-one-off` exists specifically so a test can assert it does **not** get classified as recurring and does **not** distort the category median (mean-vs-median regression test).

### 3.2 Portfolio performance (TWR/XIRR) fixture

Needs a position with cash flows (buys, maybe a partial sell) plus a matching daily price series, so TWR (time-weighted, cash-flow-neutral) and XIRR (money-weighted, cash-flow-sensitive) can be computed against known expected results and compared.

`supabase/fixtures/pea_position.json`:

```json
{
  "position_id": "00000000-0000-0000-0000-0000000000b1",
  "account_type": "PEA",
  "instrument": { "isin": "FR0000120271", "name": "TotalEnergies SE (fixture)", "currency": "EUR" },
  "cash_flows": [
    { "date": "2026-01-15", "type": "buy",  "quantity": 10, "unit_price": 55.00 },
    { "date": "2026-03-01", "type": "buy",  "quantity": 5,  "unit_price": 58.00 },
    { "date": "2026-05-10", "type": "sell", "quantity": 4,  "unit_price": 62.00 }
  ],
  "price_history": [
    { "date": "2026-01-15", "close": 55.00 },
    { "date": "2026-02-01", "close": 56.20 },
    { "date": "2026-03-01", "close": 58.00 },
    { "date": "2026-04-01", "close": 60.10 },
    { "date": "2026-05-10", "close": 62.00 },
    { "date": "2026-06-30", "close": 61.50 }
  ]
}
```

Expected values (TWR across the sub-periods between cash flows, and XIRR across the full dated cash-flow series including the final mark-to-market as a synthetic terminal "sell") should be pre-computed once by hand/spreadsheet and stored alongside as `expected_twr` / `expected_xirr` constants in the test file itself (not in the fixture JSON) — that's what the assertion compares against, keeping the fixture purely descriptive of the scenario.

### 3.3 Multi-asset net worth aggregation fixture

One fictional household spanning every asset class from D2, including a source deliberately marked stale/failed to exercise D29's degraded-view badge.

`supabase/fixtures/household_net_worth.json`:

```json
{
  "household_id": "00000000-0000-0000-0000-000000000001",
  "accounts": [
    { "id": "acc-bank-sg",   "type": "bank",   "provider": "powens", "institution": "Société Générale (sandbox)", "balance": 4230.55, "currency": "EUR", "sync_status": "ok",     "last_synced_at": "2026-07-10T02:00:00Z" },
    { "id": "acc-pea",       "type": "PEA",     "provider": "powens", "institution": "Boursobank (sandbox)",       "balance": 18420.10, "currency": "EUR", "sync_status": "ok",    "last_synced_at": "2026-07-10T02:00:00Z" },
    { "id": "acc-crypto",    "type": "crypto",  "provider": "binance_readonly", "balances": [ { "asset": "BTC", "quantity": 0.5 }, { "asset": "ETH", "quantity": 3.2 } ], "sync_status": "ok", "last_synced_at": "2026-07-10T02:00:00Z" },
    { "id": "acc-gold",      "type": "gold",    "provider": "manual", "grams": 250, "purity_karat": 24, "sync_status": "ok", "last_synced_at": "2026-07-09T09:00:00Z" },
    { "id": "acc-ledger",    "type": "crypto_self_custody", "provider": "covalent", "chain": "ethereum", "address": "0xFICTIONAL000000000000000000000000000001", "sync_status": "failed", "last_synced_at": "2026-07-05T02:00:00Z", "error": "provider_timeout" }
  ]
}
```

`acc-ledger`'s `sync_status: "failed"` with a `last_synced_at` five days stale is the specific fixture case for D29: the aggregation test asserts total net worth still renders (using the last known balance) **and** the UI shows a warning badge on that one source, rather than the whole screen failing.

---

## 4. Seeding Strategy

1. **Location**: `supabase/fixtures/*.json` (raw fixture data, human-editable, diffable in PRs) + `supabase/seed.sql` (the file Supabase's CLI auto-runs). Since seed.sql is plain SQL and the fixtures are JSON, the cleanest path is a small seed script (`supabase/seed.ts` or `.js`, run with `ts-node`/`bun` via a `\!` shell hook or as a pre-step in a `package.json` script like `"db:seed": "supabase db reset && node supabase/seed-runner.js"`) that reads the JSON files and performs `INSERT ... ON CONFLICT (id) DO NOTHING` upserts using the Supabase JS client against `http://localhost:54321` (the local CLI's default). This keeps fixtures as reviewable JSON while still getting idempotent, migration-ordered execution.
2. **Determinism**: every fixture row uses a **hardcoded UUID** (as shown above) rather than a generated one — this is the Supabase-documented best practice specifically so Playwright/Maestro E2E tests can assert against a known ID (`acc-ledger` will always be that UUID, so a test can navigate straight to it) instead of querying-then-asserting.
3. **Reset flow**: `supabase db reset` — drops the local DB, replays all migrations, then runs seed — gives every test run a clean, identical starting state. This should be the standard "before an E2E suite runs" step in CI and local dev alike (e.g. a `pretest` npm script), matching D28's mandate that dev/test never touches anything but sandbox/fictional state: local Supabase, not the hosted project, is the only thing that ever receives this data.
4. **Never point fixtures at production**: the local Supabase instance (`supabase start`) and any hosted **staging** Supabase project used for TestFlight/APK builds (D24) must be kept credential-isolated — different `.env` files (`.env.local` vs `.env.staging`), and the fixture seed script should refuse to run (guard clause on `SUPABASE_URL` containing `localhost`/a designated staging project ref) if pointed at anything that looks like the eventual production project once one exists.
5. **Live sandbox calls during seeding**: for the crypto/gold/FX fixtures, the seed script can optionally do one real (free, keyless) CoinGecko/Frankfurter/gold-api.com call at seed time to snapshot a real current price against the fixture's fictional quantities, so net-worth totals in tests reflect realistic current EUR values rather than a hardcoded stale number — this keeps the "live sandbox" idea (§2.2) integrated into the fixture pipeline instead of being a separate concern.
6. **Powens sandbox is not seeded via SQL** — it's a live external service. The seed script instead needs to store the Test Connector's fixed identifiers (UUID `338178e6-3d01-564f-9a7b-52ca442459bf`, username, password `1234`) as **test-only config** (e.g. `supabase/fixtures/powens-test-connector.json` or an `.env.test` entry), which a Maestro/Playwright flow drives through the actual Powens-hosted webview during E2E — this is the one fixture "asset" that lives outside the database because it's exercising a real third-party flow, not seeded local state.

Sources:
- Supabase — Seeding your database: https://supabase.com/docs/guides/local-development/seeding-your-database
- Supabase — Local development with migrations: https://supabase.com/docs/guides/local-development/overview
- Supabase — CLI reference: https://supabase.com/docs/reference/cli/introduction
- Supabase community — pushing local seed data to production (why not to): https://github.com/orgs/supabase/discussions/26393

---

## 5. Playwright's Actual Role in This Project

Playwright is already available as an MCP tool in this session, which is why it's tempting to reach for it as "the" test-automation answer — but it is a **browser automation tool**, and MHTL Wealth is a **native mobile app** (React Native/Expo, D1/D5). Confirmed from research: Playwright cannot drive an iOS Simulator or Android Emulator, has no model of mobile gestures (swipe, pinch), and cannot interact with native OS-level dialogs (biometric prompt, push-notification permission, camera permission) — all of which matter directly for this app given D11 (biometric unlock) and D26 (push alerts).

Where Playwright **is** legitimately useful for this project, all of them browser-based:

1. **Expo Web preview smoke tests** (`expo start --web`): Expo can render the same React Native codebase in a browser via `react-native-web`. Playwright can drive that browser instance to smoke-test shared UI logic and navigation flow (e.g. "does the net-worth screen render the right total given seeded fixture data") fast, in CI, without an emulator. **Caveat, important not to oversell this**: native-only modules — Expo LocalAuthentication (biometrics, D11), SecureStore, push notifications (D26) — either don't run in Expo Web or are stubbed/no-op there, so a Playwright-on-Expo-Web pass is a **UI-logic/rendering smoke test**, not a substitute for testing the actual mobile app behavior. Treat it as a fast first-pass check (cheap, runs on every PR) that catches gross breakage before the slower Maestro suite runs on real emulators.
2. **Powens Console / sandbox environment setup automation**: creating/configuring the sandbox domain, client credentials, and verifying the Test Connector via the Powens web console is itself a browser flow — Playwright can script and re-verify this setup as part of environment provisioning or a "is our sandbox still configured correctly" check.
3. **Supabase Studio dashboard automation**: similarly, verifying migrations applied correctly or inspecting seeded data visually through the local Supabase Studio web UI is a legitimate Playwright use case for environment-health checks.
4. **Future**: App Store Connect/TestFlight-adjacent web flows (D24/D25) if any part of the release process needs browser automation later — not a near-term need.

**Bottom line**: Playwright is a supporting tool for this project's *web-adjacent* surfaces (dev-portal setup, dashboard checks, and a cheap Expo-Web smoke layer), not the primary mobile E2E driver. Don't build the Phase 7 test plan around it as if it can validate the real iOS/Android app — it cannot.

---

## 6. Mobile UI Testing Tool Recommendation

**Maestro** is the right tool for actually driving the mobile app end-to-end (iOS + Android, per D1):

- Tests are written in plain YAML (not a programming language), which keeps the barrier low for a solo-developer project (D9: "privilégier simplicité opérationnelle").
- Sits entirely outside the app codebase — no native module/package to add, no build-time instrumentation — and drives the app the way a real user would (taps, swipes, text input) against Expo Go or a dev/production build.
- First-class Expo/EAS support: Expo's own docs describe running Maestro E2E tests as part of **EAS Workflows** CI, and community guides confirm it works against Expo Go, dev builds, and EAS builds without requiring a bare/ejected workflow.
- Can drive the Powens webview screen as a black box (tap through the WebView the same as a user would — enter the Test Connector's username + `1234`), which is exactly the full bank-linking flow this task needs validated end-to-end.
- 2026 community consensus (multiple independent sources) converges on "Jest/RNTL for unit+component tests, Maestro for E2E" as the standard React Native/Expo testing stack, with Playwright/Detox/Appium positioned as either web-only or heavier-weight alternatives not needed here.

Recommended split for Phase 5/7 task files:
- **Unit tests** (recurrence detection algorithm, TWR/XIRR math): plain Jest against the fixtures in §3, no UI/emulator needed — fastest feedback loop, run on every commit.
- **Expo Web + Playwright smoke pass**: quick sanity check of screen rendering/navigation against seeded fixtures, catches gross breakage cheaply.
- **Maestro E2E** (real emulator/simulator or EAS-hosted device): the actual mobile flows — bank-linking through the Powens Test Connector webview, biometric unlock, degraded-sync badge display (D29), push-alert triggering (D26) — the tests that matter most for confidence before ever switching to real credentials per D28.

Sources:
- Maestro — React Native support: https://docs.maestro.dev/get-started/supported-platform/react-native
- Expo — Run E2E tests on EAS Workflows with Maestro: https://docs.expo.dev/eas/workflows/examples/e2e-tests/
- Lingvano — Native E2E testing with Expo, React-Native and Maestro: https://medium.com/lingvano/in-5-steps-to-native-e2e-testing-with-maestro-and-expo-14e9e9b0f0fe
- React Native Relay — Testing Guide 2026: https://reactnativerelay.com/article/complete-guide-testing-react-native-apps-2026-unit-tests-e2e-maestro
- QA Wolf — Best Mobile E2E Testing Frameworks 2026: https://www.qawolf.com/blog/best-mobile-app-testing-frameworks-2026
- Panto — How To Test Hybrid React Native Apps With Playwright: https://www.getpanto.ai/blog/playwright-react-native-hybrid-testing
- Maestro — Best React Native testing frameworks / Detox alternatives: https://maestro.dev/insights/best-react-native-testing-frameworks, https://maestro.dev/insights/detox-alternatives

---

## 7. Open Items / Caveats for Phase 5-7

- **Verify Powens Test Connector UUID/password verbatim in-browser before relying on it in a Maestro script** — `docs.powens.com` blocked this research pass's automated WebFetch (403, WAF), so the exact values above come from search-engine result summaries, not a direct page read. High confidence (consistent across two independent search queries) but a 2-minute manual check during Phase 5 setup is cheap insurance.
- **Twelve Data free-tier key is the one "sandbox" credential that isn't fully keyless** — needs a dev-only free API key generated and stored as a CI secret (or mocked in unit tests) rather than assumed keyless like CoinGecko/Frankfurter/gold-api.com.
- **No sandbox exists for Veracash, Placement Direct, or Ledger on-chain addresses** (per DISCOVERY's own Batch 4 open items D16/D17/D15) — those integrations remain manual-entry or need their own research pass before fixtures can be designed for them; the crypto/gold fixtures in §3.3 above use Covalent/manual-entry patterns as placeholders consistent with `asset-price-apis.md`'s recommendation, not confirmed sandbox behavior for those two specific French providers.
- **TWR/XIRR expected values in §3.2 are illustrative, not pre-computed** — before use in an actual test, run the fixture's cash flows through a reference calculator (e.g. a spreadsheet XIRR formula) once and hardcode the resulting expected numbers into the Jest test, not into the fixture JSON itself, so the fixture stays a pure scenario description.
