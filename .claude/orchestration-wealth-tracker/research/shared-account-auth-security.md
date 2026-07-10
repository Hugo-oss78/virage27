# Research: Shared-Account Authentication & Security (Couple Access to Household Wealth Data)

**Aspect:** shared-account-auth-security
**Project:** MHTL Wealth — mobile net-worth tracking app, shared by a couple (2 users), inspired by Finary
**Date:** 2026-07-10

---

## Summary

The PRD's core constraint is: **two people, two separate logins (email + password each), one shared "household" data set** (net worth, accounts, transactions, recurring expenses). This is a well-understood pattern in consumer fintech — Monarch Money, YNAB Together, and Splitwise all solve a version of it — and it maps cleanly onto the standard SaaS "multi-tenant" data model: separate the **identity** (User) from the **shared resource** (Household/Workspace), and connect them with a **membership join table** that carries role/permissions. This is a strictly better fit than Finary's own "Mode Famille," which (per Finary's own help center) makes both partners log in with **one shared set of credentials** — a pattern this project should explicitly avoid, since the PRD already commits to per-person credentials.

Given the sensitivity of the data (bank balances, investments, crypto holdings — i.e. a full financial profile of the household) and the fact that this app will likely integrate with a bank-aggregation provider (Powens/Bridge) that holds live read access to real bank accounts, **password-only auth is not sufficient**. Industry norms for comparable apps (Finary requires 2FA; PCI DSS v4.0.1 mandates MFA on every path to cardholder-adjacent data since March 2025; PSD2/SCA requires strong customer authentication for EU financial data access) point clearly toward **TOTP-based 2FA as a v1 requirement**, with app-level biometric re-lock (Face ID/Touch ID via OS secure enclave, not a custom biometric implementation) as a fast-follow UX layer on top of a proper session, not a replacement for it.

Recommended stack shape: **Postgres-backed backend with a `users` / `households` / `household_members` schema**, either self-hosted with a custom JWT auth layer, or built on **Supabase Auth + Postgres Row Level Security**, which natively supports exactly this "membership row → RLS policy" pattern and ships mobile SDKs. Clerk Organizations and Auth0 Organizations are viable alternatives if the team prefers a managed auth provider over rolling custom JWT logic, but both are overbuilt (and priced) for a 2-seat household use case; Firebase Auth lacks native org/role primitives and would require the same custom membership modeling anyway, with less relational integrity than Postgres for what is fundamentally tabular financial data.

---

## Key Findings

### 1. The "User vs. Household" split is the standard pattern, not something bespoke

Every multi-tenant SaaS reference architecture (Clerk, WorkOS, Supabase, Azure SQL SaaS tenancy guide, generic "multi-tenant data modeling" guides) converges on the same three-entity shape:

- **User** — identity/auth record: email, password hash, MFA secret, session/refresh tokens. Belongs to *itself*, never owns financial data directly.
- **Tenant / Organization / Household / Workspace** — the shared resource boundary. All financial data (accounts, balances, transactions, recurring expenses) is scoped to this entity's ID, not to a user ID.
- **Membership (join table)** — `household_members(user_id, household_id, role, joined_at, status)`. A user can theoretically belong to 0..N households (even though v1 scope caps it at "1 household, 2 members"), and a household has 1..N members. This join table is also the natural place to store per-member role (owner/member), invite state, and later, Monarch-style "mine/theirs/ours" tagging if that's ever wanted.

Every table that stores actual wealth data (bank accounts, investment positions, crypto holdings, recurring expenses, categories) carries a `household_id` foreign key — **not** a `user_id`. This is what makes "both partners see the exact same net worth view" trivial: it's one query scoped by `household_id`, independent of which member is logged in. Any per-member attribution (e.g., "who entered this manual gold position," "whose income is this") is captured separately via `created_by_user_id` / audit columns, not by fragmenting the data itself.

This is exactly the "shared database, `tenant_id` on every table" pattern described as used by Notion, Linear, and Slack, and is the pattern Supabase's own RLS documentation recommends for team/workspace apps: `account_id IN (SELECT account_id FROM team_members WHERE user_id = auth.uid())`.

### 2. How comparable consumer finance apps actually implement couple/household sharing

- **Monarch Money** (the closest real-world analog — Monarch is frequently described as the leading Finary-like household-finance app for couples in the US): each partner has their **own separate login/credentials** (no shared password, no shared device required) and connects their **own accounts** under it; all data rolls up into **one shared household dashboard**. Monarch models a household with an **Admin/Owner** (manages members, subscription, billing) and **Members** (spouse/partner) — i.e. exactly the role field in the membership join table above. Monarch's newer "Shared Views" feature lets each transaction/account be tagged mine / theirs / ours, which is a nice v2 idea but not required for v1 (PRD explicitly wants "accès égal aux mêmes données").
- **YNAB Together**: a "Group Manager" (subscription owner) invites up to 5 people to share budgets; every invitee has **their own login** (no password sharing). Members can do everything in the shared plan except manage billing/other members or delete the plan/data. This "owner has a couple of extra powers, members have full data access" split maps directly onto an `owner` vs `member` role in `household_members`.
- **Splitwise**: simpler expense-splitting case, but the same `users` / `groups` / `group_members` (join table) / `expenses(group_id)` shape — group is the shared-data boundary, membership join table links users to it.
- **Finary itself (important negative example)**: Finary's "Mode Famille" is documented as **one shared Finary account (one email/password) that both partners log into** — i.e. no per-person identity at all, and 2FA is tied to whoever holds "the" account. Community forum threads show users explicitly asking for a real multi-account/family mode, implying this is a known limitation. **This project's PRD already correctly rejects that model** by requiring per-person email+password; the research confirms this is the better-practice choice (matches Monarch/YNAB, not Finary's shortcut).

**Recommendation:** copy Monarch/YNAB's shape — per-user credentials + household-scoped data + owner/member role — not Finary's shared-credential shortcut.

### 3. Auth provider / library options

| Option | Fit for this project | Notes |
|---|---|---|
| **Supabase Auth + Postgres RLS** | **Strong fit.** | Auth (email+password, MFA/TOTP, refresh tokens) is built in; Postgres is a natural fit for relational wealth/transaction data; RLS policies enforce `household_id` scoping at the database layer (defense in depth beyond application code) using a `household_members` table exactly as modeled above; first-class mobile SDKs (Expo/React Native, Flutter, Swift, Kotlin). Custom claims/JWT hooks can embed `household_id` for fast RLS checks. Self-hostable if EU data residency becomes a hard requirement (see GDPR section) or usable via Supabase's EU-region hosting. |
| **Firebase Auth + Firestore rules** | **Weak fit.** | Firebase Auth itself is solid for email/password + MFA, but Firestore's document model is a worse fit for relational financial/transaction data than Postgres, and Firebase has **no native organization/role primitive** — the household/member modeling would need to be hand-rolled in security rules anyway, with less mature RLS-equivalent tooling than Postgres. Also a Google Cloud/US-company data-locality question to manage for GDPR. |
| **Clerk (Organizations)** | **Overbuilt but workable.** | Clerk's Organizations feature is literally built for "invite members into a shared workspace with roles," which is conceptually a perfect match, and Clerk has mobile SDKs (Expo, iOS). But it's designed for B2B multi-org SaaS (users switching between many orgs, SSO, SCIM) — heavy machinery for a fixed 2-person household. Usable, but the team would be paying for and configuring far more than v1 needs. |
| **Auth0 (Organizations)** | **Overbuilt, same reasoning as Clerk**, and Auth0's B2B Organizations model still treats a single "tenant" as the root of trust with orgs layered on top — more conceptual and pricing overhead than a 2-seat household app needs. Per-connection/org pricing model is aimed at B2B SaaS with many customer orgs. |
| **Custom JWT + Postgres** | **Strong fit, more work.** | Full control, no vendor lock-in, works well with the `users`/`households`/`household_members` schema directly. Requires building password hashing, MFA/TOTP, refresh-token rotation, rate limiting, and password-reset flows by hand (or via a library like Lucia/BetterAuth-style patterns) — all solvable but it's more upfront engineering than Supabase gives for free. |

**Recommendation:** Supabase Auth + RLS is the best default for a small team building a mobile app fast: managed auth (including MFA) + relational Postgres for financial data + RLS as a real second layer of access control tied directly to the `household_members` join table, with EU-region hosting available to help with the GDPR/data-residency preference noted below. A custom JWT + Postgres backend is the fallback if the team wants zero vendor dependency, at the cost of building MFA/session/reset flows themselves.

### 4. Password auth best practices

- **Hashing:** OWASP's 2024+/2026 guidance: use **Argon2id** as the default for new applications (minimum ~19 MiB memory, iteration count 2, parallelism 1, tuned up from there). If using bcrypt instead, use a work factor of **at least 12–14** in 2026 (10 is now considered too low), and note bcrypt silently truncates passwords at 72 bytes. Never roll your own hashing; never store passwords reversibly encrypted (only hashed).
- **Password reset flow:**
  - Generate a long (≥64-char), cryptographically random reset token; store only a **hash** of it (e.g., SHA-256) server-side, never the raw token.
  - Token must be **short-lived** (15–60 minutes) and **single-use**; issuing a new reset token should invalidate any previous outstanding token for that account.
  - Send the token only to the account's verified email, over HTTPS, and compare using constant-time comparison to avoid timing attacks.
  - Rate-limit / CAPTCHA the "forgot password" trigger endpoint itself, since it sends email and is a common abuse/enumeration vector. Avoid confirming/denying whether an email exists in the system (respond identically either way) to prevent account enumeration.
  - Reference: OWASP "Forgot Password" Cheat Sheet.
- **Rate limiting / brute-force protection:** combine (a) rate limiting login attempts per account and per IP, (b) a lockout or exponential backoff after ~5–10 failed attempts, (c) MFA (stops a correctly-guessed password from being sufficient on its own), and (d) monitoring/alerting on unusual failed-attempt patterns. A pure lockout policy without MFA is itself a denial-of-service vector against the other partner (see Pitfalls below) — favor backoff/CAPTCHA over hard lockout for a 2-user household account.
- **Sessions/tokens:** short-lived access tokens (e.g., 15 min) + longer-lived refresh tokens, with **refresh token rotation** (each refresh call issues a new refresh token; reuse of an already-rotated token is treated as a theft signal and should revoke the whole session family). Store tokens in OS-level secure storage on mobile (iOS Keychain, Android Keystore/EncryptedSharedPreferences), not plain AsyncStorage/localStorage-equivalent. Optionally bind refresh tokens to a device ID to blunt token theft/replay from a different device.

### 5. Is password-only sufficient for this app? — No; recommend TOTP MFA for v1

Arguments for requiring MFA (not just "nice to have"):

- **This app aggregates live bank/investment/crypto account access** (via Powens/Bridge per the PRD), meaning a compromised login doesn't just leak a net-worth number — depending on the aggregator's scope it can expose live account/transaction data across every connected bank. That is a materially higher blast radius than a typical consumer app login.
- **Direct competitor precedent:** Finary itself requires/strongly pushes 2FA (community threads reference a mandatory-2FA rollout); French Finary users already expect it as table stakes for this exact category of app.
- **Regulatory/industry signal:** PCI DSS v4.0.1 has required MFA on every access path to cardholder-adjacent data since March 2025; PSD2's Strong Customer Authentication (SCA) requirement in the EU pushes toward risk-based MFA for financial account access generally. While this app itself is not a bank, it is handling the same class of data and French/EU users will implicitly expect bank-grade posture.
- **Method choice:** prefer **app-based TOTP (e.g., Google/Microsoft Authenticator, or an in-app TOTP)** over SMS OTP — SMS is explicitly called out as vulnerable to SIM-swapping/SS7 interception and is now considered the weaker MFA option industry-wide.
- **Biometrics (Face ID/Touch ID) are a good complementary UX layer** — a fast local "unlock the app" re-authentication after the OS/device already trusts the user — but should be implemented via the platform's own secure-enclave-backed biometric APIs (protecting a locally-stored credential/session), not as a replacement for server-side authentication. It's an app-lock convenience layer on top of a real session, not a substitute for TOTP at login/sensitive-action time.

**Recommendation:** treat email+password as the baseline identity check, require **TOTP 2FA enrollment for both household members** as part of v1 (not deferred to a "later" phase), and add optional biometric app-lock (Face ID/Touch ID via secure enclave) for day-to-day re-entry convenience. This should be surfaced explicitly as a Discovery question resolution: the PRD already flags "2FA à évaluer en Discovery" — this research supports resolving that as **yes, include TOTP MFA in v1**, given the data sensitivity.

### 6. Secure storage of third-party tokens (aggregator/exchange API credentials)

The Powens/Bridge aggregator connection tokens, and any crypto-exchange API keys the user enters, are themselves high-value secrets (in the aggregator case, potentially enough to re-pull full bank data; in the exchange case, potentially trade/withdraw-capable if scoped too broadly).

- **Encrypt at rest**, don't just rely on "the database is access-controlled." Two realistic approaches:
  - **Postgres `pgcrypto`**: encrypt sensitive columns (token values) with `pgp_sym_encrypt`/`pgp_sym_decrypt` or AES functions. Simple, keeps ciphertext in the same table. Caveat: pgcrypto operations happen inside the DB server process, and the key must be supplied to that process — so the key itself cannot live in the same database; it needs to come from an application secret/config layer, and there's a brief moment of plaintext exposure during en/decryption inside Postgres.
  - **Envelope encryption via a KMS** (e.g., cloud KMS, or Supabase Vault which wraps pgsodium): generate a per-secret data encryption key (DEK), encrypt the actual token with the DEK, then encrypt (wrap) the DEK itself with a key held in a managed KMS. This is the standard "don't put the master key next to the ciphertext" pattern and is the recommended approach for anything beyond a hobby project — it decouples key rotation/access-control from the data store and avoids the DB-process plaintext exposure of raw pgcrypto.
  - **Practical recommendation for this project:** use Supabase Vault (built on pgsodium, gives KMS-backed envelope encryption "for free" if using Supabase) or an equivalent managed KMS (cloud provider KMS) to encrypt aggregator/exchange tokens; never store them in plaintext columns, never log them, and scope aggregator connections to **read-only** access (the PRD already specifies read-only, no transaction execution — make sure this is enforced both at the provider-consent level and in how tokens/scopes are requested from Powens/Bridge).
  - Rotate and re-consent aggregator connections periodically per the provider's own token-lifetime model (Powens connections are described as using time-limited access tokens with no raw banking credentials stored, which reduces — but doesn't eliminate — this project's own exposure).

---

## Data Model Pattern Recommendation

Minimum viable schema for v1 (2-member household, single household per couple, extensible later):

```
users
  id (uuid, pk)
  email (unique)
  password_hash            -- Argon2id
  mfa_totp_secret_encrypted
  mfa_enabled (bool)
  created_at, updated_at

households
  id (uuid, pk)
  name                       -- e.g. "Foyer [Nom de famille]"
  created_at

household_members
  id (pk)
  household_id (fk -> households.id)
  user_id (fk -> users.id)
  role                       -- 'owner' | 'member'
  status                     -- 'active' | 'invited' | 'removed'
  invited_by_user_id
  joined_at
  UNIQUE (household_id, user_id)

-- All wealth data hangs off household_id, not user_id:
accounts (id, household_id, type, provider, ...)
positions / holdings (id, household_id, account_id, ...)
recurring_expenses (id, household_id, category_id, ...)
audit_log (id, household_id, actor_user_id, action, entity_type, entity_id, diff jsonb, created_at, ip, user_agent)
```

Key modeling decisions worth flagging explicitly for Discovery/Architecture phases:

1. **`household_id`, not `user_id`, is the tenancy key on every financial table.** This is what guarantees "both partners see exactly the same data" for free, and is what an RLS policy (`household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND status='active')`) enforces at the database level.
2. **`created_by_user_id` / `actor_user_id` columns for attribution and audit**, separate from the tenancy column, so "who added this position" or "who edited this recurring expense" is always answerable without fragmenting the shared view.
3. **`role` in the membership table**, even though v1 has only 2 members — an `owner` (can manage membership/billing) vs `member` distinction avoids a single point of failure (see Pitfalls) and matches the Monarch/YNAB precedent.
4. Even though the PRD caps v1 at "1 household, ≤2 members," design the join table as many-to-many from day one (a `household_id`/`user_id` pair, not a `spouse_user_id` column on `households`) — it costs nothing now and avoids a painful migration if scope ever expands (kids, joint accounts with extended family, etc., explicitly flagged as "hors périmètre v1... à confirmer").

---

## Pitfalls (Project-Specific)

- **One partner accidentally locking the other out.** If the app implements hard account lockout after N failed attempts, or if MFA recovery is tied to a single device/phone number, one partner can be denied access by the other's mistakes (or by an attacker targeting either identity). Mitigations: per-user (not per-household) lockout/backoff so one partner's failed attempts never block the other; an `owner` role that can trigger a membership-level recovery for a locked-out `member` (with appropriate audit logging and re-verification, not a silent bypass); MFA recovery codes issued to each user individually at enrollment (printable/save-able one-time backup codes), not a shared recovery path. Explicitly avoid Finary's "Mode Famille" pattern of one shared password, which makes this failure mode worse, not better (whoever holds "the" account controls 2FA for both).
- **No admin/owner distinction → no way to remove a member (e.g., after a breakup) or recover the account.** Even in a happy-path "married couple" design, product and legal reality (separation, divorce, one partner losing access to a device) means there should be an `owner` who can revoke the other member's access and force a credential/token rotation across the household's connected accounts. This is exactly the Monarch/YNAB "Admin vs Member" split.
- **Session/token hijacking on shared or borrowed devices.** Given the app displays a full financial net-worth picture, ensure: short-lived access tokens + rotating refresh tokens with reuse detection; secure OS-level token storage (Keychain/Keystore); an app-level auto-lock (biometric or PIN) after backgrounding, independent of the underlying auth session, so a stolen/unlocked phone doesn't equal instant access to the financial view.
- **Audit logging is not optional for a 2-person shared-write system.** Even with just 2 users, "who changed the mortgage balance" or "who added/removed this crypto wallet" needs to be answerable — both for trust between partners and for debugging data-quality issues. Use an append-only `audit_log` table keyed by `household_id` + `actor_user_id`, written in the same DB transaction as the underlying change (not best-effort/async), covering every write path (no "quick edit" screen that bypasses it).
- **Aggregator (Powens/Bridge) tokens are a bigger blast radius than the app's own auth.** Even a well-secured app login is undermined if the bank-aggregator access token sitting in the database is stored in plaintext or over-scoped (e.g., requesting payment-initiation scope when only account-information/read access is needed). Enforce least-privilege scopes at the provider-consent level, and encrypt tokens at rest per the KMS/envelope-encryption approach above.
- **GDPR: data residency is a preference, not a hard EU-only mandate — but treat it as a hard constraint anyway for this project.** See compliance notes below; the practical risk (French user base, financial data, "MHTL" branding suggesting a France-oriented, quasi-private-bank aesthetic) argues for EU-hosted infrastructure even though GDPR technically permits properly safeguarded non-EU transfers.

---

## Compliance Notes (GDPR)

- **GDPR does not strictly mandate that data be stored inside the EU/EEA.** What it requires is a valid legal transfer mechanism (adequacy decision, Standard Contractual Clauses, Binding Corporate Rules) when personal data is transferred outside the EEA, plus Article 32 technical/organizational security measures (which for this app means encryption at rest/in transit, access control, and the security posture covered throughout this doc).
- **In practice, for this project, EU hosting is still the pragmatic default.** Two reasons beyond pure legal minimum-compliance:
  1. **French "digital sovereignty" expectations** — France has pushed for EU/French hosting preferences for sensitive data, and financial-data-handling entities in France may need to satisfy ACPR-adjacent expectations even as a non-regulated app riding on top of a regulated aggregator (Powens/Bridge are themselves ACPR-authorized AISP/PISP entities headquartered/hosted in the EU).
  2. **US-owned cloud providers remain reachable by US legal process (CLOUD Act/FISA 702) even when hosting data physically in the EU** — so if the goal is to minimize non-EU jurisdictional exposure for a French household's full financial profile, choosing EU-domiciled infrastructure and/or EU-region hosting from providers (e.g., Supabase's EU region) is the safer default, not just a checkbox.
- **This aligns with the auth provider recommendation above**: Supabase (and most modern BaaS providers) offer EU-region project hosting, which combined with self-hostability if ever needed, gives a credible path to "data stays in the EU" without over-engineering a v1 build.
- **Article 32 / security-of-processing checklist this design already satisfies:** encryption at rest (DB + secrets via KMS/pgcrypto), encryption in transit (HTTPS/TLS), access control (RLS + membership-scoped authorization), audit logging, and a documented incident-relevant capability (token rotation on suspected compromise, ability to revoke a member's access).
- **Right to erasure / data portability** should be scoped explicitly at Architecture/Discovery time: because data is household-scoped, "delete my account" for one partner is not the same as "delete the household's data" — the design needs a clear policy (e.g., leaving a household removes personal identity but the shared financial history persists for the remaining member, unless the household itself is deleted by its owner). This is a product/legal decision to surface in Discovery, not something to leave implicit.

---

## References / Sources

- Monarch Money — For Couples: https://www.monarch.com/for-couples
- Monarch Money — Monarch for Couples and Households (Help Center): https://help.monarch.com/hc/en-us/articles/20926382202004-Monarch-for-Couples-and-Households
- Monarch Money — Shared Views in Monarch (Help Center): https://help.monarch.com/hc/en-us/articles/42228648365076-Shared-Views-in-Monarch
- Monarch Money — Shared Views: A new way for partners to see money together (blog): https://www.monarch.com/blog/shared-views
- YNAB — YNAB Together: A Guide: https://support.ynab.com/en_us/ynab-together-B1nS78Cki
- YNAB — Introducing YNAB Together for Your Shared Financial Journey: https://www.ynab.com/blog/introducing-ynab-together-for-your-shared-financial-journey
- Splitwise database schema design (community write-up): https://dev.to/fightclub07/database-schema-design-of-splitwise-application-2ef0
- Splitwise system design schema (GitHub): https://github.com/meetgoti07/SplitWise-System-Design/blob/main/Docs/database-schema.md
- Flightcontrol — Ultimate guide to multi-tenant SaaS data modeling: https://www.flightcontrol.dev/blog/ultimate-guide-to-multi-tenant-saas-data-modeling
- WorkOS — The developer's guide to SaaS multi-tenant architecture: https://workos.com/blog/developers-guide-saas-multi-tenant-architecture
- Clerk — How to Design a Multi-Tenant SaaS Architecture: https://clerk.com/blog/how-to-design-multitenant-saas-architecture
- Clerk — How to Build Multi-Tenant Authentication with Clerk: https://clerk.com/blog/how-to-build-multitenant-authentication-with-clerk
- Supabase — Row Level Security (docs): https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase — Authorization via Row Level Security (features): https://supabase.com/features/row-level-security
- Supabase RLS best practices (MakerKit): https://makerkit.dev/blog/tutorials/supabase-rls-best-practices
- Row Level Security in Supabase: Multi-Tenant SaaS from Day One (dev.to): https://dev.to/issuecapture/row-level-security-in-supabase-multi-tenant-saas-from-day-one-4lon
- Auth0 vs Firebase (2026) comparison: https://www.buildmvpfast.com/compare/auth0-vs-firebase
- WorkOS — 5 best Firebase Auth alternatives 2026: https://workos.com/blog/firebase-auth-alternatives
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Forgot Password Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- Password Hashing in 2026: bcrypt vs Argon2 vs scrypt vs PBKDF2: https://toolsana.com/blog/password-hashing-2026-bcrypt-argon2-scrypt-pbkdf2-guide/
- Finary Help Center — How to enable 2FA: https://help.finary.com/en/articles/6518627-how-to-enable-two-factor-authentication-2fa-on-your-account
- Finary Help Center — Identifiants et comptes Finary par membre en mode Famille: https://help.finary.com/fr/articles/11898562-identifiants-et-comptes-finary-par-membre-en-mode-famille
- Finary Community — Mise en place obligatoire du 2FA: https://community.finary.com/t/mise-en-place-obligatoire-du-2fa/12549
- Finary Community — Compte Joint Finary: https://community.finary.com/t/resolu-compte-joint-finary/29509
- Worldline — Crucial Standards for Multi Factor Authentication in the Financial Sector (2026): https://worldline.com/en/home/main-navigation/resources/blogs/2026/crucial-standards-for-multi-factor-authentication-in-the-financial-sector
- Rublon — Which Industries Require Two-Factor Authentication (2FA)?: https://rublon.com/blog/which-industries-require-2fa/
- PostgreSQL docs — pgcrypto: https://www.postgresql.org/docs/current/pgcrypto.html
- OneUptime — How to Encrypt PostgreSQL Data at Rest (2026): https://oneuptime.com/blog/post/2026-01-21-postgresql-data-at-rest-encryption/view
- hyperion_vault — Encrypted secrets vault for PostgreSQL (KMS envelope encryption): https://pgxn.org/dist/hyperion_vault/0.4.0/
- OneUptime — How to Secure React Native Apps with JWT and Refresh Tokens (2026): https://oneuptime.com/blog/post/2026-01-15-react-native-jwt-refresh-tokens/view
- Refresh Token Rotation: Best Practices for Developers (Serverion): https://www.serverion.com/uncategorized/refresh-token-rotation-best-practices-for-developers/
- Obsidian Security — Refresh Token Security Best Practices: https://www.obsidiansecurity.com/blog/refresh-token-security-best-practices
- SentinelOne — How to Prevent Brute Force Attacks: https://www.sentinelone.com/cybersecurity-101/threat-intelligence/how-to-prevent-brute-force-attacks/
- Sonar — Audit Logging Best Practices, Components & Challenges: https://www.sonarsource.com/resources/library/audit-logging/
- Comprehensive Research: Audit Log Paradigms & Go/PostgreSQL/GORM Design Patterns (dev.to): https://dev.to/akkaraponph/comprehensive-research-audit-log-paradigms-gopostgresqlgorm-design-patterns-1jmm
- Secure Privacy — Data Residency Requirements: EU vs US Explained: https://secureprivacy.ai/blog/data-residency-requirements-eu-vs-us-explained
- Kiteworks — What French Financial Institutions Need to Know About Data Sovereignty Under GDPR: https://www.kiteworks.com/gdpr-compliance/data-sovereignty-france-financial-gdpr/
- GDPR Local — Guide to GDPR Data Residency Requirements for Compliance: https://gdprlocal.com/gdpr-data-residency-requirements/
- ACPR (Banque de France) — L'Open banking en France: https://acpr.banque-france.fr/fr/publications-et-statistiques/publications/lopen-banking-en-france
- Powens — Plateforme Open Finance & API: https://www.powens.com/fr/
- Datakeen — Open Banking & KYC: ce que la DSP2 change pour vos parcours en 2026: https://www.datakeen.co/blog/open-banking-kyc-dsp2
- Apple Support — Biometric security (Face ID/Touch ID, Secure Enclave): https://support.apple.com/en-ca/guide/security/sec067eb0c9e/web
- Apple Platform Security guide (March 2026): https://help.apple.com/pdf/security/en_US/apple-platform-security-guide.pdf
