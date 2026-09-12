# Inventaire des outils — Phase 5a

Statut au 2026-07-13, après le pivot v2 (scan de relevés remplace Powens/DSP2 — voir DISCOVERY.md Batch 8).

| Outil | Catégorie | Action | Statut |
|---|---|---|---|
| Expo/React Native scaffold | Framework mobile | Autonome (CLI) | ✅ Fait — `App.tsx`, `app.json`, dépendances installées |
| EAS CLI | CLI | Autonome (npm) | ✅ Installé, `npx eas --version` OK |
| Supabase CLI | CLI | Autonome (npm) | ✅ Installé, `npx supabase --version` OK |
| Supabase (projet + clés) | Backend (DB/Auth/Storage/Edge Functions) | Autonome via navigateur (accord utilisateur) | ⏳ Bloqué — voir note Playwright ci-dessous |
| Compte Anthropic (clé API extraction relevés, D34) | API key | Autonome via navigateur (accord utilisateur) | ⏳ Bloqué — idem |
| Twelve Data (cours bourse/ETF) | API key | Autonome via navigateur (accord utilisateur) | ⏳ Bloqué — idem |
| Etherscan (suivi Ledger EVM) | API key | Autonome via navigateur (accord utilisateur) | ⏳ Bloqué — idem |
| CoinGecko (cours crypto) | API key | Aucune — pas de clé requise en tier gratuit | ✅ Rien à faire |
| gold-api.com (cours or) | API key | Aucune — pas de clé requise | ✅ Rien à faire |
| Frankfurter.dev (FX) | API key | Aucune — pas de clé requise | ✅ Rien à faire |
| Blockstream Esplora (BTC on-chain) | API key | Aucune — pas de clé requise | ✅ Rien à faire |
| Binance (clé API lecture seule) | API key sur compte existant | **Utilisateur** (décision D14) | ⏳ En attente de l'utilisateur |
| Expo/EAS account (`eas init`) | Compte build | Autonome via navigateur, ou CLI login | ⏳ Bloqué — idem Playwright |
| Powens | ~~Agrégateur bancaire~~ | ~~Abandonné~~ | ❌ Retiré du scope (pivot v2, D33) |

## Blocage Playwright (toujours en cours au 2026-09-12)

Le serveur MCP Playwright pointait par défaut sur un canal "chrome" (Google Chrome) absent de cet environnement, qui ne fournit que Chromium pré-installé (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Correction déjà appliquée à la configuration (`claude mcp add playwright -- npx -y @playwright/mcp@latest --browser=chromium --executable-path=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, confirmé "Connected" par `claude mcp list`), mais reconfirmé encore bloqué dans cette session (2026-09-12) : les outils `mcp__playwright__*` ne sont ni chargés ni proposés par `ToolSearch`, malgré plusieurs tentatives. Reste un blocage d'environnement, pas une régression de code — reprise automatique dès qu'une session avec Playwright effectivement connecté s'ouvre.

## Prochaine étape dès Playwright disponible

1. Créer le projet Supabase (région EU par défaut, D8) → récupérer URL + anon key + service role key → `.env`
2. Appliquer les migrations (`supabase/migrations/`) au projet créé
3. Créer une clé API Anthropic (console.anthropic.com) → `.env` (`ANTHROPIC_API_KEY`)
4. Créer une clé Twelve Data → `.env`
5. Créer une clé Etherscan → `.env`
6. `eas init` pour lier le projet Expo/EAS (nécessite un compte Expo — création autonome ou existant)

## Travail avancé en parallèle du blocage (2026-09-12)

Le blocage ne porte que sur la création de comptes tiers via navigateur — il n'empêche pas d'écrire le code qui consommera ces clés une fois disponibles. Complété pendant cette attente :

- `supabase/functions/extract-statement/index.ts` — Edge Function d'extraction de relevé (D34) : télécharge le document depuis Storage (clé service role), appelle Claude (`claude-sonnet-5`, escalade vers `claude-opus-4-8` si confiance basse) avec `output_config.format` (sortie JSON contrainte, schéma de `research/statement-scanning-extraction-implementation.md` §2.2), tague chaque transaction extraite via la nouvelle RPC de déduplication, puis enregistre le résultat sur `statement_documents` (jamais directement sur `transactions`/`positions`/`accounts` — l'écriture finale reste conditionnée à la confirmation utilisateur, D35).
- `supabase/migrations/00000000000005_statements_storage_and_dedup.sql` — bucket Storage privé `statements` (RLS scopée par foyer via `is_household_member`, même prédicat que le reste du schéma, plus la porte MFA aal2 de D10) et fonction `find_duplicate_transactions` (extension `pg_trgm`, heuristique à 3 facteurs de D35/§5.2 : date ±3j, montant exact, similarité de libellé).
- Ce code est écrit et cohérent avec la recherche, mais **non testé en conditions réelles** — aucun projet Supabase ni clé Anthropic n'existe encore pour l'exécuter. Rien de plus ne peut être vérifié tant que l'étape 1-3 ci-dessus reste bloquée.
