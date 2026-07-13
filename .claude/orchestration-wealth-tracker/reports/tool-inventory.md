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

## Blocage Playwright (à ce jour)

Le serveur MCP Playwright pointait par défaut sur un canal "chrome" (Google Chrome) absent de cet environnement, qui ne fournit que Chromium pré-installé (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Correction déjà appliquée à la configuration (`claude mcp add playwright -- npx -y @playwright/mcp@latest --browser=chromium --executable-path=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, confirmé "Connected" par `claude mcp list`), mais la session en cours reste attachée à l'ancien process tant qu'elle n'a pas redémarré/reconnecté — comportement déjà observé une fois dans cette session pour l'ajout initial de Playwright. Reprise automatique dès que la reconnexion a lieu.

## Prochaine étape dès Playwright disponible

1. Créer le projet Supabase (région EU par défaut, D8) → récupérer URL + anon key + service role key → `.env`
2. Appliquer les migrations (`supabase/migrations/`) au projet créé
3. Créer une clé API Anthropic (console.anthropic.com) → `.env` (`ANTHROPIC_API_KEY`)
4. Créer une clé Twelve Data → `.env`
5. Créer une clé Etherscan → `.env`
6. `eas init` pour lier le projet Expo/EAS (nécessite un compte Expo — création autonome ou existant)
