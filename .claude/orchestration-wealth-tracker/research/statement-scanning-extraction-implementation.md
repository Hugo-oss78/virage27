# Research — Statement Scanning & Extraction Implementation

Aspect: **statement-scanning-extraction-implementation** for MHTL Wealth (Batch 8 pivot — D33-D38). Covers vision-LLM extraction of bank/investment statements uploaded by the user (photo or PDF), replacing Powens/DSP2 aggregation entirely for accounts without a usable API (D33).

Date of research: 2026-07-13.

---

## 1. Summary

- **Extraction mechanism (D34)**: call the Claude API from a Supabase Edge Function with the uploaded document as a `document` (PDF) or `image` content block, and force structured JSON output via **`output_config.format` (structured outputs / `json_schema`)**. This is GA on Claude Sonnet 5, Claude Opus 4.8, and Claude Haiku 4.5 — no beta header required. Use a single request per statement (soldes + positions + transactions + catégorisation in one structured pass, exactly as D34 specifies).
- **Model choice**: **Claude Sonnet 5** (`claude-sonnet-5`) as the default extraction model — best price/performance for this task, high-resolution vision support (2576px long edge / 4784 visual tokens), and structured-outputs support. Reserve **Claude Opus 4.8** as an escalation path only for documents Sonnet 5 flags as low-confidence or fails to parse cleanly (blurry photo, unusual layout) — not as the default, since the cost difference (~1.7x) is immaterial at this volume but Opus's extra capability is only needed for hard cases.
- **Cost**: at this household's realistic volume (5–30 scans/month, D2/D36), the extraction cost lands at **roughly $0.15–$3/month**, i.e. a few cents per statement scan. This is comfortably inside D3's "minimal/free" budget intent — it does **not** create a new Powens-style conflict, because it is metered pay-per-call with no subscription, minimum spend, or sales gate (this was the whole point of the pivot, D34). Full math in §3.
- **French-document pitfalls are real and must be handled explicitly in the prompt**: comma-as-decimal-separator ("1 250,00 €"), parentheses-as-negative or a separate Débit/Crédit column instead of a sign, space-as-thousands-separator, and multi-page transaction tables that split a row across a page break. None of these are automatically handled by the model — they must be named in the extraction prompt and validated in a post-processing step (regex/locale-aware parsing of the amounts the model returns), not trusted blindly.
- **Never save silently (D35 is non-negotiable, and the research confirms this is exactly what production OCR/extraction products do)**: Expensify's SmartScan (~98.6–99% field accuracy) and Dext's OCR (~99%+ claimed) both still route every scan through a mandatory human review/correction screen before anything posts to the ledger. A vision-LLM extracting a French bank statement should be assumed to have a comparable or somewhat lower accuracy ceiling on messy/low-quality photos, so the correction screen is not a "nice to have" — it is the actual accuracy mechanism, not a fallback for one.
- **Client upload flow**: use `expo-image-picker` (camera + library) and `expo-document-picker` (PDF) to get a local file URI, then **upload directly to Supabase Storage from the client** (private household-scoped bucket, matching D37's storage requirement anyway) and pass only the **storage path** to the Edge Function — not raw base64 in the function payload. The Edge Function downloads the file server-side (service-role key), base64-encodes it, and calls the Claude API. This avoids Edge Function payload-size ceilings, is the pattern Supabase's own docs recommend for anything beyond trivial payloads, and means the document is already durably stored (D37) before extraction even runs.
- **Deduplication (D35)**: use a three-factor heuristic — date proximity (exact match preferred, ±3 days tolerance at statement boundaries), amount exact match (±0.01€ rounding tolerance), and fuzzy merchant-label similarity (normalized string + trigram/Levenshtein similarity, threshold ≈0.85). Only auto-flag as "probable duplicate" when **all three** align with high confidence; surface lower-confidence overlaps as a softer "possible duplicate, please check" banner rather than silently merging or silently ignoring — the user is always the final arbiter, consistent with D35's principle of never acting silently.

---

## 2. Vision Extraction Best Practices

### 2.1 Claude's document/vision capabilities relevant to this use case

Source: `platform.claude.com/docs/en/build-with-claude/vision.md` and `pdf-support.md`, fetched live 2026-07-13.

**Images** (photos taken via `expo-image-picker`):
- Supported formats: JPEG, PNG, GIF (first frame only), WebP. JPEG is what the camera will produce by default — fine.
- Claude tiles images into 28×28px "visual token" patches: cost = `⌈width/28⌉ × ⌈height/28⌉`.
- **Resolution tiers** (current, confirmed 2026-07-13):
  | Tier | Models | Max long edge | Max visual tokens |
  |---|---|---|---|
  | High-resolution | Claude Fable 5, Mythos 5, **Opus 4.8**, Opus 4.7, **Sonnet 5** | 2576 px | 4784 |
  | Standard | All other models (incl. Sonnet 4.6, Haiku 4.5) | 1568 px | 1568 |
  High-res is automatic on Sonnet 5/Opus 4.8 — no beta header, no client opt-in. This matters directly: a full-page phone photo of a statement, sent at native resolution, gets meaningfully more visual tokens (and thus better small-text legibility) on Sonnet 5 than it would on an older/cheaper model — worth knowing when tempted to downgrade to Haiku for cost. **Do not use Haiku 4.5 for statement extraction** — it's capped at the 1568px/1568-token standard tier, which will blur small transaction-table text on a full-page statement photo.
- Max image size 10MB (base64) / max 8000×8000px dimensions via the API directly.
- **Image quality guidance directly from Anthropic's docs, directly applicable here**: ensure images are not blurry/pixelated; make sure text is legible and not too small; avoid over-cropping to enlarge text (loses context); heavy JPEG compression can make text unreadable — inspect the actual bytes sent, don't just trust "it looked fine on my phone screen." **Practical implication for the camera capture screen**: default `expo-image-picker` quality to something like 0.8–0.9 (not the default lower compression some apps use for speed), and prefer capturing in good lighting straight-on rather than at an angle — Claude's own limitations section explicitly calls out **rotated, low-quality, and very-small (<200px) images** as accuracy risks.

**PDFs** (via `expo-document-picker`, e.g. a downloaded bank statement PDF):
- Claude converts each PDF page to an image internally *and* extracts the page's text, feeding both to the model — this is why PDF statements tend to out-perform photos: the model gets a "OCR-quality" text layer as a hint alongside the visual layout, rather than relying on vision alone.
- Limits: 32MB request size, 600 pages/request (100 pages if the effective context is under 1M tokens — irrelevant here, statements are 1–5 pages).
- Cost: ~1,500–3,000 text tokens/page (content-dependent) **plus** the same image-token cost as a photo of that page, at standard API pricing (no PDF surcharge).
- Best-practice checklist directly from Anthropic's docs, all directly relevant: place the PDF content block before the text instruction in the request (image-then-text ordering measurably improves results); use documents with legible, upright, standard-font text (a scanned PDF from an old scanner/fax-style bank export is closer to "photo" risk than "clean digital PDF" risk — treat both paths with the same skepticism); split unusually large/dense statements into sections if needed; enable prompt caching only if the same document is queried more than once in a session (not the common case here — each statement is scanned once).

### 2.2 Getting reliable structured JSON output

Two supported mechanisms; **use structured outputs (`output_config.format`), not a hand-rolled "please output JSON" prompt**:

1. **Structured outputs (recommended for this feature)**: `output_config: {format: {type: "json_schema", schema: {...}}}` on `messages.create()` (or `client.messages.parse()` in Python/TS, which validates automatically). GA on Claude Sonnet 5, Opus 4.8, Haiku 4.5, and Fable 5. Constrains the response to validate exactly against the schema — no more, no less. Supports `enum` (ideal for forcing the ~10–12 D19 categories), nested objects/arrays (ideal for `transactions: [...]`, `positions: [...]`), and `additionalProperties: false`. **Known incompatibilities to design around**: not compatible with **citations** (`citations: {enabled: true}` on the document block returns a 400 if combined with `output_config.format`) and not compatible with assistant-turn prefill. Since D35's correction screen already shows the source document next to the extracted fields (manual visual cross-check by the user), citations-based auto-highlighting of "where in the document this number came from" is a nice-to-have, not a requirement — skip it for v1 rather than give up structured outputs for it.
2. **Strict tool use** (`strict: true` on a single forced tool definition, `tool_choice: {type: "tool", name: "record_statement_extraction"}`): equally valid alternative, guarantees the same schema conformance. Slightly more idiomatic if the extraction pipeline is later folded into a broader agentic tool-calling flow (e.g. if a human-in-the-loop or multi-step correction agent is added later), but for a single-shot extraction call `output_config.format` is simpler and is what Anthropic recommends first. Either approach is a legitimate choice for Phase 9/10 implementation — pick one and be consistent.

**Recommended extraction schema shape** (concrete, to unblock task-file writing in Phase 9/10):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["document_type", "statement_period", "accounts", "extraction_confidence"],
  "properties": {
    "document_type": {"type": "string", "enum": ["compte_courant", "epargne", "pea", "compte_titres", "assurance_vie", "veracash", "placement_direct", "autre"]},
    "statement_period": {
      "type": "object",
      "additionalProperties": false,
      "required": ["start_date", "end_date"],
      "properties": {
        "start_date": {"type": "string", "format": "date"},
        "end_date": {"type": "string", "format": "date"}
      }
    },
    "accounts": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["account_label_raw", "balance_eur", "currency_on_document", "transactions", "positions"],
        "properties": {
          "account_label_raw": {"type": "string", "description": "Account name/number exactly as printed on the document"},
          "balance_eur": {"type": "number", "description": "Closing balance, decimal EUR (comma-to-period already normalized), or the model's best-effort EUR conversion if the document is in a foreign currency — flag via extraction_confidence if conversion was needed"},
          "currency_on_document": {"type": "string", "description": "ISO currency code as printed (e.g. EUR, USD) — used to detect if conversion happened"},
          "transactions": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["date", "label_raw", "amount_eur", "category", "confidence"],
              "properties": {
                "date": {"type": "string", "format": "date"},
                "label_raw": {"type": "string", "description": "Transaction label exactly as printed, uncleaned"},
                "amount_eur": {"type": "number", "description": "Signed amount: negative = debit/outflow, positive = credit/inflow, regardless of how the source document represented the sign (parentheses, Débit/Crédit column, minus sign, colored text)"},
                "category": {"type": "string", "enum": ["Logement", "Charges & Abonnements", "Alimentation", "Restaurants", "Transport", "Santé", "Shopping", "Loisirs", "Voyages", "Services", "Non catégorisé"]},
                "confidence": {"type": "string", "enum": ["high", "medium", "low"], "description": "Model's own confidence this row was read correctly — surface 'low' rows first on the correction screen"}
              }
            }
          },
          "positions": {
            "type": "array",
            "description": "For PEA/compte-titres/assurance-vie statements only; empty array for simple bank accounts",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["label_raw", "isin", "quantity", "value_eur"],
              "properties": {
                "label_raw": {"type": "string"},
                "isin": {"type": ["string", "null"]},
                "quantity": {"type": ["number", "null"]},
                "value_eur": {"type": "number"}
              }
            }
          }
        }
      }
    },
    "extraction_confidence": {
      "type": "object",
      "additionalProperties": false,
      "required": ["overall", "issues"],
      "properties": {
        "overall": {"type": "string", "enum": ["high", "medium", "low"]},
        "issues": {"type": "array", "items": {"type": "string"}, "description": "Free-text notes on anything ambiguous: blurry section, currency conversion performed, column alignment uncertain, page cut off, etc."}
      }
    }
  }
}
```

The `confidence`/`extraction_confidence` fields are not part of any Anthropic-provided feature — they are a **prompted self-report** (ask the model to rate its own confidence per field in the same structured pass). This is a well-established mitigation pattern for exactly this class of problem (financial OCR-adjacent extraction) and costs nothing extra since it's part of the same JSON schema/single API call — it directly powers the "surface uncertain rows first" behavior D35's correction screen should have.

### 2.3 System/user prompt guidance — bake the known failure modes into the prompt explicitly

Do not assume the model infers French banking conventions correctly by default; state them:

- **Decimal separator**: "French financial documents use a comma as the decimal separator and a space (or period, on older documents) as the thousands separator — e.g. `1 234,56 €` means one thousand two hundred thirty-four euros and fifty-six cents. Always normalize to a JSON number with a period decimal (`1234.56`), never comma."
- **Negative amounts / sign convention**: French bank statements represent debits three different ways depending on the bank: (a) a single amount column with a leading `-`, (b) parentheses `(45,00)`, or (c) two separate columns headed "Débit"/"Crédit" with no sign at all — the column position *is* the sign. Instruct explicitly: "If amounts appear in two columns labeled Débit and Crédit (or Retrait/Versement, or similar), treat every value under the debit-labeled column as negative and every value under the credit-labeled column as positive, even though the printed number has no minus sign."
- **Currency symbol confusion**: statements from foreign-currency accounts (e.g. a USD brokerage sub-account inside an otherwise-EUR statement) can have `$` figures interleaved with `€` figures on the same page. Instruct the model to read the printed currency of each figure and only convert to EUR when explicitly asked, flagging any conversion it performs in `extraction_confidence.issues` rather than silently guessing an exchange rate — D18 already mandates EUR as the display currency, but the extraction step should be honest about when it had to convert versus when the source was already EUR.
- **Table column misalignment**: bank-statement PDFs frequently have inconsistent column widths across pages, or a transaction description that wraps onto a second visual line without a second date — instruct the model to treat a line with no date/amount as a continuation of the label above it, not a new empty transaction.
- **Merged or split transaction rows**: a single logical transaction can be split across a page break (rare but happens on year-end/heavy months), or conversely a batch payment can appear as one row on the statement but represent several logical purchases — for v1, extract exactly what's printed as one row = one transaction; do not attempt to infer sub-splits the document doesn't show. This keeps the extraction contract simple and matches what the user will see when cross-checking against the physical document on the correction screen.
- **Multi-page statements**: send all pages of one statement in a single request (one PDF `document` block, or multiple ordered `image` blocks each labeled "Page N of M" per Anthropic's multi-image guidance) rather than one request per page — the model needs the full document in context to avoid double-counting a balance shown on both a summary page and a detail page, and to correctly stitch a transaction table that spans pages.

### 2.4 Prior art — how existing products structure extraction + correction UX

This directly validates D35's design (mandatory correction screen, never silent save) rather than suggesting anything different — worth citing as confirmation, not as a source of new UX ideas:

- **Expensify SmartScan**: combines OCR with downstream policy/validation logic, cited accuracy ~98.6–99% on receipts (a much simpler document than a multi-page statement with 20+ transaction rows), yet user reports still describe edge-case failures (cropping, misread fields) requiring manual correction routinely. Every scan lands in a review state before it's treated as a real expense.
- **Dext (formerly Receipt Bank)**: markets ~99%+ line-item OCR accuracy including a dedicated "Line Item Extraction" feature that splits a document into individual rows automatically (directly analogous to what this feature needs for a transaction table) — but explicitly still requires the user to "review and publish," and category suggestions are described as "quick and easy to edit," i.e. treated as a suggestion, not a fact.
- **Takeaway for this app**: neither Expensify nor Dext — both mature, well-funded products purpose-built for financial-document OCR, with presumably years of fine-tuning — trust their own extraction enough to skip human review, even on simpler documents (single receipts) than a multi-page bank/investment statement. This is strong evidence D35's "obligatoire après chaque extraction, jamais d'enregistrement silencieux" is the right call, not overcaution, and that per-row confidence surfacing (§2.2) is worth the extra prompt complexity because it lets the correction screen prioritize what a user actually needs to check instead of asking them to re-verify every single row uniformly.

---

## 3. Cost Estimate

### 3.1 Current pricing (verified 2026-07-13, `platform.claude.com/docs/en/pricing`, cross-checked against multiple independent trackers)

| Model | Input $/1M tokens | Output $/1M tokens |
|---|---|---|
| Claude Sonnet 5 | $2.00 (introductory, through 2026-08-31) → $3.00 standard | $10.00 (intro) → $15.00 standard |
| Claude Opus 4.8 | $5.00 | $25.00 |
| Claude Haiku 4.5 | $1.00 | $5.00 (not recommended for this task — standard-tier vision resolution only, see §2.1) |

No separate "vision" or "PDF" surcharge — image/PDF content is billed as the input tokens it resolves to (visual tokens per §2.1), same $/token rate as text.

### 3.2 Per-scan cost — worked example

**Scenario A: single-page statement, photographed** (a simple current/savings account monthly statement, ~15–25 transaction rows):
- Image tokens: a full-page portrait photo at reasonable capture resolution (e.g. ~2000×2600px after the app's own light compression) exceeds the Sonnet 5/Opus 4.8 high-res cap (2576px long edge / 4784 visual tokens) and gets downscaled to the cap → **≈4,784 visual tokens**.
- System/instruction prompt (schema + French-convention guidance from §2.3): **≈1,000–1,500 tokens**.
- Output (structured JSON: 1 account, ~20 transactions, confidence fields): **≈700–1,200 tokens**.
- **Total ≈ 6,300 input + 1,000 output tokens.**
- At Sonnet 5 standard pricing ($3/$15): `6300 × $3/1e6 = $0.0189` input + `1000 × $15/1e6 = $0.015` output → **≈$0.034/scan**. At intro pricing ($2/$10): **≈$0.023/scan**.

**Scenario B: 3-page PDF statement** (a PEA/compte-titres statement with a positions table plus a transaction history — the largest realistic document per D2/D33):
- Image+text tokens: ~3 pages × (≈2,000 text tokens + ≈3,000–4,784 image tokens) ≈ **15,000–23,000 tokens** for the document itself.
- System/instruction prompt: **≈1,200 tokens**.
- Output (structured JSON: 1 account, ~10 positions + ~15 transactions): **≈1,800–2,500 tokens**.
- **Total ≈ 18,000 input + 2,200 output tokens** (mid-estimate).
- At Sonnet 5 standard pricing: `18000 × $3/1e6 = $0.054` + `2200 × $15/1e6 = $0.033` → **≈$0.087/scan**. At intro pricing: **≈$0.058/scan**.

**Blended realistic per-scan cost: ≈$0.03–$0.09**, call it **$0.05 average** across a mix of simple bank-statement photos and denser multi-page investment PDFs.

### 3.3 Monthly projection for this household

Per D2, the household has an estimated **5–15 accounts/sources** requiring the scan flow (banks, PEA, compte-titres, assurance-vie, Veracash, Placement Direct — everything not already on an API per D33). Per D36, the cadence is "à la demande," typically weekly-to-monthly per account, so:

| Cadence assumption | Scans/month (10 accounts, mid-range of D2) | Cost/month @ $0.05/scan avg |
|---|---|---|
| Monthly per account (light user) | 10 | **$0.50** |
| Every 2 weeks per account (typical) | ~20 | **$1.00** |
| Weekly per account (heavy user, upper bound of D36) | ~40 | **$2.00** |

Even the stated upper bound in the task brief (30 scans/month) lands at **≈$1.50/month**, and a genuinely heavy-usage household scanning every account weekly (40/month, above the brief's estimate) is still only **≈$2/month**. Add a comfortable safety margin for re-scans (user photographs a statement poorly and retries), the occasional Opus 4.8 escalation for a hard document (at ~1.7x the per-token rate, an escalated scan costs ≈$0.06–$0.15 instead of $0.03–$0.09), and the one-time cost of testing during Phase 9/10 development (dozens of test scans against fixture documents) — realistically this is a **single-digit-dollars-per-month** feature, likely **under $3/month** in steady state for two users.

### 3.4 Budget verdict (D3)

This **does not create a new budget conflict** the way Powens did. The critical structural difference: Powens' problem (D31, never resolved) was that production pricing was **sales-gated** — no public self-serve rate existed at all, forcing an indefinite sandbox-only holding pattern. Claude API pricing is **public, metered, pay-per-call, no minimum commitment, no sales conversation required** — exactly what D34 anticipated ("Coût : à l'appel (pas d'abonnement, pas de sales-gating comme Powens)"). At the volumes in D2/D36, the monthly cost (well under $5, realistically $0.50–$2) is negligible next to the $99/year Apple Developer cost already accepted for D25, and comfortably fits "minimal/free" in spirit even though it is not literally $0 — same category as accepting a `~€20/mo` EODHD upgrade would have been for stock prices (`asset-price-apis.md`), i.e. a real but trivial recurring cost, not a blocker requiring a user decision the way Powens/Apple Dev did. No new conflict item is needed in DISCOVERY.md for this.

---

## 4. Expo Upload Flow

### 4.1 Client-side capture (`expo-image-picker` + `expo-document-picker`)

Both packages are standard in the Expo managed workflow already assumed by D5, and both ship a **config plugin** for `app.json`/`app.config.js` — no bare/prebuild step needed, but native permission strings (camera, photo library) only take effect on the **next native build** (EAS Build), not via OTA update. This matters for the D25 dev-build cadence (7-day-expiring free Apple dev builds) — plan the permission-plugin config early so it's baked into builds from the start rather than requiring a rebuild mid-testing.

- **Camera capture**: `ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: false })`. Avoid `allowsEditing: true`'s forced-crop UI for statements — the whole page needs to stay in frame, and forced aspect-ratio cropping risks cutting off a transaction table's edge. Set `quality` high (0.8–0.9) rather than the more aggressive compression some apps use for speed — per §2.1's image-quality guidance, over-compression measurably hurts small-text legibility, and a statement is exactly the kind of dense-small-text image where that matters.
- **Photo library**: `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] })` for a screenshot or an already-saved photo of a statement.
- **PDF**: `DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true })` — this is the path for a PDF downloaded from the user's online banking portal, which per D33/D34 is likely to be the *higher-accuracy* path (clean digital PDF vs. a photo) and should probably be the app's suggested default where the source bank offers PDF statement downloads.
- Both APIs return a local file URI (`file://...` or a content URI on Android) plus size/mime metadata — no base64 needed at this stage; defer encoding to the upload step.

### 4.2 Client → Supabase Storage → Edge Function (not base64-direct-to-function)

Two architectural options were compared:

1. **Base64-direct-to-Edge-Function**: client reads the file, base64-encodes it, POSTs the base64 blob straight to the Edge Function body, which forwards it to Claude.
2. **Storage-first (recommended)**: client uploads the raw file to a private Supabase Storage bucket using the `supabase-js` client directly from the React Native app, then invokes the Edge Function with only the **storage object path** as the payload; the Edge Function downloads the file server-side with the service-role key, base64-encodes it there, and calls the Claude API.

**Storage-first wins for this feature specifically, for three compounding reasons:**
- **D37 already requires persisting the source document** in Supabase Storage regardless of the extraction flow — so the upload has to happen either way. Storage-first just means it happens *before* extraction instead of after, which is strictly better (the document is safely stored even if extraction subsequently fails).
- **Edge Functions (Deno-based) have real payload-size and memory ceilings**, and a base64-encoded PDF is ~33% larger than the raw file — a 3-page statement PDF that's a few MB on disk becomes a meaningfully larger request body once base64-encoded, and multi-page investment statements can run larger than simple bank statements. Keeping the Edge Function invocation payload to a small JSON object (bucket + path) avoids bumping into these ceilings as document sizes vary, and avoids ever needing to special-case "this one statement was too big for the direct-upload path."
- **Client-side Supabase Storage upload is a native, well-supported `supabase-js` call** (`supabase.storage.from(bucket).upload(path, file)`), gets Storage's own resumable-upload handling for larger files "for free," and keeps the Edge Function itself simple and stateless (download → call Claude → return structured result → client writes to Storage-referencing `source_document_path` on the resulting DB rows).

**Bucket/path design** (aligns with D37's "bucket privé par foyer, RLS identique au modèle household"): `statements/{household_id}/{account_id}/{uuid}.{ext}`, private bucket, RLS policy scoped by `is_household_member(household_id)` exactly as D37 specifies for other household-scoped tables — reuse that existing predicate rather than inventing a new one.

**Sequence**:
1. Client picks image/PDF (§4.1).
2. Client uploads to `statements/{household_id}/{account_id}/{uuid}.{ext}` via `supabase.storage.from('statements').upload(...)`.
3. Client invokes the extraction Edge Function with `{ storage_path, account_id, household_id }` (small JSON body — no file bytes over this hop).
4. Edge Function: `supabase.storage.from('statements').download(storage_path)` using the service-role key → base64-encode → call `client.messages.create()` with the `output_config.format` JSON schema from §2.2 → return the structured extraction result (not yet saved to any transactions/positions table).
5. Client renders the D35 correction screen using the returned JSON alongside the stored document (fetch a signed URL for the same storage object to display it next to the extracted fields).
6. On user confirmation, client writes the corrected data to the real `transactions`/`positions`/`accounts` tables, with `source_document_path` referencing the Storage object from step 2 — satisfying D37's "permettre à l'utilisateur de revenir corriger une extraction a posteriori."

This flow also cleanly supports D38's "échec d'extraction" notification trigger: if step 4's Claude call errors or returns `extraction_confidence.overall: "low"` with major `issues`, the document is still safely in Storage (step 2 already succeeded), so the failure path is "tell the user extraction didn't work, offer retry/manual entry" rather than "the upload itself failed."

---

## 5. Deduplication Approach (D35)

### 5.1 The problem

A new statement's date range commonly overlaps the previous one — e.g. scanning a bank statement on the 1st of every month, where the statement itself covers "last 30 days" and thus re-includes the final few days already captured in the prior scan. Without deduplication, every re-scan would re-insert those overlapping transactions, inflating spending totals and breaking the D20/D21 rolling-average anomaly detection.

### 5.2 Matching heuristic (practical, from transaction-reconciliation and financial-matching prior art)

Three signals, combined rather than used individually, because no single signal is reliable alone on bank-statement data (amounts collide constantly — many transactions share a round amount like a subscription; dates alone group everything from the same day; labels alone can vary slightly between two statements covering the same real-world transaction due to how the bank truncates/formats the printed label differently across export runs):

| Signal | Match rule | Why not stricter / looser |
|---|---|---|
| **Date** | Exact match preferred; accept ±3 days as still-comparable | Some banks post/settle a transaction 1–2 days after the statement date shown, and statement-boundary transactions can shift by a day or two between two exports of "the same" period — but going much wider than a few days risks false-positives against unrelated same-amount transactions later in the month |
| **Amount** | Exact match (±0.01€ tolerance for float/rounding artifacts) | Amount is the highest-signal field but is *not sufficient alone* — recurring charges (rent, subscriptions) legitimately repeat the exact same amount monthly, which is precisely the kind of transaction most likely to appear in two overlapping scans as *both* a real duplicate *and* a real new occurrence a month later, so amount must be paired with date proximity to disambiguate "same transaction, re-scanned" from "recurring transaction, next month's instance" |
| **Merchant/label** | Normalize (lowercase, strip diacritics/extra whitespace, strip trailing bank-added reference numbers) then fuzzy-match — trigram similarity (Postgres `pg_trgm`, easy to run directly in a Supabase/Postgres query) or Levenshtein-ratio, threshold ≈0.85 | Labels for the *same* real transaction can differ slightly between two statement exports (e.g. a card-terminal reference suffix that increments, or the bank reformatting merchant names between paper/PDF export cycles) — exact string match is too brittle, but pure Levenshtein with no threshold floor risks matching unrelated but similarly-named merchants (e.g. two different "Carrefour" locations) |

**Confidence tiering for the correction screen (D35's explicit requirement: "signalées pour éviter les doublons")**:
- **High confidence ("probable duplicate," auto-flagged with a pre-checked "skip this row" toggle the user can still override)**: date exact or ±1 day, amount exact, label similarity ≥0.85.
- **Medium confidence ("possible duplicate," shown as a soft warning banner but not pre-selected for skipping)**: date within ±3 days, amount exact, label similarity between 0.6–0.85 — or date exact/±1, amount exact, label similarity below 0.6 (same amount+date, different-looking label — worth a human glance, not worth auto-hiding).
- **Below that**: don't flag at all. A wide net that flags most transactions as "possible duplicates" trains the user to ignore the warning entirely (alert fatigue) — better to under-flag slightly and rely on the user's own visual scan of the correction screen (which they're already doing per D35) than to erode trust in the flag.

### 5.3 Implementation shape

This is a **query-time check inside the Edge Function or a follow-up query before rendering the correction screen**, not something the vision-LLM extraction call itself needs to know about — keep concerns separated: the Claude API call's job (§2) is purely "read this document accurately," and deduplication is a **separate, deterministic, auditable step** run against the household's existing `transactions` table for the same `account_id`, filtered to the statement's date range ± a few days' buffer (from `statement_period` in the extraction schema, §2.2). This keeps dedup logic testable and debuggable independent of the LLM call, and avoids asking the vision model to reason about data it doesn't have access to (the existing transaction history) in the same pass.

Practically: after extraction returns, before showing the correction screen, run one Postgres query per newly-extracted transaction (or a single batched query) against existing `transactions` rows for that `account_id` within `[statement_period.start_date - 3 days, statement_period.end_date + 3 days]`, compute the amount/date/label match tier per §5.2 (label similarity via `pg_trgm`'s `similarity()` function, which is simple to enable on a Postgres/Supabase database and avoids needing a separate fuzzy-matching library), and attach a `dedup_status: "none" | "possible" | "probable"` field to each row the correction screen renders.

---

## 6. Pitfalls

- **Don't trust the model's own currency conversion.** If a statement is not natively EUR, either decline to auto-convert (store the foreign-currency amount + flag for manual EUR entry) or convert using the household's existing FX pipeline (Frankfurter, per `asset-price-apis.md`) rather than trusting whatever exchange rate the vision model assumes — it has no live rate data and may be extrapolating from training data.
- **Don't skip the confidence self-report to save prompt complexity.** It's the cheapest lever available (zero extra API calls, just extra schema fields) for making the correction screen usable on a 20+ row statement instead of forcing the user to re-verify every single field uniformly.
- **Don't let `output_config.format` and `citations` conflict silently derail the design** — they're mutually exclusive (400 error if combined). Decide up front (recommendation: skip citations for v1, per §2.2) rather than discovering the conflict mid-implementation.
- **Don't use Haiku 4.5 to save money on this feature.** The cost difference between Haiku and Sonnet 5 at this volume (§3) is cents per month — not worth trading away high-resolution vision support (§2.1) for, given financial-accuracy stakes.
- **Don't send raw base64 file bytes as the Edge Function's request body for PDFs/large photos** — upload to Storage first (§4.2); this is both a size-limit mitigation and a D37-compliance requirement, not just a nice-to-have.
- **Don't treat a "high" `extraction_confidence.overall` self-report as a reason to relax D35's mandatory correction screen.** The self-reported confidence is a *prioritization* signal for the correction UI (what to surface first), never a *gate* that lets an extraction skip human review — D35 draws no such exception, and neither should the implementation.
- **Don't over-widen the deduplication date window** past a few days "just to be safe" — recurring same-amount transactions (subscriptions, rent) will start colliding with their own next month's instance, producing false-positive dedup flags that train the user to distrust the feature.

---

## 7. References

- Claude Vision docs (live, fetched 2026-07-13): `https://platform.claude.com/docs/en/build-with-claude/vision.md`
- Claude PDF support docs (live, fetched 2026-07-13): `https://platform.claude.com/docs/en/build-with-claude/pdf-support.md`
- Claude structured outputs / `output_config.format` (referenced via bundled skill documentation, cross-checked against the tool-use concepts reference): `https://platform.claude.com/docs/en/build-with-claude/structured-outputs`
- Claude API pricing, current as of 2026-07-13 (official page 404'd on direct fetch at research time; cross-verified via independent trackers against the cached skill pricing table, all consistent): [Pricing - Claude Platform Docs](https://platform.claude.com/docs/en/about-claude/pricing), [Anthropic Claude API Pricing In 2026 — CloudZero](https://www.cloudzero.com/blog/claude-api-pricing/), [Claude API Pricing (July 2026) — BenchLM.ai](https://benchlm.ai/blog/posts/claude-api-pricing)
- Expo ImagePicker docs: [ImagePicker - Expo Documentation](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- Expo DocumentPicker / file-picker comparison: [React Native File & Image Picker with Expo — Medium](https://medium.com/@YAGNIK09/react-native-file-image-picker-with-expo-documentpicker-imagepicker-camera-2b3699b3db99), [expo-document-picker vs react-native-document-picker — npm-compare](https://npm-compare.com/expo-document-picker,react-native-document-picker,react-native-fs,react-native-image-picker)
- Supabase Storage + Edge Functions integration pattern: [Integrating with Supabase Storage](https://supabase.com/docs/guides/functions/storage-caching), [Edge Functions Architecture](https://supabase.com/docs/guides/functions/architecture), [Image Manipulation - Edge Functions](https://supabase.com/docs/guides/functions/examples/image-manipulation)
- Financial document extraction failure modes (French/European number formats, LLM-as-OCR limitations): [Stop Writing Bank Statement Parsers — Use LLMs Instead](https://medium.com/@mahmudulhoque/stop-writing-bank-statement-parsers-use-llms-instead-50902360a604), [Bank Statement Extraction API — Holofin](https://holofin.ai/solutions/bank-statement-extraction/), [LLMs for Structured Data Extraction from PDFs in 2026 — Unstract](https://unstract.com/blog/comparing-approaches-for-using-llms-for-structured-data-extraction-from-pdfs/)
- Expense/receipt OCR + correction-UX prior art: [Dext Receipt Bank](https://dext.com/us/receipt-bank), [Top Receipt OCR Tools: 2026 Comparison](https://www.suparse.com/blog/top-receipt-ocr-tools-2026-comparison), [Dext Reviews 2026 — G2](https://www.g2.com/products/dext/reviews), [Expensify vs Dext — Fondo](https://fondo.com/blog/expensify-vs-dext)
- Transaction deduplication / fuzzy matching prior art: [Transaction Matching Algorithms Explained — Zera Books](https://www.zerabooks.com/blog/transaction-matching-algorithms-explained), [Fuzzy matching in financial reconciliation — ReconArt](https://www.reconart.com/blog/fuzzy-matching-in-financial-reconciliation/), [Fuzzy Matching Algorithms in Bank Reconciliation — Optimus](https://optimus.tech/blog/fuzzy-matching-algorithms-in-bank-reconciliation-when-exact-match-fails/)
- Internal: `.claude/orchestration-wealth-tracker/DISCOVERY.md` (D2, D3, D33-D38), `.claude/orchestration-wealth-tracker/research/asset-price-apis.md` (FX/pricing-provider pattern and budget-verdict framing reused here), `.claude/orchestration-wealth-tracker/research/powens-integration-implementation.md` (superseded, referenced only for the budget-conflict contrast in §3.4)
