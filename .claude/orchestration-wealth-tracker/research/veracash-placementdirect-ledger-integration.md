# Research — Veracash, Placement Direct & Ledger On-Chain Tracking Integration

Aspect: **veracash-placementdirect-ledger-integration** for MHTL Wealth (mobile wealth-tracker, family account, 2 users, EUR base currency, French/EU context). Directly resolves the three items DISCOVERY.md flags as open (D15, D16, D17).

Date of research: 2026-07-10.

---

## 1. Summary

- **Veracash (D16): no public/partner API for end users or third-party apps exists.** Veracash's only confirmed external technical integration is with **Treezor** (a BaaS/EMI provider) for its IBAN + Mastercard payment-card infrastructure — that is Veracash's own backend plumbing, not something an outside app can call. A 2021 community thread on Finary (a comparable wealth-tracker) shows users requesting a Veracash integration with no evidence it was ever fulfilled via a real API. **Recommendation: manual entry is the only realistic option.** Veracash does publish free, unauthenticated, public spot-price pages for gold and silver (`veracash.com/gold-price-and-chart`, `/silver-price-and-chart`) and its member space offers downloadable relevés (PDF/XLS) — these are useful as *reference data* and as the source the user copies from, not as something to scrape/automate.
- **Placement Direct (D17): no self-serve public API either.** The one confirmed API integration is a "connecteur patrimonial" built specifically for **Linxo** (Crédit Agricole's Open Finance subsidiary), aimed at professional financial advisors (CGPs), not retail/indie developers. Because Placement Direct's asset classes (SCPI, assurance-vie, real-estate crowdfunding) sit squarely in Powens's coverage area (Powens already handles assurance-vie per DISCOVERY D2/D7, with 1,800+ European institution connectors), **the first real step is to check Powens's live connector catalog** for a "Placement Direct" or "Placement-direct Patrimoine" connector before defaulting to manual entry — this could not be confirmed or ruled out definitively from public search results because Powens's connector catalog is dynamic/interactive. If absent, fall back to manual entry, structured per sub-asset-type (SCPI parts / crowdfunding projects / assurance-vie contract with fonds euro + unités de compte).
- **Ledger (D15): confirmed standard pattern — never connect the physical device to the app.** Instead, the user extracts read-only public identifiers once via Ledger Live: an **xpub** (extended public key) for UTXO chains (Bitcoin, Litecoin, Bitcoin Cash) and a plain **public address** for account-based chains (Ethereum and any EVM chain — the same 0x address is valid across all EVM networks). These get entered into the app once during setup (matches DISCOVERY's note that this is a Phase 5 configuration-time question). Balances are then polled from free/low-cost blockchain-explorer APIs on the existing daily-sync cadence (D27): **Blockstream Esplora** for Bitcoin (free, public, no API key), and **Etherscan API v2 (multichain)** for Ethereum/EVM chains (free tier: 5 req/s, 100k/day, one key covers many EVM chains via `chainid` param). Ledger's own open-source **xpub-scan** tool (github.com/LedgerHQ/xpub-scan) is the reference implementation of exactly this pattern and confirms the safe architecture: derive addresses from the xpub locally/server-side, and only send the *derived addresses* (not the master xpub) to third-party explorer APIs.

---

## 2. Veracash Findings (D16)

### 2.1 No public/developer API

- Search for "Veracash API partenaire développeur" surfaces no developer portal, no public API docs, and no third-party integration marketplace listing.
- The one confirmed API relationship is with **Treezor** — an ACPR-approved e-money/payment institution that provides Veracash's "banking-as-a-service" backend: individual IBANs, SEPA transfers, the Mastercard, instant transfers, virtual cards. This is Treezor↔Veracash infrastructure, not an interface exposed to outside developers or aggregators.
- A **Finary community forum thread** ("[Intégration] Veracash", May 2021) shows users explicitly requesting Veracash support in Finary's wealth tracker, consistent with the fact that at the time (and per available evidence, still now) no public API existed for a third party to build against. There is no indication Finary ever shipped an automated Veracash sync — if they support Veracash today, it is very likely via manual entry too.
- Conclusion: **treat "no API" as confirmed with high confidence**, not just absence of evidence — a savings/e-money platform this size would be a natural fit for French aggregators (Powens, Bridge) if a connector existed, and none surfaced in search for either aggregator.

### 2.2 What Veracash *does* expose

- **Public, unauthenticated spot-price pages** (no login, no API key):
  - Gold: `https://www.veracash.com/gold-price-and-chart` — live price per gram/ounce/kilogram in EUR/USD/GBP/CHF.
  - Silver: `https://www.veracash.com/silver-price-and-chart` — same, live price per gram in multiple currencies.
  - Important nuance: Veracash's quoted buy/sell price includes **their own premium/spread** (their FAQ specifically discusses "la prime de l'argent") — it is *not* the raw LBMA/spot fixing. A generic spot-price API (gold-api.com, GoldAPI.io — see `asset-price-apis.md` research) will compute a *different* EUR figure than what Veracash's own account statement shows for the same gram weight, because it won't include Veracash's spread.
- **Authenticated member space ("espace membre")** with a "Relevés" (statements) section: downloadable **PDF or XLS** exports for the previous month, last 3 months, last 6 months, or a custom date range. This confirms Veracash statements are structured documents (not just a raw balance number) but there is no CSV or JSON export and no indication these can be fetched programmatically without logging in as the user (i.e., no OAuth/delegated-access flow — just a session-based web login).
- Veracash mobile app exists (iOS/Android) — it is the user-facing balance view, not a data source an outside app can query.

### 2.3 Recommended manual-entry design

Given no API and no safe way to programmatically log into an authenticated consumer portal (scraping an authenticated session would violate ToS and risk the user's account — explicitly avoid this), the manual-entry UX should mirror what a Veracash relevé/app screen actually shows:

- Fields to capture per snapshot: **metal type** (gold / silver, Veracash supports a gold/silver mix), **grams held**, **EUR valuation** (typed directly from the user's Veracash app/relevé — this is the authoritative number, already includes Veracash's spread, don't try to recompute it), **as-of date**, optional free-text note (e.g. "from July relevé").
- Do **not** attempt to auto-compute the EUR valuation from grams × a generic spot-price API — it will visibly disagree with what the user's own Veracash account shows, which will look like a bug even though it's an expected pricing-methodology difference. If an automatic "current estimate" between manual updates is desired, gold-api.com/GoldAPI.io can be used to show a *labeled estimate* ("~€X, estimated from spot price, may differ from your Veracash statement") separate from the last manually-confirmed value — but the manually entered figure should always be the value used for the net-worth total.
- This is inherently a manual snapshot, not something the daily sync job (D27) can refresh — surface a simple "last updated: [date]" indicator on this holding (reusing the same staleness-badge pattern D29 defines for degraded sync sources, even though here staleness is expected/normal rather than a failure) and prompt the user to update it when they open a new PDF/XLS relevé (monthly cadence is realistic, matching Veracash's own statement periods).

---

## 3. Placement Direct Findings (D17)

### 3.1 No self-serve public API

- No developer portal, API docs, or public integration marketplace found for placement-direct.fr.
- The one confirmed API integration: Placement-direct.fr built a **"connecteur patrimonial via API" for Linxo** (Crédit Agricole Payment Services' Open Finance subsidiary), reported by Profession CGP — this targets **financial advisors (CGPs)** who need a consolidated view of clients' portfolios, not individual retail users wiring up their own app. There's no indication this API is available for self-registration by an indie developer/personal project.

### 3.2 Check Powens's connector catalog first (actionable next step, not yet confirmed)

- Powens (the aggregator already chosen in D7) advertises 1,800+ European institution connectors and explicitly targets exactly this space: banking, brokerage, **assurance-vie, PER, and increasingly SCPI/real-estate investment platforms**. Given Placement Direct is a mainstream, well-known French online broker for assurance-vie/SCPI (comparable in profile to Linxea, which DISCOVERY D2 already expects Powens to cover), there is a reasonable chance Placement Direct — or at minimum its underlying insurers for the assurance-vie contracts (e.g. the "Placement-direct Patrimoine" contract, whose actual insurer/gestionnaire may be a separate entity Powens already connects to) — appears in Powens's connector catalog.
- This could not be confirmed from public web search (Powens's connector list at `docs.powens.com/api-reference/user-connections/connectors` is an interactive/searchable reference, not indexed with a static per-institution page findable via search engine). **Action item for Phase 5 (config time):** query the live Powens connector catalog (via Powens sandbox/dashboard, or their connectors API endpoint) for "Placement Direct" / "Placement-direct Patrimoine" by name before building any manual-entry fallback — if present, this eliminates the manual-entry burden for this source entirely and is strictly better (matches D26/D29 sync-failure/staleness patterns already built for every other Powens-backed source, for free).
- If absent from Powens (and from Bridge, the documented fallback aggregator per D7), fall back to manual entry as described below.

### 3.3 Asset types held on Placement Direct (drives data model)

Placement Direct is a multi-product broker; a single "Placement Direct" account in the data model is not one number but potentially three distinct position types simultaneously:

1. **SCPI shares held in direct ownership** ("SCPI en direct, sans frais d'entrée") — fields: SCPI name/ISIN, number of parts held, current price per part (updated periodically by the SCPI manager, not real-time), valuation date, distributed income (coupons downloadable as PDF — useful as a manual top-up cue).
2. **Real-estate crowdfunding positions** — fields: project name, amount invested, target/contractual rate, expected maturity/repayment date, status (in progress / repaid / defaulted). These are illiquid, fixed-term, and don't have a fluctuating "market price" the way SCPI/listed assets do — valuation is simply invested capital until repayment, so no live pricing feed is meaningful here at all; this is inherently a manually-tracked, maturity-dated asset regardless of any API.
3. **Assurance-vie / PER contracts** (e.g., "Placement-direct Patrimoine" contract, 0% entry fees, 0.6% annual management fees) — a wrapper containing a **fonds euro** (guaranteed capital sub-fund, cash-like) and one or more **unités de compte (UC)** including SCPI-within-assurance-vie (where SCPI revenue is reinvested 100% into the contract, a materially different tax/liquidity treatment than direct SCPI ownership — worth keeping as a separate `position_type` even though both reference "SCPI").

### 3.4 Recommended data model implication

Model a Placement Direct "account" as a container that can hold heterogeneous sub-positions rather than a single balance, mirroring how PEA/brokerage accounts already need a "positions" table in the general schema (per DISCOVERY's "Modèle de données" note: comptes multi-catégories + positions). Concretely: `account.provider = 'placement_direct'`, `account.product_type ∈ {scpi_direct, crowdfunding, assurance_vie}`, with type-specific fields on the position row (parts+price/part for SCPI, invested amount+maturity+rate for crowdfunding, fonds_euro_amount+UC list for assurance-vie). This lets manual entry (or a future Powens sync) update just the relevant sub-position without conflating three different valuation methodologies into one number.

---

## 4. Ledger On-Chain Tracking Findings (D15)

### 4.1 Standard pattern: public-key-only, no device connection

The universal, industry-standard approach for "watch-only" / read-only portfolio tracking of a hardware wallet (used by Koinly, CoinTracking, Waltio, and Ledger's own `xpub-scan` tool) is:

1. User connects their Ledger to **Ledger Live once**, locally, on their own computer/phone — not to the wealth-tracking app.
2. User extracts the relevant **public identifier** per account/chain from Ledger Live and copies it into the wealth app manually (paste a string) — a one-time setup action per address/account, not a recurring sync credential.
3. The wealth app stores only that public identifier and uses it purely to query public blockchain data via third-party explorer/indexer APIs. **At no point is a seed phrase, private key, or the physical device itself involved** in ongoing balance tracking.

This directly matches what DISCOVERY D15 already specifies ("pas de connexion au device Ledger lui-même, juste suivi de solde par adresse") — this research confirms it's the correct, standard, safe pattern and fills in the missing "how exactly."

### 4.2 Extracting the public identifier from Ledger Live

- **UTXO chains (Bitcoin, Litecoin, Bitcoin Cash):** Ledger Live exposes an **xpub** (extended public key) per account. Path: open the account in Ledger Live → wrench/settings icon → "Advanced" / "Advanced Logs" → the string starting `xpub…` (or `ypub…`/`zpub…` depending on whether the account is Legacy/SegWit/Native SegWit — Ledger Live's UI generally normalizes this to a "generic xpub" display regardless of address-type). One xpub deterministically represents an entire tree of receive/change addresses for that account — the tracking service derives addresses from it rather than needing every individual address by hand.
  - **Privacy caveat, important for the data model:** an xpub is not a secret in the private-key sense (it cannot move funds), but it **does deanonymize the entire transaction history and all derived addresses** of that account to whoever holds it. Treat it as sensitive PII: store encrypted at rest (Supabase RLS + column-level encryption or at minimum restricted to the owning household), never log it in plaintext, never expose it in a client-side network call if it can be kept server-side (derive addresses in a Supabase Edge Function and only send the *derived addresses* to external explorer APIs — this is exactly what Ledger's own `xpub-scan` does: "master public keys are never sent over the Internet: only their derived addresses are").
- **Account-based chains (Ethereum and any EVM-compatible chain):** there is no xpub concept — Ledger Live shows a single **public address** (`0x...`) per account, found on the account's "Receive" screen or account details. The same Ethereum address is valid and reusable across all EVM chains (Ethereum mainnet, Polygon, Arbitrum, Optimism, BNB Chain, etc.) — so one address covers however many EVM chains the user holds tokens on, and the wealth app just needs to know *which* chains to poll it against (a per-user config question, matching DISCOVERY's note that exact chains held is a Phase 5 question to re-ask the user).
- **Other non-EVM, non-UTXO chains** the user might hold on a Ledger (e.g., Solana, Cardano, XRP) each expose their own single public address in Ledger Live the same way as Ethereum (no xpub) — same "copy the address once" pattern applies; the polling API differs per chain (Solana has its own RPC/explorer APIs, not covered by Etherscan/Blockstream).

### 4.3 Reference implementation confirming the pattern: Ledger's own `xpub-scan`

`github.com/LedgerHQ/xpub-scan` is an official Ledger open-source tool billed as a "blockchain test oracle and forensics tool." Given an xpub, it derives all active addresses locally, then queries public blockchain APIs to fetch balances and operation history for just those derived addresses — producing JSON/HTML balance reports. It explicitly supports Bitcoin, Litecoin, Bitcoin Cash (via `--currency` flag) and Ethereum. This is a directly reusable architectural blueprint (or literally a reusable CLI/library) for the exact D15 requirement, and its "never send the xpub itself over the network" design principle should be adopted as-is.

### 4.4 Balance-polling API options (for the actual daily-sync job, D27)

| Provider | Chains | Free tier | API key needed | Notes |
|---|---|---|---|---|
| **Blockstream Esplora** (`blockstream.info/api`) | Bitcoin (+ Liquid) | Free, public, effectively unlimited for light use, no persistent logging/tracking claimed | **No** | Simplest, zero-cost default for BTC. Supports address and xpub-style stats endpoints (`chain_stats.funded_txo_sum - spent_txo_sum` = balance). Self-hostable if rate limits ever become an issue. |
| **Etherscan API v2 (multichain)** | Ethereum + many EVM chains via single API + `chainid` param | Free: 5 calls/sec, up to 100,000 calls/day | Yes (free signup) | Recommended default for ETH/EVM — one free key covers multiple chains, ample headroom for a 1x/day sync (D27) across 2 users' addresses. Note: free-tier chain coverage and endpoint availability has been narrowing through 2026 (e.g. some historical/internal-tx endpoints removed from free tier as of July 2026) — verify the specific "get balance by address" endpoint (the core one needed here) remains free before committing; it has historically been the most protected free endpoint. |
| **Blockchair** | Bitcoin, Ethereum, Litecoin, Bitcoin Cash, and several others in one unified API | Free tier exists (rate-limited) | Optional for basic queries, required for higher volume | Good single-API option if the Ledger holds several different chains and the team wants to minimize the number of distinct integrations, at the cost of a less generous free tier than chain-specific explorers. |
| **Moralis Wallet API** | EVM chains + Solana, decoded balances with USD pricing baked in | Free tier (compute-unit based, ~72 CU per typical request) | Yes | Higher-level/richer than raw explorer APIs (decodes token balances, adds pricing) — worth it only if the Ledger holds many ERC-20/SPL tokens beyond native BTC/ETH; adds complexity not needed for a simple native-balance-only v1. |
| **Alchemy** | EVM chains (+ some others via add-ons), primarily RPC/node infra | Free tier: 30M compute units/month | Yes | More of an RPC/infra provider than a portfolio API; typically paired with a separate price feed. Good fallback/expansion if Etherscan's free tier narrows further. |
| **Covalent / GoldRush** (Covalent rebranded) | Very broad multi-chain coverage (100+ chains) | Free tier available | Yes | Broadest chain coverage of the options here; consider if the user's Ledger holds long-tail chains not covered by Etherscan/Blockstream/Blockchair. |

**Recommendation for v1 (consistent with D3's minimal/free-budget constraint and D27's 1x/day sync cadence):** Blockstream Esplora (no key, free) for Bitcoin, plus Etherscan API v2 multichain (free key, generous quota) for Ethereum and any other EVM chain the user's Ledger holds. This costs €0/month and comfortably supports a daily scheduled sync plus manual pull-to-refresh for two users. Only reach for Blockchair/Covalent/Moralis if the user's actual Ledger addresses (to be confirmed with the user in Phase 5 per DISCOVERY D15) include non-EVM, non-Bitcoin-family chains (Solana, Cardano, etc.) that Etherscan/Blockstream simply don't cover.

### 4.5 Safest pattern, restated

- **Never** ask the user to connect the physical Ledger device to the app, and never request/store a seed phrase or private key — the app has no legitimate reason to need either for read-only balance tracking.
- **Only** collect: (a) one xpub per UTXO account (Bitcoin/Litecoin/etc.), and (b) one public address per account-based chain (Ethereum — reusable across EVM chains — plus any other chain the user holds), entered once by the user during setup.
- Store the xpub encrypted and treat it as sensitive (privacy, not fund-safety, risk); derive addresses server-side and query external APIs with derived addresses rather than the raw xpub where feasible, following Ledger's own `xpub-scan` design.
- Poll on the existing D27 cadence (daily job + manual refresh); apply the existing D26/D29 patterns (failure badge, last-known-value fallback) if a given chain's API is unreachable.

---

## 5. Recommended Data Model Implications (all three sources)

- **Veracash**: a manually-updated position row per metal type (`asset_class = 'precious_metal'`, `metal ∈ {gold, silver}`, `grams`, `eur_value_manual`, `as_of_date`), no automated sync possible — treat as an always-manual source with a staleness indicator, not a "sync failure" (it never syncs by design).
- **Placement Direct**: an account container with typed sub-positions (`product_type ∈ {scpi_direct, crowdfunding, assurance_vie}`), each with its own valuation fields (parts×price/part; invested amount+maturity; fonds_euro+UC list). Attempt Powens connector lookup first at Phase 5 config time; build the manual-entry schema regardless as the guaranteed-available fallback, since even a confirmed Powens connector may only expose contract-level totals rather than SCPI/crowdfunding line-item detail.
- **Ledger**: a `crypto_address` table keyed by `(chain, address_or_xpub, address_type ∈ {xpub, single_address})`, one row per chain/account the user configures at Phase 5, each with `last_synced_at`, `sync_status`, `balance_native`, and a reference to the price feed (CoinGecko, already chosen per `asset-price-apis.md`) used to convert to EUR for the net-worth total.

---

## 6. Pitfalls

- **Do not attempt authenticated scraping of Veracash's or Placement Direct's member portals.** Both are session/cookie-authenticated consumer web apps with no delegated-access (OAuth) flow; automating login risks ToS violation and account lockout/fraud flags, and is exactly the kind of "solo maintainer, no team" operational risk DISCOVERY D9 says to avoid. Manual entry (or an authorized aggregator like Powens/Bridge) are the only sanctioned paths.
- **Veracash valuation mismatch:** a generic gold/silver spot-price API will not match Veracash's own quoted EUR value for the same gram weight, because Veracash's price includes its own premium/spread. Always let the user's manually-typed EUR figure (copied from their Veracash app) be the number used in the net-worth total; use a spot-price API only for a clearly-labeled interim estimate, never as the authoritative value.
- **Placement Direct via Powens may only give contract-level totals**, not the SCPI/crowdfunding-project-level breakdown the DISCOVERY schema wants — verify actual field granularity in Powens's sandbox before assuming a connector (if one exists) fully replaces manual entry.
- **xpub is a privacy leak, not a fund-safety leak** — don't under-protect it just because "it's only a public key." Full transaction history and all derived addresses become visible to anyone who has it.
- **Etherscan free-tier scope has been narrowing** (per July 2026 changes) — re-verify the specific balance endpoint's free-tier status at implementation time rather than assuming indefinite free access; Alchemy/Blockchair are the fallback if it becomes paid-only.
- **Real-estate crowdfunding positions have no live market price by nature** (illiquid, fixed-term) — don't build pricing-feed plumbing for this sub-type; it's invested-capital tracking with a maturity date, always manual regardless of any future API.
- **EVM address reuse is a feature, not a gap**: don't ask the user to enter a separate address per EVM chain — one Ethereum address works for all EVM chains; only the list of *which chains to poll it on* needs configuring.

---

## 7. References

- [Information — Veracash](https://www.veracash.com/fr/information)
- [Veracash, making precious metals accessible as means of payment — Treezor](https://www.treezor.com/insights/success-stories/veracash-treezor-precious-metals-payment-innovation/)
- [\[Intégration\] Veracash — Finary Community](https://community.finary.com/t/integration-veracash/506)
- [Veracash — Centre d'aide](https://support.veracash.fr/aide/)
- [Comment consulter mes factures et relevés — Veracash support](https://support.veracash.com/fr/comment-consulter-mes-factures-et-relev%C3%A9s)
- [Guide Espace Membre Veracash (PDF)](https://static.veracash.com/howItWorks/guide-espace-membre-VeraCash-v1.0.pdf)
- [Cours de l'or en temps réel — Veracash](https://www.veracash.com/gold-price-and-chart)
- [Cours de l'argent en temps réel — Veracash](https://www.veracash.com/silver-price-and-chart)
- [Comprendre la prime de l'argent — Veracash blog](https://www.veracash.com/fr/blog/comprendre-prime-argent)
- [Un connecteur patrimonial via API — Profession CGP](https://www.professioncgp.com/article/produits-services/assurance/un-connecteur-patrimonial-via-api.html)
- [Investissez dans une SCPI en direct — Placement-direct.fr](https://www.placement-direct.fr/scpi)
- [Placement-direct Patrimoine — assurance vie & SCPI sans frais d'entrée](https://www.placement-direct.fr/assurance-vie/placement-direct-patrimoine)
- [PLACEMENT-DIRECT PATRIMOINE: Avis, Rendements, Frais, Bonus — francetransactions.com](https://www.francetransactions.com/assurance-vie/placement-direct-patrimoine.html)
- [Powens — plateforme Open Finance & API](https://www.powens.com/fr/)
- [Connectors — Powens API Reference](https://docs.powens.com/api-reference/user-connections/connectors)
- [Bridge API — Agrégateur de Comptes Certifié DSP2](https://www.bridgeapi.io/solutions/rapprochement-bancaire-automatise-en-continu/agregateur-de-compte)
- [Extended public key (xPub) — Ledger Support](https://support.ledger.com/article/360011069619-zd)
- [Tracking a Bitcoin xPub Address or Ledger xPub key using Vezgo](https://vezgo.com/blog/track-ledger-xpub-address-bitcoin-xpub/)
- [What is xPub for Ledger and is it safe to share — Grow SMSF Help Center](https://support.growsmsf.com.au/en/articles/10005525-what-is-xpub-for-ledger-crypto-wallet-and-is-it-safe-to-share-with-grow-smsf)
- [How to get the xpub from different wallets — Koinly Help Center](https://support.koinly.io/en/articles/9489974-how-to-get-the-xpub-from-different-wallets-brd-ledger-jaxx-etc)
- [Ledger - Main Public Keys — Waltio Help Center](https://help.waltio.com/en/articles/6660907-ledger-main-public-keys)
- [GitHub — LedgerHQ/xpub-scan](https://github.com/LedgerHQ/xpub-scan)
- [Bitcoin Explorer API — Blockstream.info](https://blockstream.info/explorer-api)
- [Blockstream/esplora API.md — GitHub](https://github.com/Blockstream/esplora/blob/master/API.md)
- [Rate Limits — Etherscan API](https://docs.etherscan.io/resources/rate-limits)
- [Etherscan API V2: Multichain — Etherscan Information Center](https://info.etherscan.com/etherscan-api-v2-multichain/)
- [What's Changing in the Free API Tier Coverage and Why — Etherscan Information Center](https://info.etherscan.com/whats-changing-in-the-free-api-tier-coverage-and-why/)
- [Blockchain API Documentation — Blockchair](https://blockchair.com/api/docs)
- [Moralis Wallet API](https://moralis.com/api/wallet/)
- [awesome-blockchain-crypto-api — GitHub](https://github.com/buddies2705/awesome-blockchain-crypto-api)
- [Gold API — FREE Gold, Silver and Crypto Price API](https://gold-api.com/)
- [GoldAPI.io — Free Real-Time Gold and Silver Spot Prices](https://www.goldapi.io/)
