# Research — Asset Price APIs (Gold, Crypto, Stocks/ETF)

Aspect: **asset-price-apis** for MHTL Wealth (mobile wealth-tracker, family account, 2 users, EUR base currency, French/EU context — PEA, Euronext Paris, physical gold, crypto wallets/exchanges).

Date of research: 2026-07-10.

---

## 1. Summary

For a **2-user personal-use app**, the right approach is to pick the cheapest reliable provider per asset class rather than one "do everything" vendor:

- **Gold / precious metals**: use a free-tier metals API (GoldAPI.io free tier or the genuinely free gold-api.com) for spot XAU/XAG price in USD, convert to EUR with a free FX API, and compute price-per-gram client/server-side (troy oz → gram is a fixed constant, no need to pay for a "per gram" endpoint). Refresh at most a few times a day — physical gold doesn't need real-time ticking.
- **Crypto**: **CoinGecko's free Demo API** (10,000 calls/month, 30 calls/min) is enough for pricing hundreds of coins in EUR with daily history. For actually pulling balances from exchanges/wallets, use each **exchange's own read-only API key** (Binance, Coinbase, Kraken, etc. — free, official, safest) for custodial holdings, and a wallet-balance API (**Covalent/GoldRush, Moralis, or Alchemy**, all with workable free tiers) for self-custody on-chain wallets, rather than paying for an aggregator like Zerion/Zapper/CoinStats (nice-to-have, not necessary at this scale).
- **Stocks/ETF (PEA, Euronext Paris)**: **Twelve Data** is the best fit — its free tier (800 calls/day, 8/min) explicitly covers Euronext Paris (XPAR) symbols, unlike Alpha Vantage (US-centric) or CoinGecko (crypto only). **EODHD** (~€19.99/mo "All World" plan) is the fallback/upgrade path if free-tier limits or ISIN-based lookups become a blocker, since it has deep EU exchange coverage and ISIN mapping. Avoid IEX Cloud (shut down Aug 2024) and be cautious with `yfinance`/unofficial Yahoo Finance scraping (ToS grey area, breaks without notice) — fine for a prototype, risky as the sole production source.
- **FX conversion**: **Frankfurter.dev** (ECB-backed, free, no key, no quota) is the simplest way to convert any foreign-currency holding to EUR, including historical rates for time-series performance charts.
- **Performance stats**: compute **Time-Weighted Return (TWR)** for asset/category performance display (removes distortion from deposits/withdrawals) and optionally **Money-Weighted Return / XIRR** as a secondary "what did I personally earn" figure — standard in Finary-like apps. This requires storing a transaction/position ledger locally, not just pulling live prices.
- **Total cost for 2 users**: the whole stack can run on **$0–30/month** using free tiers (GoldAPI free / gold-api.com free + CoinGecko free + Twelve Data free + Frankfurter free), with Twelve Data's $29/mo "Grow" plan or EODHD's €19.99/mo plan as the only likely paid necessity once Euronext ETF daily refresh needs exceed the free daily call budget.

---

## 2. Key Findings by Asset Class

### 2.1 Gold / Precious Metals APIs

| Provider | Free tier | Paid entry | Currencies | Per-gram support | Historical depth | Notes |
|---|---|---|---|---|---|---|
| **GoldAPI.io** | 100 requests/month free | Paid plans move to unlimited requests (Pro/Ultimate) | Multi-currency incl. EUR | Yes — provides price at multiple purities (24K–10K) and per gram/kg directly | LBMA AM Fix history back to 1968 | Simple flat JSON API, easy integration; free tier is very low volume (100/mo ≈ 3/day) but fine for twice-daily refresh of gold holdings for 2 users |
| **gold-api.com** | Genuinely free, no API key, reportedly **no rate limit** on the real-time endpoint | Paid tier only needed for "unlimited historical data" | Base currency appears USD; conversion to EUR needs a separate FX call | Not explicitly per-gram — returns spot price (needs troy-oz→gram conversion, a fixed constant) | Limited historical depth on free tier | Best "$0 forever" option if only current price is needed; do your own oz→gram and USD→EUR math |
| **Metals-API.com** | Free plan exists but very limited (basic functionality, low quota) | Multiple paid tiers, priced by monthly request volume; has been raising prices since 2024 | 180+ currencies incl. EUR, gram-level "carat" endpoint | Yes — dedicated carat/gram endpoint for multiple gold purities | Gold history to 1968, silver to 2010, platinum/palladium to 1990 | Most comprehensive (600+ symbols, base + precious metals) but pricier than GoldAPI/gold-api.com for the same use case |
| **MetalpriceAPI** | Free plan, no time limit, "very basic" functionality | Reasonably priced; annual billing = 2 months free | 150+ currencies incl. EUR | Troy oz, gram, kilogram | Previous-day historical rates published daily at 00:05 GMT | Combines metals + FX rates in one API — could replace a separate FX provider too |
| **freegoldapi.com** | Fully free, no key | N/A | Not confirmed for EUR | Not confirmed | Claims 768 years of gold history (1258–2025) | Interesting for deep historical backtesting/chart "since 1900" style features, but treat as a supplementary/backup source, not primary |
| Swissquote / LBMA direct | No public consumer API found | — | — | — | — | LBMA publishes official AM/PM gold fix; Swissquote itself doesn't expose a public free API for this use case — not recommended as a direct integration |

**Recommendation for gold:** Start with **gold-api.com** for zero-cost current spot price (XAU, XAG), or **GoldAPI.io** if per-gram/per-karat endpoints and official LBMA historical depth are wanted from day one. Convert USD→EUR via Frankfurter. Refresh 1–4x/day (physical gold valuation doesn't need intraday ticking) to stay well within any free-tier quota. Store the user's declared weight/purity (grams, karat) as manually-entered position data — there is no bank/broker API for physical gold, this is confirmed as manual entry in the PRD (§9: "Or physique : pas d'API bancaire, saisie manuelle + cours du jour à récupérer via API").

### 2.2 Crypto Price + Portfolio APIs

**Pure price/market data:**

| Provider | Free tier | Paid entry | Notes |
|---|---|---|---|
| **CoinGecko** | Demo API: 10,000 calls/month, up to 30 calls/min (public/no-key tier: 5–15 calls/min) | Analyst plan ~$129/mo (300 calls/min, 100k calls/mo cap listed at $35/mo tier per some sources — check current page) | Flat 1-credit-per-call model (predictable); free Demo plan historical data limited to **365 days back**; full history since 2013 requires paid Analyst+ plan. EUR supported natively via `vs_currency=eur`. Very developer-friendly, huge coin coverage, no card required for Demo key. |
| **CoinMarketCap** | Free tier: 50 calls/min, 15,000 credits/month (credits scale with data volume returned, not flat 1/call) | $79/mo entry (cheaper than CoinGecko's paid entry) | Credit-per-100-data-points model is less predictable to budget than CoinGecko's flat model; slightly better free-tier request rate but similar practical ceiling |

**Wallet/exchange balance aggregation (for actually valuing what the user holds, not just prices):**

| Provider | What it does | Free tier | Notes |
|---|---|---|---|
| **Exchange-native read-only API keys** (Binance, Coinbase, Kraken, etc.) | Official, first-party balance + transaction history read access | Free (it's just an API key with "read/view only" permission, no trading/withdraw scope) | **Safest and cheapest option** for custodial holdings — no third party sees credentials beyond the exchange itself; this is exactly the pattern portfolio trackers like CoinTracking/Wealthfolio/CoinTracker use. Binance defaults new keys to Read-Only; Coinbase Advanced API lets you create a key with only the "View" box checked. |
| **CoinStats API** | Aggregates 200+ exchanges + 120+ chains + 10k+ DeFi protocols into one unified portfolio view (balances, P/L, risk score) | 20,000 credits/month free, 2 req/s, no card required; wallet balance calls cost ~40 credits each | Good if you want one integration instead of many exchange-specific ones; free tier (20k credits / 40 credits per wallet call ≈ 500 wallet lookups/month) is generous enough for a 2-user app checking a handful of wallets/exchanges a few times a day |
| **Zerion API** | Normalized wallet data across EVM chains + Solana, 8,000+ protocols, flat monthly pricing, webhooks | Has a free/low tier; flat predictable pricing | Better for DeFi-heavy self-custody wallets; more predictable billing than Zapper |
| **Zapper API** | GraphQL portfolio data across many chains | 10,000 free points/month | Variable point cost per endpoint makes budgeting harder than Zerion; more chains covered overall |
| **Covalent (now "GoldRush")** | Multi-chain wallet balances, transactions, NFTs, one of the longest-running wallet-data APIs | Has free tier | Good general-purpose on-chain data provider, pairs well with a price feed |
| **Moralis** | Wallet token balances (native + ERC-20 + SPL) with USD pricing baked in | Free tier available for testing/low volume | Good if primarily EVM/Solana self-custody wallets |
| **Alchemy** | Node/RPC + data API, compute-unit (CU) pricing | 30M CUs/month free; $0.45/M CU pay-as-you-go after | More of an infra/RPC provider than a portfolio API; typically paired with a data/price provider rather than used alone for balances |

**Recommendation for crypto:** CoinGecko free Demo tier for pricing (EUR-denominated, refresh a few times/hour). For balances: exchange-native read-only keys for anything sitting on Binance/Coinbase/Kraken (zero incremental cost, official, most secure), and Covalent/Moralis (or CoinStats if consolidation is worth the tradeoff) for self-custody wallets. Don't build a Zapper/Zerion-grade DeFi position tracker unless the user actually has active DeFi positions — the PRD only mentions "wallets/exchanges," not DeFi protocols, so this can be deferred.

### 2.3 Stock / ETF / Brokerage Price APIs (French/EU, PEA, Euronext Paris)

| Provider | Free tier | Paid entry | Euronext Paris coverage | ISIN support | Notes |
|---|---|---|---|---|---|
| **Twelve Data** | 800 calls/day, 8 calls/min; covers US equities, forex, crypto on free tier — **explicitly lists Euronext Paris (XPAR) symbols** as supported globally | Grow $29/mo (55–377 calls/min, adds Level A stocks/ETFs/indices + starter fundamentals, no daily cap); Pro $99/mo; Ultra $329/mo | Confirmed — dedicated exchange page for XPAR | Not explicitly confirmed on free tier; likely gated to higher tiers | Best free-tier fit for this project: most generous free daily quota "among established providers" per third-party comparisons, and only one with confirmed Euronext Paris listing support out of the box |
| **Alpha Vantage** | 5 calls/min, 500/day; free tier is US-market-centric | Paid tiers exist but less commonly cited pricing found | Weak — historically limited non-US exchange coverage | Limited | Good for learning/small projects, but not the right fit for PEA/Euronext-heavy portfolios |
| **Financial Modeling Prep (FMP)** | Basic: free, 250 calls/day EOD only, 500MB/30-day bandwidth cap | Starter → Ultimate, roughly $99/mo–$2,500/yr; Premium tier adds UK/Canada, Ultimate adds full global coverage | Global coverage claimed (NA, Europe, APAC, LatAm, MEA) but Euronext Paris depth specifically not confirmed without a paid tier | Yes — FMP has a dedicated ISIN search endpoint | Fundamentals-heavy (income statements, DCF, 13F) — more than this app needs; useful fallback/secondary source, particularly for ISIN→ticker resolution |
| **EODHD (EOD Historical Data)** | Free: 20 calls/day, US exchanges, limited fundamentals | "All World" EOD ~€19.99/mo; "EOD+Intraday All World Extended" ~€29.99/mo; Fundamentals ~€59.99/mo; "All in One" ~€99.99/mo | Strong — 60+ exchanges incl. European markets/Euronext, 20,000+ ETFs, direct exchange data contracts | Yes — dedicated ID Mapping API (CUSIP/ISIN/FIGI/LEI/CIK ↔ Symbol) | The widely-recommended **IEX Cloud replacement** since IEX Cloud fully shut down Aug 31, 2024. Best paid option if free-tier limits (Twelve Data) become insufficient or ISIN-native lookups are needed for PEA-eligible fund screening |
| **IEX Cloud** | — | — | — | — | **Defunct.** Shut down May–Aug 2024, officially redirected customers to Intrinio (expensive, EOD historical from $3,100/yr). Do not build against this. |
| **Yahoo Finance (unofficial, `yfinance`)** | Free, unlimited-ish but unofficial | N/A | Broad global coverage including Euronext tickers (e.g., `MC.PA`) informally | Ticker-based only, no ISIN | Not an official API — scrapes front-end endpoints; ToS explicitly says "intended for personal use only"; breaks without notice when Yahoo changes endpoints, and gets IP-throttled/banned under heavy use. **Acceptable for a 2-person personal-use app as a free supplementary/backup source (this app is arguably within personal-use ToS bounds since it's not resold), but should not be the sole dependency** given reliability risk — always keep Twelve Data or EODHD as the primary. |

**Recommendation for stocks/ETF:** **Twelve Data free tier** as primary (confirmed Euronext Paris support, most generous free daily quota). Fall back to / upgrade to **EODHD's ~€20/mo plan** if the app needs broader EU exchange coverage, ISIN-based symbol resolution for PEA-eligible ETF screening, or higher request volume than Twelve Data's free 800/day allows once both users are actively using the app with multiple positions refreshed multiple times/day. Treat `yfinance`/Yahoo as an unofficial free backup only, given ToS ambiguity and breakage risk.

### 2.4 FX / Multi-Currency

| Provider | Free tier | Notes |
|---|---|---|
| **Frankfurter.dev** | Free, no API key required, no monthly quota (rate-limited only to prevent abuse) | Tracks 84 central banks, 201 currencies, history back to 1948 (ECB reference rates). **Best default choice** — zero cost, zero friction, EUR is the ECB's natural base currency which matches this app's EUR-first design. |
| **exchangerate.host** | Free plan; rates quoted against EUR by default; historical since 1999; timeseries endpoint capped at 365-day windows per request | Good alternative/backup; note the 365-day timeseries cap requires chunking requests for multi-year history charts. |
| **ExchangeRate-API** | Free tier available; history to 1990 for some pairs | Another viable backup/secondary source |
| **MetalpriceAPI** | Bundles FX rates with metals data | Could consolidate gold + FX into a single provider/subscription if desired |

**Recommendation:** Use **Frankfurter** as the default FX layer for converting any non-EUR-denominated holding (USD-priced gold spot, USD-priced crypto, foreign stock listings) into the EUR base currency, and for historical FX rates needed to compute EUR-denominated performance-over-time charts correctly (i.e., don't let FX movement get silently conflated with asset price movement — see Pitfalls below).

---

## 3. Computing Performance Stats (Day/Week/Month/Year/Since-Inception)

The PRD requires per-account and per-asset-class performance (§7.2): value, % change over day/week/month/year/since-inception, plus a consolidated net-worth-over-time curve. This is **not something any price API computes for you** — it requires combining live/historical prices with a locally-stored position/transaction ledger.

**Two standard return methodologies (both are relevant, similar to how Finary and other wealth apps present them):**

1. **Time-Weighted Return (TWR)** — the standard for judging "how did this asset/strategy perform," because it removes the distortion of cash flows (deposits/withdrawals). Calculated by breaking the timeline into sub-periods bounded by every cash flow (buy/sell/deposit/withdrawal), computing the sub-period return, then geometrically chain-linking (compounding) all sub-period returns together. This is what should drive the "% change" badges shown per account/asset-class and the "répartition/performance comparée" view in §7.2.
2. **Money-Weighted Return (MWR) / XIRR / "Personal Rate of Return"** — answers "what did I personally earn," weighting periods with more money invested more heavily; computed as the internal rate of return (IRR) on the cash flow series (deposits negative, withdrawals/current value positive) — trivially computable with an XIRR-style algorithm (Newton's method root-finding on the NPV=0 equation) given a list of (date, amount) pairs. Good as a secondary/net-worth-level metric ("depuis origine" overall).

**Simple approach for v1** (given this is a 2-person personal app, not an institutional PMS): for each period bucket (day/week/month/year/since-inception), snapshot the portfolio's EUR-valued market price at the bucket boundary date (using historical price + historical FX rate) and compute simple % change = (value_now − value_then) / value_then, **adjusted for external cash flows in that window** (otherwise a deposit mid-month looks like a 40% "gain"). A full TWR chain-link is the correct long-term design but a simplified "flows-adjusted simple return" is a reasonable v1 given the small scale.

**Implementation implications:**
- Need a **daily price snapshot job** per held asset (gold, each crypto, each stock/ETF) stored in a local time-series table — don't just call the live-price endpoint on each app open, since historical bucket comparisons (week/month/year ago) require either (a) calling each API's historical endpoint on demand, which burns quota fast under free tiers, or (b) maintaining your own daily snapshot table server-side, which is far cheaper on API quota and gives instant chart rendering. **Recommend (b)**: a lightweight daily cron/job that pulls EOD price + EOD FX rate for every held asset and appends to a local price-history table.
- The **net worth curve** (§7.2 "vue consolidée") is then just: for each day, sum(position quantity × EUR price that day) across all holdings + cash accounts — computed entirely from the locally stored snapshot table, no live API calls needed for historical charting.

---

## 4. Multi-Currency Handling (EUR base)

- Store every position's **native currency** and **native price** (e.g., USD for gold spot / most crypto, local currency for foreign stock listings) alongside the **FX rate at time of valuation**, so EUR value = native_price × quantity × fx_rate(native→EUR, date). Do not pre-convert-and-discard the native value — you need both for auditability and for showing "local performance vs. FX-adjusted performance" if ever desired.
- Use **historical daily FX rates** (Frankfurter) matched to the same date as each price snapshot, not "current FX rate applied retroactively" — otherwise historical performance charts will be silently wrong (a 5% EUR/USD move over a month would get misattributed as asset performance).
- Euronext Paris–listed stocks/ETFs (PEA-eligible) are typically already EUR-denominated, so no FX conversion needed there — but crypto (USD/USDT pairs primarily) and gold spot (quoted in USD internationally) do need conversion.

---

## 5. Provider Comparison Tables (Consolidated)

### Gold
| Provider | Free tier | Cheapest paid tier | EUR | Per-gram | Hist. depth | Verdict |
|---|---|---|---|---|---|---|
| gold-api.com | Free, no key, high/no rate limit | Only for extended history | Convert yourself | Convert yourself | Limited free | **Primary (cost)** |
| GoldAPI.io | 100 req/mo | Unlimited on Pro/Ultimate (price not published in search results) | Yes, multi-currency | Yes, native | Since 1968 | **Primary (features)** |
| Metals-API.com | Limited free | Tiered, rising prices since 2024 | Yes (180+ ccy) | Yes (carat endpoint) | Since 1968 | Backup / most complete |
| MetalpriceAPI | Free, unlimited time | Affordable, annual discount | Yes (150+ ccy) | Yes | Prior-day EOD | Backup, bundles FX |

### Crypto
| Provider | Free tier | Cheapest paid | EUR pricing | Historical depth (free) | Verdict |
|---|---|---|---|---|---|
| CoinGecko | 10,000 calls/mo, 30/min (Demo) | ~$129/mo Analyst (confirm current pricing at signup) | Yes, native `vs_currency=eur` | 365 days | **Primary for pricing** |
| CoinMarketCap | 15,000 credits/mo, 50/min | $79/mo | Yes | Not confirmed | Alternative if credit model preferred |
| Exchange read-only keys (Binance/Coinbase/etc.) | Free | Free | N/A (native) | Full account history | **Primary for balances (custodial)** |
| Covalent/Moralis/Alchemy | Free tiers available | Usage-based (e.g., Alchemy $0.45/M CU) | N/A | On-chain, full | **Primary for balances (self-custody)** |
| CoinStats API | 20,000 credits/mo | Paid tiers scale with credits | Yes | Aggregated | Nice-to-have consolidation |
| Zerion/Zapper | Free tiers (10k pts Zapper) | Flat (Zerion) / variable (Zapper) | Yes | Varies | Only if DeFi positions matter |

### Stocks/ETF
| Provider | Free tier | Cheapest paid | Euronext Paris | ISIN | Verdict |
|---|---|---|---|---|---|
| Twelve Data | 800 calls/day, 8/min | $29/mo Grow | **Confirmed** | Unclear on free tier | **Primary** |
| EODHD | 20 calls/day (US only) | €19.99/mo All World | Strong (60+ exch.) | Yes (dedicated mapping API) | **Upgrade path** |
| Financial Modeling Prep | 250 calls/day EOD | ~$99/mo+ | Unconfirmed depth | Yes (ISIN search) | ISIN resolution helper |
| Alpha Vantage | 500/day, 5/min | Unclear | Weak | Limited | Not recommended for this use case |
| yfinance/Yahoo (unofficial) | Free, unofficial | N/A | Good informally | No | Backup only, ToS/reliability risk |
| IEX Cloud | — | — | — | — | **Defunct — do not use** |

### FX
| Provider | Free tier | Verdict |
|---|---|---|
| Frankfurter.dev | Free, no key, no quota, ECB data since 1948 | **Primary** |
| exchangerate.host | Free, 365-day timeseries cap per call | Backup |
| ExchangeRate-API | Free tier, history to 1990 | Backup |

---

## 6. Recommended Approach for MHTL Wealth

1. **Gold**: gold-api.com (or GoldAPI.io free tier) for XAU/XAG spot in USD → convert to EUR via Frankfurter → compute per-gram from troy-oz constant (1 troy oz = 31.1034768 g) server-side. Refresh 1–4×/day via scheduled job; store manual entries (weight, purity/karat) per gold position.
2. **Crypto**: CoinGecko free Demo API for EUR-denominated pricing of all held coins (refresh every 15–60 min is plenty for a 2-user app, well within 10k calls/mo). Balances: read-only API keys directly against Binance/Coinbase/Kraken (whichever exchanges the couple actually uses — confirm in Discovery per PRD §9), plus Covalent or Moralis free tier for any self-custody wallet addresses. Skip DeFi aggregators (Zerion/Zapper/CoinStats) unless Discovery reveals active DeFi usage.
3. **Stocks/ETF/PEA**: Twelve Data free tier as primary, confirmed Euronext Paris coverage. Plan a budget line for Twelve Data Grow ($29/mo) or EODHD All World (€19.99/mo) once real usage (both users, live refreshing, multiple positions) is measured against the 800 calls/day free ceiling — likely still sufficient at this scale (2 users, personal portfolio, not intraday trading) if refreshed a few times/day rather than real-time ticking.
4. **FX**: Frankfurter for all currency conversion, current and historical.
5. **Data architecture**: build a **daily EOD snapshot job** (cron/serverless scheduled function) that pulls price + FX for every held asset once/day (or a few times/day) and writes to a local price-history table. All performance-stat computation (day/week/month/year/since-inception, net worth curve) reads from this local table — never recomputed live against the external APIs — to (a) stay well within free-tier quotas, (b) make chart rendering instant, and (c) decouple the app from any single provider's uptime.
6. **Return methodology**: implement flows-adjusted simple return per period bucket for v1; design the ledger (position + transaction history) so a proper TWR chain-link and XIRR/MWR calculation can be added later without a data-model migration.
7. **Provider abstraction**: wrap each asset class behind an internal interface (e.g., `PriceProvider.getSpot(assetType, symbol, currency)`) so providers can be swapped (e.g., Twelve Data → EODHD, or CoinGecko → CoinMarketCap) without touching business logic, given how often these vendors change pricing/limits (see IEX Cloud shutdown as a cautionary precedent) and how much numbers here are estimates from search results, not confirmed contract pricing.

---

## 7. Common Pitfalls

- **Rate limits on free tiers are tighter than they look once two people refresh the app several times a day** — e.g., Twelve Data's 800/day free cap sounds generous until you multiply positions × refresh frequency × 2 users; mitigate via the daily-snapshot-table architecture above rather than calling live endpoints on every screen open.
- **IEX Cloud-style vendor death**: IEX Cloud fully shut down in Aug 2024 with ~3 months' notice, stranding integrators; a provider-abstraction layer (point 7 above) is cheap insurance against the same happening to any of the smaller gold/crypto vendors.
- **Ticker symbol instability / reuse**: tickers get recycled (the article's example: ticker "SNOW" meant IGN Entertainment in the US in the early 2000s, then Snowflake Inc. later, and is *also* a live Amsterdam-listed stock under a different ISIN) — **always key stock/ETF positions off ISIN where possible**, not raw ticker, and use a mapping API (EODHD's ID Mapping API or FMP's ISIN search) to resolve ISIN→provider-symbol per data source, since Euronext-listed instruments can have different ticker conventions per vendor.
- **Multiple listings / share classes**: the same company/fund can trade under different tickers on different exchanges (e.g., a Euronext Paris listing vs. a US ADR) — pin the exact exchange + ISIN combination the user actually holds, not just a bare ticker.
- **Historical backfill costs**: free tiers frequently cap historical depth (CoinGecko free = 365 days; Twelve Data free daily-interval history varies by plan; EODHD free = US-only, 20 calls/day) — a "since inception" chart going back further than the free tier allows may require either a one-time paid historical pull or accepting a shorter chart window until enough daily snapshots have accumulated locally.
- **Data staleness vs. cost tradeoff**: free tiers are usually EOD (end-of-day) or delayed 15-20 min, not real-time — acceptable for a personal wealth-tracker (this isn't a trading app) but should be communicated in the UI (e.g., "as of [date/time]") so users don't mistake it for live market data.
- **FX timing mismatch**: applying today's FX rate to a historical price point (or vice versa) silently corrupts performance calculations — always pair the price snapshot and the FX snapshot from the same date.
- **Yahoo Finance / yfinance fragility**: unofficial scraping-based access breaks whenever Yahoo changes its frontend, and can get IP-throttled — fine as a free backup/cross-check, risky as sole production dependency.
- **Crypto exchange API key scope**: when generating exchange API keys, explicitly select "Read-only"/"View" permission and disable trading/withdrawal scopes — this is a security requirement, not just a data one, especially important for a shared-couple financial app per PRD §9's stated security concerns.
- **Metals-API.com price creep**: search results note this vendor "has been raising prices regularly since 2024" — re-verify current pricing before committing budget, and prefer GoldAPI.io/gold-api.com given the low-volume needs here.
- **On-chain wallet APIs (Covalent/Moralis/Alchemy) price by compute-unit/credit, not flat per-wallet**, so cost scales with how many chains/wallets you query and how often — keep self-custody wallet refresh frequency low (e.g., hourly, not real-time) for a personal app.

---

## 8. Cost Implications for a 2-User Personal App

| Layer | Recommended provider | Monthly cost |
|---|---|---|
| Gold spot | gold-api.com (or GoldAPI.io free) | **$0** |
| Crypto pricing | CoinGecko free Demo | **$0** |
| Crypto balances (custodial) | Exchange read-only keys (Binance/Coinbase/etc.) | **$0** |
| Crypto balances (self-custody) | Covalent/Moralis free tier | **$0** (until usage grows) |
| Stocks/ETF (Euronext, PEA) | Twelve Data free tier | **$0** initially; **~$29/mo** if free daily cap is exceeded |
| FX conversion | Frankfurter.dev | **$0** |
| **Estimated total** | | **$0/month at launch**, realistic steady-state **$0–30/month** (most likely spend, if any, is upgrading Twelve Data or adding EODHD ~€20/mo for better Euronext/ISIN coverage) |

This is comfortably within "small personal-use app" budget expectations — no asset-price API cost should be a blocker for this project. The larger cost risk in the overall PRD is the **bank aggregation layer** (Bridge/Powens/Plaid, mentioned in PRD §7.1/§9), which is a separate research aspect and typically far more expensive than any of the price APIs above.

---

## 9. Open Questions for Discovery (per PRD §11)

- Which crypto exchanges/wallets does the couple actually use? (Determines which read-only exchange keys vs. on-chain wallet APIs are needed — PRD §9 explicitly flags this as unresolved.)
- Are any crypto holdings in DeFi protocols (staking, LPs, lending) rather than simple spot balances? (Determines whether Zerion/Zapper-grade DeFi tracking is needed or exchange/wallet balance APIs suffice.)
- Which specific PEA/CTO brokers and ETFs are held? (Confirms Twelve Data/EODHD symbol coverage is sufficient; may reveal need for ISIN-based lookup if broker statements use ISIN rather than ticker.)
- How often does the couple want prices refreshed (daily vs. more frequent)? (Directly drives whether the free tiers suffice or a paid tier is needed.)
- Purity/format of physical gold holdings (bars vs. coins, karat)? (Affects whether a simple per-gram-24K calc suffices or premium/numismatic value needs manual override.)

---

## 10. References / Sources

- GoldAPI.io — https://www.goldapi.io/
- gold-api.com — https://gold-api.com/ , pricing: https://gold-api.com/pricing
- Metals-API — https://metals-api.com/ , pricing: https://metals-api.com/pricing , docs: https://metals-api.com/documentation
- MetalpriceAPI — https://metalpriceapi.com/ , pricing: https://metalpriceapi.com/pricing , gold: https://metalpriceapi.com/gold
- freegoldapi.com — https://freegoldapi.com/
- UniRateAPI gold — https://unirateapi.com/gold-price-api
- CoinGecko API pricing — https://www.coingecko.com/en/api/pricing ; docs (historical data) — https://docs.coingecko.com/docs/2-get-historical-data
- CoinMarketCap "Best Free Crypto API in 2026" — https://coinmarketcap.com/academy/article/best-free-crypto-api-in-2026-free-tier-comparison
- CoinGecko vs CoinMarketCap comparison — https://www.codex.io/blog/coingecko-api-vs-coinmarketcap-api
- CoinStats API — https://coinstats.app/api-docs/ , https://coinstats.app/api/
- Zerion vs Zapper comparison — https://zerion.io/blog/zerion-api-vs-zapper-api-a-comparison/ ; Zerion API — https://zerion.io/api
- Covalent/Alchemy/Moralis overview — https://www.alchemy.com/dapps/covalent , https://moralis.com/api/wallet/ , https://docs.moralis.com/web3-data-api/evm/reference/wallet-api/get-wallet-token-balances-price
- Binance API key permissions — https://developers.binance.com/docs/wallet/account/api-key-permission
- Coinbase Advanced Trade API / Portfolios — https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/guides/portfolios
- Twelve Data pricing — https://twelvedata.com/pricing ; Euronext Paris exchange page — https://twelvedata.com/exchanges/XPAR
- Alpha Vantage — https://www.alphavantage.co/ ; IEX Cloud shutdown analysis — https://www.alphavantage.co/iexcloud_shutdown_analysis_and_migration/
- Financial Modeling Prep pricing — https://site.financialmodelingprep.com/pricing-plans ; ISIN search API — https://site.financialmodelingprep.com/developer/docs/stable/search-isin
- EODHD pricing — https://eodhd.com/pricing ; ID Mapping API — https://eodhd.com/financial-apis/id-mapping-api-cusip-isin-figi-lei-cik-%E2%86%94-symbol
- IEX Cloud closure coverage — https://finazon.io/blog/iex-cloud-is-gone-why , https://www.waterstechnology.com/data-management/7951882/iex-cloud-closure-forces-fintech-clients-to-seek-data-alternatives
- yfinance / Yahoo Finance ToS discussion — https://github.com/ranaroussi/yfinance , https://legal.yahoo.com/us/en/yahoo/terms/product-atos/apiforydn/index.html
- Frankfurter FX API — https://frankfurter.dev/
- exchangerate.host — https://exchangerate.host/ , pricing: https://exchangerate.host/pricing
- ExchangeRate-API — https://www.exchangerate-api.com/
- Time-Weighted vs Money-Weighted Return — https://portfoliooptimizer.io/blog/the-mathematics-of-portfolio-return-simple-return-money-weighted-return-and-time-weighted-return/ , https://aleta.io/knowledge-hub/time-weighted-return-twr-vs-money-weighted-rate-of-return-mwrr , https://help.portfolio-performance.info/en/concepts/performance/money-weighted/
- Ticker vs ISIN reconciliation pitfalls — https://assetidbridge.com/ticker-%E2%89%A0-isin-5-reconciliation-traps-and-how-to-avoid-them/
- Euronext market data — https://www.euronext.com/en/data/how-access-market-data/web-services
