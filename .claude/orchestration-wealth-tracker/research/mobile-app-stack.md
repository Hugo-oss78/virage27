# Research: Mobile App Stack — MHTL Wealth

Scope: cross-platform mobile framework, backend architecture, charting, secure local storage, biometric auth, app store deployment, and fintech-mobile pitfalls for a 2-user (couple) net-worth tracking app handling sensitive financial data. Researched July 2026.

---

## 1. Summary

For a **solo/small-team build of a 2-user fintech app**, the recommended stack is:

- **Mobile framework:** **React Native + Expo** (New Architecture / Fabric, EAS Build). Best developer velocity for a solo builder, most mature ecosystem for the exact integrations this app needs (secure storage, biometrics, charts, push, deep links), and AI-assisted coding tools (Claude, Copilot) are strongest in TypeScript. Flutter is a legitimate runner-up (better out-of-the-box pixel-perfect UI and animation performance) but has a smaller npm-equivalent package ecosystem and a second language (Dart) to maintain. Kotlin Multiplatform is powerful but immature for full-UI-sharing solo development — it shines when you already have separate native iOS/Android teams, which does not apply here.
- **Backend:** **Supabase** (managed Postgres + Auth + Row Level Security + Edge Functions + pg_cron/Supabase Cron + Vault for secrets). It directly satisfies the "2 users sharing one household of data" model via Postgres RLS, has built-in scheduling for nightly price refresh jobs, supports webhooks from aggregators via Edge Functions, and keeps everything in one SQL database — easiest to reason about for a solo builder needing auditability of financial data. Firebase is a fallback if deeper Google ecosystem integration is wanted, but its NoSQL model and weaker native cron story make it a worse fit for recurring financial calculations. Convex is compelling for real-time reactivity but is a smaller ecosystem, not Postgres, and (as of 2026) US-only managed cloud — a real concern given the French/EU context of this app (GDPR, data residency expectations for financial data).
- **Charting:** **Victory Native (XL, Skia-based)** or **react-native-gifted-charts** for line/sparkline/donut charts; escalate to **React Native Skia** directly if custom candlestick/high-frequency rendering is needed later. On Flutter, **fl_chart** (free, highly customizable) or **Syncfusion Flutter Charts** (commercial, free community license for small teams/low revenue — MHTL would qualify) are the top picks.
- **Secure storage:** **expo-secure-store** (iOS Keychain / Android Keystore-backed encrypted storage) for tokens; never AsyncStorage for secrets.
- **Biometrics:** **expo-local-authentication** as a *convenience unlock layer* on top of password auth (retrieves a securely-stored credential/session token after a Face ID/fingerprint/BiometricPrompt check) — not a replacement for the password.
- **Screenshot/recording protection:** FLAG_SECURE on Android (built-in), and an iOS screen-recording detection + blur overlay pattern (no true "block" API exists on iOS) — via a library like `react-native-screenguard` or a small custom native module, applied specifically to balance/portfolio screens.

Given the PRD explicitly frames the stack decision as "à trancher en Discovery" (to be decided during Discovery), this research treats React Native/Expo + Supabase as the **default recommendation to bring to Discovery**, with Flutter + Supabase as the primary alternative if UI/animation polish becomes a priority, and native Swift/Kotlin as the fallback only if deep hardware-level biometric/secure-enclave control becomes a hard requirement (unlikely for this use case).

---

## 2. Key Findings

### 2.1 Cross-platform framework landscape (2026)

**React Native (+ Expo)**
- With the New Architecture (Fabric + Hermes) fully supported through EAS Build, RN has closed most of the historical performance gap with Flutter (cold start benchmarks converge to within tens of ms on comparable hardware).
- Fastest path from zero to a working prototype for a solo/small team, especially one already comfortable with TypeScript/React (web-style).
- Largest ecosystem of integrations relevant to this app: secure storage, biometrics, charts, push notifications, deep links, in-app purchase/subscription handling, and crash/analytics tooling all have first-class, well-maintained Expo/RN packages.
- AI pair-programming tools (Claude Code, Copilot) are strongest in TS/JS, which materially speeds up solo development — directly relevant since this project is being built with an AI coding agent.
- Fintech precedent: numerous consumer fintech apps (including large ones) ship on RN; it is a proven category fit, not just a "nice to have."
- Expo specifically removes the need to touch native Xcode/Android Studio projects for most features (EAS Build handles native compilation in the cloud), which matters a lot for a solo/non-mobile-native developer.

**Flutter**
- Impeller rendering engine gives smoother, more deterministic animations (60–120fps) and pixel-identical UI across iOS/Android — attractive for a "designed" fintech brand experience (relevant here given the MHTL crest/branding requirement).
- Preferred by some banks specifically for stock-chart rendering and transaction animations due to canvas-based rendering control.
- Downsides for this project: second language (Dart) with a smaller talent/AI-assistance surface than TS, and a comparatively smaller plugin ecosystem for niche financial-API integrations (aggregators, gold/crypto price feeds) — more custom glue code likely needed.
- Slightly higher upfront cost in some estimates but potentially lower long-term QA/maintenance cost due to more predictable rendering.

**Kotlin Multiplatform (KMP)**
- Growing fast (cited as jumping from ~7% to ~23% adoption in ~18 months) and used in production by fintech-adjacent companies (e.g., Cash App) for shared business logic (networking, models, validation, state machines) while keeping fully native UI per platform.
- Best fit when you already have (or plan) separate native iOS and Android UI codebases and want to share only the logic layer — this implies **two UI codebases**, which is a poor fit for a solo builder targeting both platforms quickly.
- Not recommended as the primary approach for this project; worth reconsidering only if the team later grows and wants platform-native UI polish with shared core logic.

**Fully native (Swift/SwiftUI + Kotlin/Jetpack Compose)**
- Maximum control over secure enclave, hardware biometrics, and platform-specific security APIs.
- Effectively doubles build/maintenance effort for a 2-person-consumer, non-funded project — not justified here. Reserve as a fallback only if a specific hard requirement (e.g., deep secure-enclave attestation) cannot be met cross-platform.

**Recommendation:** React Native + Expo, with Flutter flagged as the runner-up to present at Discovery if visual/branding fidelity (the MHTL crest, serif wordmark, navy/gold "blason" identity) turns out to need more custom rendering control than RN comfortably provides. Both are viable; RN wins primarily on solo-developer velocity and ecosystem breadth for this feature set.

### 2.2 Backend architecture

**Requirements driving the choice:** shared household data model (2 users, 1 shared "patrimoine"), nightly scheduled jobs (price refresh for gold/crypto/stocks, recurring-expense average recalculation), webhook ingestion from banking aggregators, and secure server-side storage of third-party API secrets (aggregator tokens, price-API keys) that must never live client-side.

**Supabase (recommended)**
- Managed Postgres — a natural fit for a relational "household → users → accounts → positions → transactions → categories" data model, and enables strict Row Level Security policies so both spouses see exactly the same household-scoped data.
- **Supabase Cron** (built on `pg_cron`, enabled by default on every project as of 2026) supports both pure-SQL scheduled maintenance (e.g., recompute recurring-expense averages via SQL/materialized views) and scheduled invocation of **Edge Functions** (e.g., nightly gold/crypto/stock price refresh, calling third-party price APIs). `SELECT cron.schedule('nightly-price-refresh', '0 2 * * *', $$ ... $$)` is the standard pattern; job history is inspectable via `cron.job_run_details`.
- **Supabase Vault** stores third-party API secrets (aggregator client secrets, price-API keys) encrypted, retrievable only from trusted server-side contexts (SQL functions / Edge Functions), not exposed to the mobile client.
- **Edge Functions** double as webhook receivers for aggregator callbacks (e.g., Powens/Bridge webhook notifying of new transactions or refreshed balances).
- Built-in Auth (email+password, with room to add 2FA/TOTP later) maps cleanly onto the "2 linked logins, 1 shared wealth space" requirement via a join table between `auth.users` and a `households` table.
- Pricing: Free tier (500MB DB, 50k MAU, 2 projects) is enough for development; Pro tier is $25/month base — trivially affordable for a 2-user app. EU-region project hosting is available, which matters for GDPR/data-residency expectations given the French context of this PRD.

**Firebase (fallback)**
- Best mobile SDK polish, particularly if going deep into the Google ecosystem, but its Firestore/NoSQL data model is a worse fit for relational financial data (positions, historical valuations, category rollups) and its native scheduled-job story (Cloud Functions + Cloud Scheduler) is a separate paid product to wire up, versus Supabase's cron being native to the same Postgres instance.

**Convex (not recommended for this project)**
- Excellent real-time reactivity and end-to-end TypeScript type safety, but non-Postgres custom data model, smaller ecosystem, and a US-only managed cloud as of 2026 (self-hosting needed for EU data residency) — a real friction point for a French financial household's data.

**Custom backend (Node/Express or Python/FastAPI + Postgres) — not recommended for v1**
- Full control, but for a 2-user app this means self-managing auth, RLS-equivalent authorization logic, cron infrastructure, secret storage, and hosting — pure overhead for a solo builder with no corresponding benefit over Supabase's managed equivalents. Worth revisiting only if the product scales to many households or needs bespoke compliance infrastructure.

**Recommendation:** Supabase (EU region), using Postgres RLS for household-scoped data sharing, Supabase Cron + Edge Functions for nightly price refresh and recurring-expense recalculation, Edge Functions as aggregator webhook receivers, and Vault for third-party API secrets.

### 2.3 Charting libraries

**React Native**
- **Victory Native (XL)** — Skia-based rewrite, consistent API shared conceptually with web Victory; solid for line charts (net worth over time), bar charts (category spend), and reasonably capable donut/pie for asset-allocation breakdowns.
- **react-native-gifted-charts** — popular, easy-to-style line/bar/pie/donut components with good built-in support for interactive tooltips and live-data updates; a strong pragmatic default for this app's charts (performance line, allocation donut, spend-by-category bars, sparklines on account cards).
- **React Native Skia** (`@shopify/react-native-skia`) — the underlying GPU-accelerated rendering engine; use directly (or via Victory Native XL, which is built on it) if/when custom candlestick charts or very smooth high-frequency chart interactions are needed (e.g., a future "trading positions" detail view).
- **react-native-echarts** — wraps Apache ECharts; useful if a wide variety of out-of-the-box chart types is wanted without hand-building each one.

**Flutter**
- **fl_chart** — free, MIT-licensed, highly customizable; the default choice for line/pie/bar; candlestick charts require custom composition on top of its bar-chart primitives.
- **Syncfusion Flutter Charts** — commercial but offers a **free Community License** for organizations under $1M revenue, ≤5 developers, ≤10 employees (MHTL/solo builder qualifies); 30+ chart types including dedicated financial/candlestick charts and is built for large-dataset performance — worth using if Flutter is chosen and native candlestick/financial chart types are wanted without custom work.

**Recommendation:** react-native-gifted-charts (or Victory Native XL) for line (net worth history), donut (asset allocation), bar (spend by category), and sparkline (account-card mini trends) needs — sufficient for all v1 chart requirements in the PRD (§7.2, §7.3) without needing Skia-level custom rendering.

### 2.4 Secure local storage (tokens/session)

- **expo-secure-store**: iOS values stored via Keychain Services (`kSecClassGenericPassword`); Android values stored in SharedPreferences encrypted via the Android Keystore system (hardware-backed TEE/StrongBox when available). Correct choice for auth tokens, refresh tokens, and any third-party API tokens cached client-side.
- **Never use AsyncStorage for secrets** — it is unencrypted plaintext (SQLite on Android, plist on iOS), readable on a rooted/jailbroken device.
- Recommended token strategy: short-lived access token (~15 min) + longer-lived refresh token, both in SecureStore; check JWT `exp` before each request and silently refresh when close to expiry.
- iOS Keychain items persist across app uninstall/reinstall by default — use `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (or equivalent "this device only" accessibility option) and explicitly clear on logout to avoid stale-session leakage after reinstall.
- Flutter equivalent: **flutter_secure_storage** (Keychain on iOS/macOS, encrypted Keystore-backed storage on Android, plus optional biometric-gated encryption) — functionally comparable, and additionally supports desktop/web if that's ever needed (not required for this PRD's mobile-only v1 scope).
- Payload-size caveat: SecureStore historically rejects large values on some iOS versions (~2KB ceiling) — keep only tokens/small session data in secure storage, not bulk cached financial data (that belongs in an app-level encrypted or ordinary local DB, scoped and cleared appropriately).

### 2.5 Biometric authentication (layer on top of password)

- **expo-local-authentication**: unified API for Face ID / Touch ID (iOS) and BiometricPrompt (Android fingerprint/face).
- Correct architecture for this app: password remains the actual authentication credential (server-side); biometrics act as a **local unlock convenience** that retrieves a securely-stored session/refresh token from SecureStore after a successful biometric check — the phone's Face ID/fingerprint never becomes the server-side credential itself.
- Check `getEnrolledLevelAsync()` and prefer "Strong" (Class 3) biometric security; always provide a password fallback (broken sensor, non-enrolled biometrics, or a spouse's face/finger not enrolled on the shared device — relevant given the 2-user/couple design where both people need their *own* login even if they might occasionally use each other's device).
- This directly answers PRD §7.4's open Discovery question ("biométrie en plus du mdp ?") — yes, as an additive convenience layer, not a replacement, and it should be presented as a resolved recommendation rather than an open question in Discovery.
- Flutter equivalent: `local_auth` package, same conceptual pattern.

### 2.6 App Store / Play Store considerations for a fintech-adjacent app

**Apple App Store**
- Must fill out **App Privacy ("nutrition label") details**, declaring collection of **Financial Info** as a data category, plus any Contact Info collected (e.g., email for the 2 accounts).
- **Privacy manifests** (mandatory since 2024, strictly enforced in 2026) must declare "required reason" API usage (e.g., UserDefaults, disk space APIs) and third-party SDK data practices — relevant for any aggregator SDK or analytics SDK bundled.
- There is a specific allowance: data collected in the course of **regulated financial services** can be marked "optional to disclose" if collection is already governed by a legally required privacy notice (GDPR applies here as the app touches EU bank data) — worth confirming with a privacy-notice draft in Discovery, but don't rely on this exemption without legal review since MHTL is a personal wealth tracker, not itself a licensed financial institution.
- Because the app is read-only against bank data (no payment initiation per PRD §6), it likely avoids the heaviest App Store financial-services review scrutiny (e.g., lending, card issuing), but should still expect App Review to ask about the Open Banking aggregator relationship and data handling.

**Google Play**
- Any app with financial features must complete the **Financial features declaration form** in Play Console (App Content section). "Financial products and services" is defined broadly as anything related to management or investment of money/cryptocurrencies.
- As of 2026, developers providing financial products/services are increasingly required to **register as an Organization** (not an individual developer account) for transparency — worth planning for at deployment time, as this affects account setup, not just app content.
- Personal-loan-specific extra requirements (license proof, rate/fee disclosure) do **not** apply here since this app has no lending features — but confirm during Play Console's Financial Features questionnaire that "net worth tracking / read-only account aggregation" is correctly scoped and doesn't trigger loan-app requirements.

**Practical implication for Discovery:** budget time in the deployment plan specifically for the Play Console Financial Features declaration and the Apple privacy-manifest/nutrition-label work — these are not optional checkboxes for an app in this category, even at 2-user scale.

### 2.7 Common pitfalls in fintech mobile apps

- **State management for real-time balance updates:** treat "balance" as an asynchronous, eventually-consistent value, not something updated optimistically client-side. Show balances/valuations only after backend confirmation (post price-refresh job or aggregator sync), and clearly surface "last updated at [time]" rather than implying real-time truth — this matches the PRD's "rafraîchissement automatique" (scheduled refresh) model rather than live streaming, which is appropriate for a personal net-worth tracker (not a trading app).
- **Offline support:** full local-first/offline-write architecture is explicitly flagged in current guidance as risky for financial systems (sync conflicts, schema-migration complexity across devices) — recommend **read-mostly offline caching** (last-known balances/charts cached locally for viewing when offline) rather than offline write/edit of financial data. Recurring-expense entries (manual add/edit) could tolerate a lightweight offline queue with conflict-on-sync handling, but net worth/position data should always be server-derived.
- **Sensitive data caching:** don't cache full account/transaction data unencrypted in local storage or via generic RN state persistence libraries (e.g., unencrypted redux-persist/AsyncStorage). If caching for offline viewing, use an encrypted local store and clear it on logout.
- **Screenshot / screen-recording protection:** Android has a native `FLAG_SECURE` window flag that blocks both screenshots and screen recording outright — apply it at least on balance/portfolio detail screens. iOS has **no equivalent hard-block API**; the standard workaround is detecting active screen recording (`UIScreen.main.isCaptured`, available since iOS 11) and app backgrounding, then overlaying a blur/redaction view over sensitive numbers. Libraries like `react-native-screenguard` or `react-native-screenshot-prevent` wrap both platform behaviors; a thin custom native module is also reasonable given the narrow scope (a handful of screens).
- **Household/shared-account data model:** explicitly separate the "user identity" (login/auth) entity from the "household/wealth space" entity in the schema from day one (PRD §9 already flags this) — retrofitting shared-access after building single-user-scoped tables is a common and costly rework in this app category.
- **Third-party API rate limits & partial outages:** design price-refresh and aggregator-sync jobs to tolerate partial failure per account/asset (log and retry per-item, don't fail the whole nightly batch) — aggregator and price-API outages are common enough to plan for explicitly.
- **Secrets never on-device:** aggregator client secrets and price-API keys must live only in the backend (Supabase Vault / Edge Function environment), never bundled into the mobile client or embedded in the app binary.

---

## 3. Framework Comparison Table

| Dimension | React Native + Expo | Flutter | Kotlin Multiplatform | Native (Swift/Kotlin) |
|---|---|---|---|---|
| Solo-dev velocity | Highest (JS/TS, huge ecosystem, EAS cloud builds, best AI-assist) | High (single codebase, but Dart + smaller AI-assist surface) | Low for full app (still 2 UI codebases) | Lowest (2 full codebases) |
| Ecosystem maturity for fintech integrations (charts, secure storage, biometrics, aggregator SDKs) | Very high | High, but narrower for niche financial APIs | Low-medium (logic-layer only) | High per-platform, but duplicated effort |
| UI/animation polish & pixel-perfect branding control | Good, closing the gap via Fabric | Excellent (Impeller, canvas-level control) | Native per-platform (excellent but duplicated) | Excellent |
| Charting libraries available | Victory Native XL, gifted-charts, Skia, ECharts wrapper | fl_chart, Syncfusion (free community license) | Must use native chart libs per platform | Native chart libs (Swift Charts, MPAndroidChart) |
| Biometric auth support | expo-local-authentication (unified) | local_auth (unified) | Per-platform native APIs | Per-platform native APIs (most control) |
| Secure storage support | expo-secure-store (Keychain/Keystore-backed) | flutter_secure_storage (same backing + more platforms) | Per-platform native APIs | Keychain / Keystore directly |
| Team fit for this project (solo builder + AI coding agent) | Best fit | Good alternative | Poor fit at this scale | Poor fit at this scale |
| Screenshot/recording protection | FLAG_SECURE (Android) + workaround (iOS), via libs | Same underlying platform constraints, Flutter-specific libs exist | Full native control | Full native control |
| Overall recommendation for MHTL Wealth | **Primary recommendation** | Strong alternative (favor if branding fidelity dominates) | Not recommended for v1 | Not recommended for v1 |

---

## 4. Recommended Stack

- **Mobile:** React Native + Expo (New Architecture, EAS Build/Update, TypeScript).
- **Charts:** react-native-gifted-charts (or Victory Native XL) for line/donut/bar/sparkline; escalate to `@shopify/react-native-skia` directly only if a future candlestick/high-frequency chart view is added.
- **Auth/session storage:** expo-secure-store for tokens, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` Keychain accessibility on iOS.
- **Biometric unlock:** expo-local-authentication as an additive convenience layer on top of email+password auth; per-spouse login required, biometric unlock gated per-device/per-user.
- **Backend:** Supabase (EU region) — Postgres with Row Level Security for household-scoped shared data; Supabase Auth for email+password (2FA/TOTP addable later); Supabase Cron (pg_cron) + Edge Functions for nightly price refresh and recurring-expense average recalculation; Edge Functions as webhook receivers for banking-aggregator callbacks; Supabase Vault for aggregator/price-API secrets.
- **Screenshot/recording protection:** FLAG_SECURE on Android for balance/portfolio screens; iOS screen-recording detection + blur overlay via `react-native-screenguard` (or thin custom native module) on the same screens.
- **Deployment:** Apple Developer Program ($99/yr) + Google Play Console ($25 one-time, likely requiring Organization registration once the Financial Features declaration is completed); budget explicit Discovery/build time for the App Privacy nutrition label, iOS privacy manifest, and Play Console Financial Features questionnaire.

---

## 5. Pitfalls (condensed)

1. Treating balances as real-time/optimistic instead of "last refreshed at X" — surface refresh timestamps, don't fake live data.
2. Building full offline write/sync for financial positions — restrict offline support to read-mostly caching; avoid offline editing of net-worth data.
3. Caching sensitive account/transaction data in unencrypted local storage (AsyncStorage, plain redux-persist) — use encrypted storage and clear on logout.
4. No screenshot/recording protection on balance screens — Android via FLAG_SECURE, iOS via recording-detection + blur overlay.
5. Mixing "user identity" and "household/wealth space" into one entity — model them separately from the first migration.
6. Not planning for partial failures in nightly price-refresh/aggregator-sync jobs — handle per-account/per-asset retry, don't fail the whole batch.
7. Embedding third-party API secrets in the mobile client — keep all aggregator/price-API secrets server-side (Supabase Vault).
8. Underestimating App Store/Play Store financial-app-specific submission steps (privacy manifest, financial features declaration, possible Organization account requirement) — budget explicit time for these, don't treat them as an afterthought at submission time.

---

## 6. Cost Implications

| Item | Estimated cost |
|---|---|
| Apple Developer Program | $99/year |
| Google Play Console | $25 one-time (registration); may require Organization-tier registration for financial-features apps |
| EAS Build/Update (Expo) | Free tier: 15 Android + 15 iOS builds/month — likely sufficient for a 2-user app's release cadence; Starter tier $19/mo if more frequent builds/OTA updates are needed |
| Supabase | Free tier sufficient for development and likely for 2-user production (500MB DB, 50k MAU, 2 projects); Pro tier $25/month recommended for production (backups, no project pause, higher limits) — trivial at this scale |
| Charting libraries | Free (react-native-gifted-charts, Victory Native XL, fl_chart); Syncfusion Flutter Charts free under Community License if Flutter is chosen |
| Third-party price APIs (crypto/stock/gold) | Not scoped in this research file (see open-banking/price-API research); budget a modest monthly API cost, factored into overall project cost separately |
| Banking aggregator (Powens/Bridge/Budget Insight/Plaid) | Not scoped in this research file — see the open-banking-aggregation research area; typically has per-connection or subscription pricing that dominates overall recurring cost for this app |
| App Store/Play Store commission | 15% on revenue under $1M/year (both platforms) — largely irrelevant since this is a personal, non-monetized app for 2 users, not a revenue-generating product |

**Overall:** mobile framework, backend, and charting choices are essentially free-to-very-low-cost at this 2-user scale (well under $50–75/month total for Expo + Supabase + developer accounts amortized). The dominant cost driver for the whole project will be the banking-aggregator subscription/API costs, not the mobile stack itself — confirm aggregator pricing in the dedicated open-banking research before finalizing budget.

---

## 7. References / Sources

- [Flutter vs React Native 2026: Performance Cost DX](https://www.agilesoftlabs.com/blog/2026/02/flutter-vs-react-native-2026-cost-dx_17)
- [React Native vs Flutter vs Expo vs Lynx (2026 Comparison)](https://www.groovyweb.co/blog/react-native-vs-flutter-vs-expo-vs-lynx-2026)
- [Flutter vs React Native in 2026: The Ultimate Showdown for App Development Dominance | TechAhead](https://www.techaheadcorp.com/blog/flutter-vs-react-native-in-2026-the-ultimate-showdown-for-app-development-dominance/)
- [React Native Performance Benchmarks: Expo vs Bare vs Flutter vs Native (2026)](https://www.applighter.com/blog/react-native-performance-benchmarks-expo-vs-bare-vs-flutter-vs-native-2026)
- [Flutter vs. React Native in 2026: Why the "New Architecture" and Impeller 2.0 Changed Everything | Bolder Apps Blog](https://www.bolderapps.com/blog-posts/flutter-vs-react-native-in-2026-why-the-new-architecture-and-impeller-2-0-changed-everything)
- [Flutter vs React Native: 46% vs 35% Market Share [2026]](https://tech-insider.org/flutter-vs-react-native-2026/)
- [Flutter vs React Native in 2026: The Definitive Comparison for Enterprise Apps | Cozcore Technology](https://www.cozcore.com/blog/flutter-vs-react-native-2026/)
- [Kotlin Multiplatform vs. Flutter vs. React Native: The 2026 Cross-Platform Reality - Java Code Geeks](https://www.javacodegeeks.com/2026/02/kotlin-multiplatform-vs-flutter-vs-react-native-the-2026-cross-platform-reality.html)
- [Kotlin Multiplatform vs Flutter vs React Native : What to Choose in 2026](https://www.techqware.com/blog/kotlin-multiplatform-vs-flutter-vs-react-native-what-to-choose)
- [React Native vs Flutter vs Kotlin Multiplatform: A CTO's Decision Guide (2026) | Medium](https://medium.com/@avirootinfosolution/react-native-vs-flutter-vs-kotlin-multiplatform-a-ctos-decision-guide-2026-21dc43277cf0)
- [SecureStore - Expo Documentation](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Security - Expo Documentation](https://docs.expo.dev/app-signing/security/)
- [Expo Auth: SecureStore + Biometrics 2026](https://reactnativerelay.com/article/react-native-authentication-expo-secure-storage-biometrics-protected-routes)
- [React Native MMKV vs AsyncStorage vs Expo SecureStore: 2026 Storage Decision Guide](https://www.pkgpulse.com/guides/react-native-mmkv-vs-async-storage-vs-expo-secure-store-2026)
- [flutter_secure_storage | Flutter package](https://pub.dev/packages/flutter_secure_storage)
- [React Native and Expo SecureStore: Encrypt local data - LogRocket Blog](https://blog.logrocket.com/encrypted-local-storage-in-react-native/)
- [Choosing The Best Charts React Native Library For 2026 - Nerdify Blog](https://getnerdify.com/blog/charts-react-native)
- [My Top 10 React Native Chart Libraries Heading Into 2026 | Stackademic](https://blog.stackademic.com/my-top-10-react-native-chart-libraries-heading-into-2026-46e115e3be38)
- [Best React chart libraries in 2026: Features, performance, and use cases - LogRocket Blog](https://blog.logrocket.com/best-react-chart-libraries-2026/)
- [Flutter Charts | Beautiful & Interactive Live Charts | Syncfusion](https://www.syncfusion.com/flutter-widgets/flutter-charts)
- [Best Flutter Charts for Visualizing Income and Expenditure](https://flutterdragon.com/best-flutter-charts-for-visualizing-income-and-expenditure/)
- [Top Flutter Charts, Plots, Visualization packages | Flutter Gems](https://fluttergems.dev/plots-visualization/)
- [Supabase Cron | Schedule Recurring Jobs in Postgres](https://supabase.com/modules/cron)
- [Cron | Supabase Docs](https://supabase.com/docs/guides/cron)
- [Convex vs Supabase vs Firebase in 2026 | Cadence blog](https://cadence.withremote.ai/blog/convex-vs-supabase-vs-firebase)
- [Supabase cron jobs: pg_cron, scheduled Edge Functions, and external triggers (2026)](https://crontap.com/guides/supabase-cron-jobs)
- [Best Firebase Alternatives in 2026 | Encore](https://encore.dev/articles/firebase-alternatives)
- [Scheduling Edge Functions | Supabase Docs](https://supabase.com/docs/guides/functions/schedule-functions)
- [🚀 How to Set Up Cron Jobs with Supabase Edge Functions Using pg_cron | Medium](https://medium.com/@samuelmpwanyi/how-to-set-up-cron-jobs-with-supabase-edge-functions-using-pg-cron-a0689da81362)
- [Supabase Pricing & Fees](https://supabase.com/pricing)
- [Supabase Pricing 2026: Plans, Free Tier Limits & Full Breakdown | UI Bakery Blog](https://uibakery.io/blog/supabase-pricing)
- [LocalAuthentication - Expo Documentation](https://docs.expo.dev/versions/latest/sdk/local-authentication/)
- [Biometric Authentication in React Native Expo: A Complete Guide (Face ID & Fingerprint) | Medium](https://sasandasaumya.medium.com/biometric-authentication-in-react-native-expo-a-complete-guide-face-id-fingerprint-732d80e5e423)
- [How to Add Face ID/Biometric Login to Your Expo+Clerk App](https://clerk.com/articles/how-to-add-face-id-biometric-login-to-your-expo-clerk-app)
- [App Privacy Details - App Store - Apple Developer](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple App Store Privacy Policy Requirements: Complete Guide (2026)](https://ultrafastutilities.com/apple-app-store-privacy-policy-requirements)
- [About privacy information on the App Store - Apple Support](https://support.apple.com/en-us/102399)
- [Provide information for the financial features declaration - Play Console Help](https://support.google.com/googleplay/android-developer/answer/13849271?hl=en-GB)
- [Google Play Financial Services policy – OMA support help center](https://orangeoma.zendesk.com/hc/en-us/articles/10119570262684-Google-Play-Financial-Services-policy)
- [Apps that contain any financial features must complete the Financial features declaration form - Google Play Developer Community](https://support.google.com/googleplay/android-developer/thread/311560076/)
- [How to Block Screenshot and Screen Share/Recording in react-native iOS and Android Apps | Medium](https://medium.com/@bpk.praveensankar/how-to-block-screenshot-and-screen-share-recording-in-react-native-ios-and-android-apps-for-a-db66d5ebfe12)
- [react-native-screenshot-prevent - npm](https://www.npmjs.com/package/react-native-screenshot-prevent)
- [React Native Screenguard](https://gbumps.github.io/react-native-screenguard/)
- [A Beginner's Guide to Local-First Software Development](https://blog.openreplay.com/beginners-guide-local-first-software-development/)
- [React Native Offline First App Development Guide](https://relevant.software/blog/react-native-offline-first/)
- [How to Build a Fintech Mobile App With Secure Banking Integrations | Computools](https://computools.com/how-to-build-fintech-mobile-app-with-banking-integrations/)
- [Expo Application Services Pricing](https://expo.dev/pricing)
- [Subscriptions, plans, and add-ons - Expo Documentation](https://docs.expo.dev/billing/plans/)
- [Choosing a Membership - Support - Apple Developer](https://developer.apple.com/support/compare-memberships/)
- [The 15% App Store Fee: A Guide for Developers (2026)](https://www.revenuecat.com/blog/engineering/small-business-program/)
- [Google Play Developer Fee 2026: $25 + 12-Tester Rule](https://www.iconikai.com/blog/google-play-developer-account-fee-2026)
