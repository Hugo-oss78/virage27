# Research: MCP/CLI Tooling for Autonomous Dev — MHTL Wealth

Scope: what MCP servers, CLIs, and dev/test tools let an autonomous coding agent (Claude Code) build, test, and deploy this React Native/Expo + Supabase app (Powens aggregator, Binance/Veracash/Placement Direct/Ledger assets, deployed via TestFlight/APK sideload per D24/D25) with minimal human intervention. Researched July 2026.

---

## 1. Summary

Recommended toolchain for the agent driving this project end-to-end:

- **Supabase**: use the **official remote Supabase MCP server** (`https://mcp.supabase.com/mcp`) for schema/migration work, SQL queries, Edge Function deploys, and log/advisor inspection — but be aware its default auth path is an **interactive OAuth browser flow**, which does not work headless. For unattended/CI use, pass a **Personal Access Token (PAT)** as an `Authorization` header instead. For actual local development loop (fast iteration, no network dependency, safe sandbox with fake data per D28), the agent should mainly drive the **Supabase CLI** (`supabase start`, `supabase db reset`, `supabase functions deploy`) directly via Bash — the MCP server is a convenience/discovery layer on top, not a replacement for the CLI.
- **Expo/EAS**: there is now an **official Expo MCP server** (`docs.expo.dev/mcp/`) that gives an agent build/workflow/log tools, but the actual build+submit actions are still just as easily (and more transparently) driven via the plain **EAS CLI** (`eas build`, `eas submit`, `eas workflow:run`) through Bash, authenticated with an `EXPO_TOKEN` — no interactive login needed. Recommendation: install the CLI as the primary path; add the MCP server as an optional accelerant for log-reading/debugging, not a hard dependency.
- **Powens**: **no MCP server exists** (official or community). The agent should call the Powens REST API directly (`https://{domain}.biapi.pro/2.0/...`) via `fetch`/`curl` from Node scripts or Supabase Edge Functions, using `client_id`/`client_secret` issued from the Powens Console sandbox domain. This matches D7/D28 (sandbox-only during dev). The **Connect webview** (used for linking a bank/broker account) is a hosted web UI meant for an end user's browser — it is not meaningfully scriptable via REST alone. This is the one place a **browser-automation MCP (Playwright)** would help an agent exercise the sandbox connection flow end-to-end without a human — see §3 below for the important caveat that **no playwright MCP is currently attached to this research session**.
- **Testing**: **Maestro** is the clear recommendation over Detox for an agent-driven workflow — plain YAML flows, no native test-runner build step, runs against a compiled dev-client/build the same way a user would (black-box, accessibility-layer), and integrates directly into **EAS Workflows** for CI. Detox requires native test-target configuration that is harder for an agent to author and debug blind (no simulator to watch).
- **CI/CD**: **EAS Workflows** (`.eas/workflows/*.yml`, Expo-hosted) is now the more turnkey option for triggering builds/E2E-Maestro-tests/submits from GitHub events, and is a better fit for a solo/no-infra project (D9) than hand-rolled GitHub Actions. GitHub Actions + `expo-github-action`/`eas build --non-interactive` remains a fine fallback if the user wants the pipeline visible in the GitHub Actions tab instead of the EAS dashboard.

---

## 2. MCP Servers to Install

### 2.1 Supabase MCP server (official)

- Repo: [supabase-community/supabase-mcp](https://github.com/supabase-community/supabase-mcp) · Docs: [supabase.com/docs/guides/ai-tools/mcp](https://supabase.com/docs/guides/ai-tools/mcp)
- **Transport**: remote HTTP (`https://mcp.supabase.com/mcp`); a stdio/npx variant (`@supabase/mcp-server-supabase`) also exists but multiple 2026 reports (see [anthropics/claude-code#21368](https://github.com/anthropics/claude-code/issues/21368)) note it can silently "connect" in Claude Code without actually exposing tools — **prefer the remote HTTP transport**.
- **Install command**:
  ```
  claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<project-ref>&read_only=true"
  ```
  Drop `read_only=true` once the agent needs to apply migrations/write data (recommend keeping it `true` by default, and only flipping it for the specific work session that needs schema/data writes — cheap safety rail for a fintech app).
- Equivalent `.mcp.json` entry:
  ```json
  {
    "mcpServers": {
      "supabase": {
        "type": "http",
        "url": "https://mcp.supabase.com/mcp?project_ref=<project-ref>&read_only=true"
      }
    }
  }
  ```
- **Auth**: default flow is interactive OAuth (`claude mcp` → select `supabase` → "Authenticate", opens a browser). **This blocks headless/CI use.** For a fully unattended agent run, generate a Supabase **Personal Access Token** (Supabase dashboard → Account → Access Tokens) and pass it as an `Authorization: Bearer <PAT>` header on the MCP HTTP connection (supported per the 2026 CI-oriented docs updates) instead of relying on the browser OAuth dance.
- **Local dev variant**: when running `supabase start` locally, a local MCP endpoint is also exposed at `http://localhost:54321/mcp` — useful for pointing the same MCP tool surface at the local sandbox stack instead of the hosted project.
- **Capabilities exposed** (32 tools as of 2026):
  - Database: `list_tables`, `execute_sql`, `apply_migration`, `list_extensions`, `list_migrations`
  - Edge Functions: `list_edge_functions`, `get_edge_function`, `deploy_edge_function`
  - Dev/project info: `get_project_url`, `get_publishable_keys`, `generate_typescript_types`
  - Debugging: `get_logs`, `get_advisors` (security/perf recommendations)
  - Branching (Supabase's git-like DB branching): `create_branch`, `list_branches`, `delete_branch`, `merge_branch`, `reset_branch`, `rebase_branch`
  - Account/project mgmt: `list_projects`, `get_project`, `create_project`, `pause_project`, `restore_project`
  - Storage: `list_storage_buckets`, `get_storage_config`, `update_storage_config`
  - Docs: `search_docs` (searches Supabase's own knowledge base)
  - **No dedicated "manage auth users" tool set was found** beyond what's reachable via `execute_sql` against `auth.users`/`auth.identities` (or the Auth Admin API called directly) — treat direct SQL/API calls as the way to seed test households/users for the D28 sandbox mode, not a first-class MCP tool.
- **Security note**: because `execute_sql`/`apply_migration` are write-capable, keep `read_only=true` as the default project-scoped config and only grant write access transiently — this is a household financial-data app (D6, D10-D13), so guarding against a prompt-injected/errant destructive query matters more than usual.

### 2.2 Expo/EAS MCP server (official)

- Docs: `docs.expo.dev/mcp/` (fetch blocked by bot-protection during this research; corroborated via changelog + search snippets — see §6 for caveat) and [expo.dev/changelog/mcp-build-and-workflows](https://expo.dev/changelog/mcp-build-and-workflows).
- As of Feb 2026 the Expo MCP Server gained EAS Build/Workflow tools and, per [expo.dev/changelog/the-expo-mcp-server-is-now-available-on-the-free-plan](https://expo.dev/changelog/the-expo-mcp-server-is-now-available-on-the-free-plan), is available on Expo's Free plan.
- **Capabilities**: check build status, list builds, fetch build logs, trigger new builds, cancel builds, submit to stores, create/validate/trigger/inspect EAS Workflow runs, search Expo docs, dependency-install helper (`expo install` semantics), and TestFlight crash/feedback lookup tools — directly useful for D24 (TestFlight distribution) debugging.
- **Install** (community wrapper, since the official one is still primarily surfaced through Expo's own docs/plugin rather than a single canonical `claude mcp add` one-liner at time of writing):
  ```
  claude mcp add expo-dev npx -y expo-mcp-server
  ```
  with env var `EXPO_TOKEN` (an Expo/EAS access token, created at expo.dev → account settings → Access Tokens) supplied via `-e EXPO_TOKEN=<token>` or the client's env config. There is also an official **Expo Claude Code plugin** (`expo@claude-plugins-official`, enabled in `.claude/settings.json`) that wires up Expo-docs MCP search without any extra install step.
- **Recommendation**: treat this MCP server as optional/nice-to-have for log-reading and build-status polling. The actual build/submit **work** is more reliably done with the raw EAS CLI in Bash (see §3.2) since that's scriptable, well-documented, and doesn't depend on a third-party MCP wrapper's freshness.

### 2.3 Powens — no MCP server; use REST directly

- No official or community Powens MCP server was found (searched GitHub, MCP directories, Powens docs). This is expected — Powens is a niche French open-banking aggregator, not a mainstream dev-tool target.
- **Agent approach**: call the Powens REST API (base `https://{domain}.biapi.pro/2.0/...`, per [docs.powens.com/api-reference](https://docs.powens.com/api-reference)) directly with `fetch`/`curl`/Node's `https` from Edge Functions or a one-off Node script. This is straightforward JSON-over-HTTPS — no SDK is required, and D7/D28 already call for sandbox-only use during development.
- **Sandbox setup** (relevant for Phase 4/5 config, not just tooling): create a **Sandbox domain** in Powens Console ([docs.powens.com/console-webview](https://docs.powens.com/console-webview/console/introduction/set-up-your-powens-console-account)), auto-suffixed `-sandbox.biapi.pro`, capped at **50 connections** — plenty for solo/household dev. Then create a client application to get `client_id`/`client_secret`. Supplying both `client_id` and `client_secret` on a token request yields a **permanent token**; omitting them yields a token that expires in 30 minutes — the agent should use the permanent-token path for scripted/unattended sandbox testing.
- **The one non-scriptable piece**: the **Connect webview** ([docs.powens.com/api-reference/overview/webview](https://docs.powens.com/api-reference/overview/webview)) is where a user picks their bank/broker and enters credentials/consent — it's a hosted web flow, not a JSON endpoint. An agent cannot "curl" its way through choosing a demo bank and typing sandbox credentials.

---

## 3. Browser Automation for Powens Sandbox (Playwright MCP)

- **Important finding**: this research session does **not** have a Playwright (or any browser-automation) MCP server attached — it was searched for in the deferred-tool index and not found. Do not assume it is available in the actual build/execution session without checking there too (`claude mcp list` or the deferred-tool search at execution time).
- **If/when a Playwright MCP is available**, it would be the right tool for the one non-API piece of Powens integration: driving the Connect webview through Powens' documented **demo connector** (a fake bank used specifically for sandbox testing, with known fixed test credentials) to create/refresh sandbox connections end-to-end without a human watching a browser. This directly supports D28 (sandbox-first testing).
- **Install** (official Microsoft Playwright MCP, if not already present):
  ```
  claude mcp add playwright npx -y @playwright/mcp@latest
  ```
- **Scope note**: this is a small, bounded use case (driving one hosted OAuth-like consent webview with fixed demo credentials) — not a general web-scraping need. Most of the Powens integration work (fetching accounts, transactions, balances, categorization) stays plain REST calls; Playwright/browser automation is only for the webview hop.

---

## 4. CLI Tools to Install

### 4.1 Supabase CLI

- Install: `npm install -g supabase` (or `brew install supabase/tap/supabase`).
- Core commands for the agent's local dev loop (per D9, D28 — solo project, sandbox-first):
  - `supabase init` — scaffold `supabase/` config + migrations folder.
  - `supabase start` — boots the full local stack (Postgres, Auth, Realtime, Storage, Edge Functions runtime, Studio) in Docker; first run pulls images.
  - `supabase db reset` — recreates the local Postgres container and re-applies all migrations in `supabase/migrations/` (the agent's go-to command after editing a migration file, matching a git-like "reset to migrations-as-source-of-truth" workflow).
  - `supabase migration new <name>` — scaffold a new timestamped migration file.
  - `supabase functions deploy <name>` — deploy an Edge Function (e.g., the nightly Powens sync job per D27, or a Binance/CoinGecko price-refresh function) to the hosted project.
  - `supabase functions serve` — run Edge Functions locally for iteration before deploy.
  - `supabase gen types typescript --local > types/database.ts` — keep the app's TS types in sync with the schema, a good habit for an agent to run after every migration.
  - `supabase db push` / `supabase db diff` — sync local migrations to the remote hosted project, or diff local vs remote schema.
- These are the commands that actually do the schema/DB work; the Supabase MCP server's `apply_migration`/`execute_sql` tools are a convenience overlay for when the agent is mid-conversation and doesn't want to shell out, but for anything scripted/repeatable (e.g., a CI step), raw CLI in Bash is more transparent and debuggable.

### 4.2 EAS CLI (Expo)

- Install: `npm install -g eas-cli` (or `npx eas-cli`, avoids global install drift).
- Core commands:
  - `eas login` / non-interactive auth via `EXPO_TOKEN` env var (generate at expo.dev account settings) — **required for any unattended/CI use**, since `eas build` otherwise expects an interactive session.
  - `eas build --platform ios|android|all --profile development|preview|production --non-interactive` — cloud-compiled binaries; `development` profile produces a dev client (installable via cable/Xcode or as a build artifact, matching D25's "gratuit / dev client" approach before a paid Apple account is needed).
  - `eas submit --platform ios|android --latest` — submit a finished build to TestFlight/Play Console (only relevant once/if D25's "paid Apple Developer account" threshold is crossed; for now Android APKs are just sideloaded, no `eas submit` needed there).
  - `eas build:configure` — scaffold `eas.json` build profiles.
  - `eas workflow:run <file>.yml` — manually trigger an EAS Workflow (see §6).
  - `eas update` — publish an OTA JS update to a build's channel without a full native rebuild (useful once the dev-client is installed and the agent is iterating on JS-only changes).
  - `expo start` / `expo start --dev-client` — local Metro bundler for iterating against an installed dev client; not itself part of CI, but the day-to-day loop the agent uses while writing features.
- **No MCP wrapper is required for correctness** — raw CLI via Bash is sufficient and arguably preferable for an agent because build/submit output (logs, build IDs, URLs) is plain text easily captured and reasoned about. The optional Expo MCP server (§2.2) mainly adds convenience for cross-referencing build status without shelling out.

### 4.3 Maestro CLI

- Install: `curl -Ls "https://get.maestro.mobile.dev" | bash` (adds `maestro` to PATH); requires Java (bundled/handled by the installer script).
- Core commands:
  - `maestro test flows/<flow>.yaml` — run a single flow against a running simulator/emulator or a connected device.
  - `maestro studio` — interactive flow-recording tool (human-in-the-loop only, not for the agent).
  - `maestro test --format junit flows/ -e ...` — run a directory of flows with machine-readable (JUnit XML) output, which is exactly what an agent needs to parse pass/fail without a human watching a screen.
- Flows are plain YAML, e.g.:
  ```yaml
  appId: com.mhtl.wealth
  ---
  - launchApp
  - tapOn: "Se connecter"
  - inputText: "test@mhtl.local"
  - tapOn: "Mot de passe"
  - inputText: "sandbox-password"
  - tapOn: "Continuer"
  - assertVisible: "Patrimoine total"
  ```
  This is easy for an agent to author/edit directly (it's just text) and to run headlessly against an iOS Simulator/Android emulator booted in CI or in a local dev container.

### 4.4 Simulators/emulators for local + CI runs

- iOS Simulator (`xcrun simctl`) and Android emulator (`avdmanager`/`emulator` from Android cmdline-tools) are still needed as the actual runtime target for Maestro — Maestro drives them, it doesn't replace them. On EAS Workflows / EAS-hosted CI this is handled for you (see §6); if running GitHub Actions on `macos-latest` runners, boot iOS Simulator via `xcrun simctl boot` and Android emulator via the `reactivecircus/android-emulator-runner` action.

---

## 5. Testing Tool Recommendation: Maestro over Detox

| | Maestro | Detox |
|---|---|---|
| Test authoring | Plain YAML, readable/writable by an agent as pure text | JS/TS test files calling a native-bridge API — heavier to author correctly without running it interactively first |
| Setup | Binary + YAML, no native build-target config | Requires native test-target wiring (Xcode scheme, Android test APK) — easy to get subtly wrong, hard for an agent to debug "blind" |
| What it tests | Compiled binary via accessibility layer — closest to what a real user (the household's two users) experiences | Gray-box, talks to JS runtime directly — faster but tests something slightly more synthetic |
| CI fit | First-class support in **EAS Workflows** (`.eas/workflows/e2e-tests.yml` examples in Expo docs); trivial GitHub Actions integration too | Needs more CI scaffolding (simulator boot, build-for-testing step, artifact wiring) |
| Machine-readable output for an unattended agent | `--format junit` gives clean pass/fail the agent can parse without visual inspection | Also produces reports, but the extra native-config surface area is more likely to break silently |
| Flakiness (2026 industry reports) | Sub-1% in comparative benchmarks | Sub-2%, still good but Maestro edges it out |

**Recommendation**: Maestro is the better fit specifically *because* this is an agent-driven, no-human-watching-a-simulator workflow — the YAML flows are something the coding agent can write, review, and diff like any other source file, run via a single CLI command, and get an unambiguous JUnit-style pass/fail plus screenshots on failure. Detox's extra native configuration layer is the kind of thing that's easy for a human to debug interactively in Xcode/Android Studio but hard for an agent to reason about without that visual feedback loop — a bad match for D9 (solo project, minimize moving parts) and this task's "minimal human intervention" goal. Reserve Detox only if a future need arises for deep JS-runtime-level assertions Maestro's black-box model can't reach (unlikely for this app's scope: auth flow, net-worth dashboard, account linking, transaction list).

---

## 6. CI/CD Notes

- **EAS Workflows** (Expo-hosted, config in `.eas/workflows/*.yml` in the repo) is the more turnkey option for 2026: it can trigger on GitHub push/PR/label events (once the EAS project is linked to the GitHub repo) or run manually via `eas workflow:run`, and has built-in steps/examples for building, running Maestro E2E tests, and submitting — see [docs.expo.dev/eas/workflows/examples/e2e-tests/](https://docs.expo.dev/eas/workflows/examples/e2e-tests/). For a solo project (D9) this reduces the amount of pipeline YAML/infra the user has to maintain compared to hand-rolled GitHub Actions, since build machines/caching/credentials are handled by EAS.
- **GitHub Actions fallback**: use the official `expo/expo-github-action` (or plain `eas build --non-interactive` / `eas submit` steps) if the user wants pipeline visibility inside GitHub's own Actions tab rather than the EAS dashboard. Typical shape: on push to `main`, checkout → setup Node → `npm ci` → `eas build --platform all --non-interactive --profile production` authenticated via an `EXPO_TOKEN` repo secret; tag-triggered builds commonly gate `eas submit --platform all --latest` so store submission only happens on an intentional release tag, not every push.
- **Recommendation for this project**: start with EAS Workflows for build+Maestro-test automation (fewer moving parts, matches D9), and only add GitHub Actions on top if/when the user wants CI status checks visible directly on GitHub PRs (e.g., blocking merge on a failing Maestro suite) — GitHub branch protection rules only look at GitHub Actions/status checks, not EAS's own dashboard, so that's the trigger for adding the GH Actions layer.
- **Secrets needed in CI regardless of which runner**: `EXPO_TOKEN` (EAS auth), Supabase `SUPABASE_ACCESS_TOKEN`/`SUPABASE_DB_PASSWORD` (for `supabase db push` in CI, if that's part of the pipeline), and Powens sandbox `client_id`/`client_secret` if any CI step exercises the Powens API (should stay sandbox-only per D28, never the user's real Powens production credentials).

---

## 7. Consolidated Tool List

**MCP servers to add:**
```
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<project-ref>&read_only=true"
claude mcp add expo-dev npx -y expo-mcp-server        # optional, needs EXPO_TOKEN
claude mcp add playwright npx -y @playwright/mcp@latest   # optional, only for Powens sandbox webview automation
```

**CLIs to install:**
```
npm install -g supabase eas-cli
curl -Ls "https://get.maestro.mobile.dev" | bash
```

**Direct-HTTP integrations (no CLI/MCP needed):** Powens REST API, CoinGecko/Twelve Data/Frankfurter/gold-api.com (per D3) — plain `fetch` from Edge Functions.

---

## 8. Caveats / Confidence Notes

- Several primary-source doc pages (`supabase.com/docs/guides/ai-tools/mcp`, `docs.expo.dev/mcp/`, `docs.expo.dev/agents/claude/`, `docs.powens.com/...`, `docs.maestro.dev/...`) returned HTTP 403 to this session's fetch tooling (bot-protection on those doc sites, not a content issue). All facts above were cross-verified through at least one successfully-fetched source (GitHub READMEs, changelog pages, and multiple independent search-result summaries) rather than relying on a single blocked page's cached snippet. If a future session can reach these doc pages directly, it's worth a quick re-verification pass on the exact `claude mcp add` one-liners for the Expo MCP server, since that ecosystem (unlike Supabase's) does not yet have one single canonical hosted-HTTP endpoint the way `mcp.supabase.com` does — the community npx-based wrapper (`expo-mcp-server`) documented in §2.2 was the most consistent option found, but Expo's own first-party MCP offering appears to be evolving quickly (new tools added as recently as Feb 2026).
- Whether a Playwright/browser-automation MCP is available for the actual build/execution agent (as opposed to this research session) should be re-checked at that time — it was absent here.

---

## References

- [Supabase MCP Server docs](https://supabase.com/docs/guides/ai-tools/mcp)
- [supabase-community/supabase-mcp GitHub](https://github.com/supabase-community/supabase-mcp)
- [Supabase is now an official Claude connector](https://supabase.com/blog/supabase-is-now-an-official-claude-connector)
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- [Supabase MCP auth issue discussion](https://github.com/orgs/supabase/discussions/39266)
- [claude-code issue: Supabase MCP ignores stdio config](https://github.com/anthropics/claude-code/issues/21368)
- [Supabase Local Development & CLI](https://supabase.com/docs/guides/local-development)
- [Supabase CLI GitHub](https://github.com/supabase/cli)
- [Expo MCP changelog: EAS Build and Workflows tools](https://expo.dev/changelog/mcp-build-and-workflows)
- [Expo MCP now on Free plan](https://expo.dev/changelog/the-expo-mcp-server-is-now-available-on-the-free-plan)
- [Claude Code and Expo](https://docs.expo.dev/agents/claude/)
- [CaullenOmdahl/expo-mcp-server GitHub](https://github.com/CaullenOmdahl/expo-mcp-server)
- [EAS CLI reference](https://docs.expo.dev/eas/cli/)
- [expo/eas-cli GitHub](https://github.com/expo/eas-cli)
- [Trigger builds from CI](https://docs.expo.dev/build/building-on-ci/)
- [expo/expo-github-action GitHub](https://github.com/expo/expo-github-action)
- [Introduction to EAS Workflows](https://docs.expo.dev/eas/workflows/introduction/)
- [EAS Workflows E2E test example (Maestro)](https://docs.expo.dev/eas/workflows/examples/e2e-tests/)
- [Powens API Reference](https://docs.powens.com/api-reference)
- [Powens Webview API reference](https://docs.powens.com/api-reference/overview/webview)
- [Powens Quick Start](https://docs.powens.com/documentation/integration-guides/quick-start)
- [Powens Console setup](https://docs.powens.com/console-webview/console/introduction/set-up-your-powens-console-account)
- [Maestro docs — React Native support](https://docs.maestro.dev/get-started/supported-platform/react-native)
- [Maestro: Detox vs Maestro, reducing flakiness](https://maestro.dev/insights/detox-vs-maestro-reducing-flakiness-react-native)
- [Drizz: Detox vs Appium vs Maestro 2026](https://www.drizz.dev/post/detox-vs-appium-vs-maestro-which-mobile-testing-framework-in-2026)
- [Codersera: Maestro vs Appium vs Detox 2026](https://codersera.com/blog/maestro-vs-appium-vs-detox-2026/)
- [Playwright MCP GitHub (Microsoft)](https://github.com/microsoft/playwright-mcp)
