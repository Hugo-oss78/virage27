# Recherche (implémentation) — Intégration Powens pour MHTL Wealth

> Deuxième vague de recherche, orientée implémentation concrète. Complète `open-banking-aggregation.md` (choix du fournisseur, comparatif) avec les détails d'onboarding, de flow technique, de sandbox, d'endpoints et de coût réel nécessaires pour écrire les tâches d'implémentation (Phase 9+). Décisions d'autorité : D3 (budget minimal/gratuit), D7 (Powens choisi), D8 (Supabase EU par défaut, pas de contrainte bloquante), D25 (comptes développeur — mêmes contraintes de coût), D28 (sandbox obligatoire avant vraies données).

> **Limite méthodologique à signaler** : l'outil de fetch direct de page (`WebFetch`) a été systématiquement bloqué (HTTP 403 — protection anti-bot Cloudflare probable) sur tout le domaine `docs.powens.com`, y compris via un proxy de lecture alternatif. Toute la matière ci-dessous provient donc de résultats de recherche web (extraits indexés/résumés des pages officielles Powens), pas d'une lecture ligne à ligne de la documentation. Les extraits sont cohérents et convergents entre plusieurs requêtes, mais **avant l'implémentation réelle, un développeur doit ouvrir chaque page citée en Références directement dans un navigateur** (Cloudflare ne bloque a priori pas les navigateurs humains) pour valider les détails exacts de schéma de requête/réponse, noms de champs exacts, et exemples de code.

---

## Résumé

Powens s'intègre via un **compte Console** (auto-inscription gratuite) qui génère un **domaine sandbox** (`xxx-sandbox.biapi.pro`, limité à 50 connexions) et une **application cliente** avec `client_id` / `client_secret`. Le flow de connexion bancaire est un **Webview hébergé par Powens** : l'app ouvre une URL Connect générée à partir du domaine + client_id, l'utilisateur s'authentifie et consent sur l'interface Powens (jamais dans l'app MHTL), puis Powens redirige vers un `redirect_uri` (deep link `mhtlwealth://callback` recommandé pour React Native/Expo) avec soit un code temporaire à échanger contre un token utilisateur permanent, soit directement un état de succès selon la configuration. Le sandbox fournit une **"Demo Institution"** avec des connecteurs de test qui retournent des données fictives pour Bank/Wealth/Bill sans nécessiter de vrais identifiants bancaires — exactement ce qu'exige D28. Le pricing production reste **entièrement sur devis, aucune grille publique**, ce qui est un **conflit direct non résolu avec D3** ("budget minimal/gratuit") : il n'existe aucune confirmation qu'un plan de production Powens gratuit ou à très bas coût existe pour un usage familial à faible volume — ce point doit être négocié explicitement avec un commercial Powens avant tout passage en production, et reste un item ouvert (cf. Pricing Reality Check ci-dessous, déjà signalé en item 4 du DISCOVERY).

---

## Onboarding Steps

1. **Créer un compte Console Powens** : inscription self-service sur `https://console.powens.com/auth/register` (email + mot de passe). Un email de vérification est envoyé ; cliquer sur le lien confirme le compte et permet de se connecter à la Console.
2. **Créer une organisation** : à la première connexion, renseigner quelques informations sur "l'entreprise" (organisation) — pour MHTL, utiliser un nom de projet personnel type "MHTL Wealth" (aucune preuve trouvée que Powens exige un SIRET/statut d'entreprise réel dès le stade sandbox ; à vérifier au moment de l'inscription — si un champ obligatoire bloque une personne physique, c'est un point à signaler comme friction potentielle pour un projet familial non-commercial).
3. **Créer un domaine (workspace)** : bouton "+" dans la Console → choisir un nom de domaine. Le domaine est automatiquement créé en configuration **sandbox**, suffixé `-sandbox.biapi.pro` (ex. `mhtlwealth-sandbox.biapi.pro`), **limité à 50 connexions**. C'est largement suffisant pour un foyer de 2 personnes avec ~5-15 comptes/connexions (D3 use case).
4. **Créer une application cliente** : dans le domaine, onglet "Applications" → "+ ADD AN APPLICATION" → nommer l'app (ex. "MHTL Wealth Mobile") et renseigner une URL (probablement l'URL de callback ou un site vitrine placeholder — à confirmer en pratique). Sauvegarder.
5. **Récupérer `client_id` et `client_secret`** : générés automatiquement à la création de l'application, ce sont les identifiants de base pour tout appel API et pour la génération de l'URL Webview. **Ces secrets doivent rester exclusivement côté backend (Supabase Edge Function), jamais embarqués dans le bundle React Native/Expo** — cohérent avec la recommandation déjà actée dans `open-banking-aggregation.md` §4.5.
6. **Configurer le Webview** (Console → section Webview) : personnalisation visuelle (WYSIWYG mentionné dans la doc — logo/couleurs MHTL possibles), et surtout configuration du/des `redirect_uri` autorisé(s) — c'est ici qu'il faut déclarer le deep link de l'app (ex. `mhtlwealth://connect-callback`) comme URI de redirection valide.
7. **Sandbox vs production — séparation d'environnement** : le domaine sandbox (`-sandbox.biapi.pro`) est distinct d'un domaine de production. Le passage en production nécessite un processus commercial (vérification KYB probable, devis, activation d'un domaine de prod séparé) — non documenté publiquement en détail, à initier via contact commercial une fois l'app validée en sandbox (conforme D28 : rester en sandbox le plus longtemps possible).
8. **Configurer les webhooks** (optionnel mais recommandé) : dans la Console, déclarer une URL de webhook (endpoint Supabase Edge Function) pour recevoir les événements `CONNECTION_SYNCED`, `ACCOUNT_UPDATED`, etc. (voir section Key Endpoints).

---

## API/Auth Flow Detail

### Modèle d'authentification à deux niveaux

- **Client credentials (app-level)** : grant type `client_credentials`, avec `client_id` + `client_secret` → génère un **service token** à portée limitée, expirant après **30 minutes**, non associé à un utilisateur, utilisé pour des opérations "plateforme" (ex. lister les connecteurs disponibles).
- **User token (permanent)** : après le flow Webview, un **code temporaire** scopé à un utilisateur est retourné dans le callback. Ce code est échangé côté backend contre un **access token utilisateur** ; si `client_id` **et** `client_secret` sont fournis dans cet échange, le token généré est **permanent** (sinon token temporaire/anonyme). C'est ce token permanent par utilisateur qui doit être stocké côté Supabase (chiffré) pour tous les appels API ultérieurs (liste des comptes, transactions, resync).
- Un utilisateur peut être créé automatiquement ("utilisateur anonyme") si aucun `code` n'est fourni au lancement du Webview — dans ce cas Powens crée l'utilisateur puis ajoute la connexion, et retourne le code scopé à ce nouvel utilisateur via le callback de succès.
- Un endpoint dédié permet d'**invalider un token permanent** (déconnexion complète d'un utilisateur côté Powens) — utile pour un flow de suppression de compte/déconnexion RGPD.

### Flow Webview pour React Native/Expo

1. **Backend (Edge Function Supabase)** génère l'URL Webview Connect en construisant l'URL sur le domaine sandbox/production avec `client_id`, un `redirect_uri` (le deep link MHTL), et optionnellement un paramètre `state` opaque pour faire le lien avec la session utilisateur MHTL côté backend (identifier quel `household_id`/quel membre initie la connexion).
2. **App mobile** ouvre cette URL — deux options techniques, cohérentes avec ce qui est déjà noté dans `open-banking-aggregation.md` :
   - `react-native-webview` (WebView in-app) — le plus simple à implémenter avec Expo (`react-native-webview` est compatible Expo managed workflow via `expo install react-native-webview`).
   - **Recommandé pour la compatibilité app-to-app** : ouvrir un onglet navigateur système (Expo `expo-web-browser` → `WebBrowser.openAuthSessionAsync()`), qui utilise SFSafariViewController sur iOS / Chrome Custom Tabs sur Android. Ce choix est important pour la SCA bancaire réelle : de nombreuses banques françaises redirigent vers **leur propre app bancaire installée** (deep link banque→banque) pendant l'étape 3DS/SCA, ce qui fonctionne de façon beaucoup plus fiable depuis un vrai navigateur/onglet système que depuis une WebView embarquée (limitations connues de redirection de WebView vers des apps tierces sur iOS notamment). `expo-web-browser` avec `openAuthSessionAsync` est spécifiquement conçu pour ce pattern OAuth-with-redirect et gère nativement l'écoute du retour vers le deep link de l'app.
3. **Redirection finale** : Powens redirige le navigateur/webview vers le `redirect_uri` configuré, ex. `mhtlwealth://connect-callback?code=xxx&state=yyy` (deep link custom scheme) ou un universal link `https://mhtlwealth.app/connect-callback`. Pour Expo, configurer le scheme custom dans `app.json` (`"scheme": "mhtlwealth"`) et gérer la réception via `Linking` / le retour de `openAuthSessionAsync` (qui résout automatiquement une Promise avec l'URL de résultat, évitant d'avoir à gérer manuellement un listener `Linking.addEventListener` séparé — plus robuste).
4. **Backend échange le code** contre le token utilisateur permanent (endpoint d'échange de code, avec `client_id`+`client_secret`), stocke le token chiffré associé à l'utilisateur/`household_id` MHTL (jamais les identifiants bancaires — ceux-ci ne transitent jamais par MHTL), puis déclenche une synchro initiale.
5. **Point d'attention Expo managed workflow** : `openAuthSessionAsync` et les deep links custom scheme fonctionnent en dev client / build EAS ; en Expo Go classique le comportement des deep links custom peut être limité — cohérent avec le choix déjà acté (D25) d'utiliser un dev client Expo plutôt qu'Expo Go pur pour ce projet.

### États de connexion à gérer côté app

États nécessitant une action utilisateur explicite (à afficher de façon visible, synchro suspendue tant que non résolus) : `additionalInformationNeeded`, `SCARequired`, `webauthRequired`, `wrongpass`, `decoupled`. Un état `action_needed` générique existe aussi (l'utilisateur doit agir directement sur le site/l'app de la banque, ex. accepter de nouvelles CGU). Le produit MHTL doit mapper ces états Powens vers les statuts déjà définis dans DISCOVERY D26/D29 ("échec technique" vs "reconsentement expiré") et déclencher la bannière/notification correspondante.

---

## Sandbox Test Assets

- **Demo Institution** : institution factice dédiée aux démos, disponible dès la création du domaine sandbox. Retourne des **données fictives pour Bank, Wealth et Bill** (donc couvre à la fois comptes courants/épargne ET les produits patrimoniaux PEA/assurance-vie visés par D2/D19) **sans jamais déclencher d'erreur** (pas de simulation `wrongpass`, "site indisponible", etc.) — utile pour un premier flow "happy path" de bout en bout.
- **Test connector(s)** : en complément de la Demo Institution, un ou plusieurs connecteurs de test simulent des **cas d'usage réels de production** (échecs SCA, mauvais mot de passe, site bancaire indisponible, etc.) — permet de tester la gestion d'erreur/reconnexion (D26, D29) sans attendre qu'une vraie banque tombe en panne. Dans certains cas, le connecteur de test **ne demande aucun login/mot de passe** et redirige automatiquement vers une interface bancaire factice pré-remplie — pas de liste précise de "user:pass" trouvée publiquement dans les extraits indexés ; **la doc exacte (`Demo institution and test connectors`, `Validating your implementation with the test connector`) doit être ouverte directement dans un navigateur par le développeur** au moment de l'implémentation, car le contenu exact (identifiants factices, scénarios disponibles) n'a pas pu être extrait via les outils de recherche automatisés de cette session (bloqué par la protection anti-bot du site — voir note méthodologique en tête de document).
- **Limite de 50 connexions** en sandbox — largement suffisant pour développement/tests, mais à garder en tête si des tests automatisés (CI) créent/suppriment beaucoup de connexions de test sans nettoyage.
- Conforme à D4/D28 : l'app peut donc être développée et testée end-to-end (connexion, comptes, transactions, catégorisation, positions PEA/assurance-vie factices) **sans jamais toucher de vraies données bancaires**, exactement l'exigence de la Discovery.

---

## Key Endpoints

> Noms de ressources API confirmés par recherche indexée ; à valider avec les exemples de requête/réponse exacts directement dans `docs.powens.com/api-reference` (protection anti-bot empêchant l'extraction automatisée complète en session).

| Besoin fonctionnel | Endpoint / ressource API (Powens) | Notes |
|---|---|---|
| Lister les comptes connectés | `GET /users/me/accounts` (et variantes par connexion) | Retourne comptes courants, épargne, et — avec le produit **Wealth** activé — comptes-titres, assurance-vie, PER/PEE/PERCO. |
| Soldes | Champ `balance` inclus dans la ressource compte (`bank-accounts`) | Pas d'endpoint séparé identifié — le solde fait partie de l'objet compte. |
| Transactions | `GET` sur ressource **Bank transactions** (`api-reference/products/data-aggregation/bank-transactions`) | Objet transaction inclut un champ `categories` (tableau d'objets `code`/`parent_code`). |
| Catégorisation | Ressource **Categorization** (`api-reference/products/data-aggregation/categorization`) | Catégories hiérarchiques (parent/enfant) : dépenses administratives, taxes, assurance, alimentation/restaurants, loisirs, prêts, télécoms, revenus, shopping, soins personnels, etc. — à mapper vers les ~10-12 catégories UI simplifiées de D19 (table de correspondance à construire côté MHTL backend). |
| Positions investissement (PEA/assurance-vie/compte-titres) | **Investments** (`api-reference/products/wealth-aggregation/investments`) — endpoints du type `GET /users/me/accounts/{accountId}/investments` | Champs identifiés : valorisation totale, plus/moins-value absolue et relative (vs valeur précédente), ID investissement/compte, nom, code technique, devise d'origine (comptes internationaux), prix d'achat, écart prix d'achat/valorisation actuelle, performance à 1/3/5 ans, indicateur SRRI (1-7). Filtrage possible par ISIN. Couvre bien le besoin D2/D19 de détail ligne par ligne. |
| Ordres de marché | `GET /users/me/accounts/{accountId}/marketorders`, `GET /users/me/connections/{connectionId}/marketorders` | Historique d'achats/ventes — utile pour calculer un PRU/rendement précis par ligne. |
| Webview / initiation de connexion | Endpoints Webview (`api-reference/overview/webview`) | Génère l'URL de connexion hébergée à ouvrir dans le navigateur/WebView côté app. |
| Connexions (état, liste, suppression) | **Connections** (`api-reference/user-connections/connections`) | États de connexion (succès, `wrongpass`, `SCARequired`, `action_needed`, etc.) — objet central pour la logique de reconnexion/alerte D26. |
| Connecteurs disponibles | **Connectors** (`api-reference/user-connections/connectors`) | Liste des banques/institutions disponibles (pour afficher un sélecteur de banque, ou vérifier la couverture d'une banque précise du couple avant onboarding). |
| Utilisateurs | **Users** (`api-reference/user-connections/users`) | Création/gestion des utilisateurs Powens (mapper 1 utilisateur Powens ↔ 1 connexion bancaire rattachée au foyer, cf. piège "comptes joints" déjà noté dans la recherche précédente). |
| Webhooks — événements de synchro | Webhooks (`documentation/integration-guides/webhooks`) | Événements identifiés : `USER_CREATED`, `USER_DELETED`, `USER_SYNCED` (déprécié pour multi-connexions, préférer `CONNECTION_SYNCED`), `CONNECTION_SYNCED`, `CONNECTION_DELETED`, `ACCOUNT_FOUND` (comptes synchronisés, avant traitement des transactions), `ACCOUNT_UPDATED` (comptes + transactions traités). POST HTTP avec body JSON par défaut. **Important : les webhooks ne sont émis que pour les utilisateurs "permanents"** (ceux ayant un token permanent) — cohérent avec le modèle d'auth ci-dessus, donc s'assurer que l'échange de code se fait toujours avec `client_id`+`client_secret` pour bénéficier des webhooks. |

**Recommandation d'architecture de sync (reprend et précise `open-banking-aggregation.md` §4.5)** : utiliser `CONNECTION_SYNCED`/`ACCOUNT_UPDATED` comme déclencheur principal côté Edge Function pour rafraîchir la vue patrimoniale (au lieu de polling), complété par le job planifié quotidien (D27, pg_cron) qui force une resync explicite pour les connexions n'ayant pas eu d'update webhook récent (garde-fou en cas de webhook manqué), et par le pull-to-refresh manuel qui appelle directement l'API de resync.

---

## Pricing Reality Check (conflit avec D3)

- **Aucune grille tarifaire publique n'existe pour Powens**, confirmé par de multiples sources indépendantes en 2025-2026 (Capterra, GetApp, G2, sites d'avis logiciels, blog dim-mathinnov.fr) : "Powens ne communique pas de grille tarifaire publique. Les prix dépendent des volumes d'API, des services choisis et du niveau d'accompagnement. Il faut demander un devis." La page officielle `powens.com/products/pricing/` est elle-même une page "Contact us" (formulaire commercial), pas une grille de prix.
- **Aucun chiffre fiable en source primaire** n'a été trouvé pour un usage bas-volume/non-commercial (2 utilisateurs, usage familial). Les seuls chiffres circulant en ligne concernent Bridge (concurrent, ~499€/mois évoqué par des sources tierces non officielles), pas Powens — et même ce chiffre reste non confirmé.
- **Le sandbox est confirmé 100% gratuit et self-service** (inscription immédiate, pas de carte bancaire requise d'après le parcours d'inscription observé), ce qui permet de respecter D3/D28 pendant toute la phase de développement/test sans aucun coût.
- **Conflit avec D3** : le DISCOVERY (D3, item 4 de l'audit de complétude) anticipait déjà ce point comme "à reconfirmer" — cette recherche confirme qu'**il n'existe aucune option de production gratuite ou à coût public connu chez Powens**. Le passage en production (connexion aux vraies banques du foyer) impliquera nécessairement une négociation commerciale, et **aucune donnée ne permet d'affirmer qu'un tarif compatible avec un budget "minimal/gratuit" existe** pour ce cas d'usage. C'est un vrai risque à traiter, pas juste un flag théorique.
- **Recommandation concrète** : traiter la bascule sandbox→production comme une **décision de projet à part entière, hors scope de la phase actuelle de développement**. Concrètement :
  1. Développer et valider entièrement l'app en sandbox (gratuit, sans limite de temps observée).
  2. Une fois l'app fonctionnelle, contacter le commercial Powens (formulaire `powens.com/products/pricing/`) en précisant explicitement : usage personnel/familial non commercial, 2 utilisateurs, ~5-15 connexions bancaires actives, pas de revente à des tiers — et demander s'il existe un tarif réduit "usage non commercial / faible volume" (rien ne l'indique publiquement, mais la question doit être posée frontalement).
  3. Si aucun tarif compatible avec un budget quasi nul n'est obtenu, **documenter ce blocage comme une décision utilisateur à trancher explicitement** (accepter un coût mensuel non nul malgré D3, ou reconsidérer Bridge/un agrégateur alternatif, ou repousser indéfiniment le passage aux vraies données bancaires et garder l'app en mode sandbox/démo permanent pour l'usage réel — option dégradée mais cohérente avec D3 si le budget reste strictement à zéro).
  4. Ne jamais supposer un coût "raisonnable" par défaut dans la planification budgétaire tant qu'un devis réel n'a pas été obtenu — cohérent avec la recommandation déjà formulée dans `open-banking-aggregation.md` §6.

---

## Implementation Recommendations

1. **Créer le compte Console + domaine sandbox dès le début de la Phase 9 (implémentation)**, avant d'écrire le moindre code d'intégration — permet de valider la couverture réelle des banques du couple (D2) et la qualité des données Wealth factices avant d'investir du temps de dev.
2. **Toutes les clés (`client_id`, `client_secret`, tokens utilisateur permanents) vivent exclusivement côté backend Supabase (Edge Functions + table chiffrée)**, jamais dans le bundle Expo/React Native — respecte à la fois la sécurité DSP2 et la contrainte "jamais d'identifiants bancaires côté app" déjà actée.
3. **Utiliser `expo-web-browser` (`WebBrowser.openAuthSessionAsync`) plutôt qu'une WebView embarquée pure** pour le flow Connect — meilleure fiabilité de redirection app-to-app pendant la SCA bancaire réelle (3DS via l'app bancaire du couple), tout en fonctionnant identiquement en sandbox pour les tests.
4. **Construire une table de mapping catégories Powens → catégories UI MHTL (D19)** dès la Phase 9, en s'appuyant sur les catégories hiérarchiques exposées par l'endpoint Categorization — ne pas attendre la Phase de test pour ce mapping, il est structurant pour le modèle de données transactions.
5. **Implémenter la réception des webhooks `CONNECTION_SYNCED`/`ACCOUNT_UPDATED`/`ACCOUNT_FOUND` comme mécanisme de sync principal**, avec le job quotidien pg_cron (D27) en filet de sécurité plutôt qu'en mécanisme primaire — réduit la charge d'appels API et respecte l'esprit "budget minimal" en évitant le polling agressif signalé comme risque dans `open-banking-aggregation.md` §5.
6. **Modéliser explicitement les états de connexion Powens dans le schéma Supabase** (`connection_status` : ok / action_needed / sca_required / wrongpass / error, avec timestamp de dernière synchro réussie) pour alimenter directement les mécanismes déjà actés D26 (notification d'échec) et D29 (dégradation gracieuse — afficher dernière valeur connue avec badge d'avertissement).
7. **Pour la reconnexion DSP2 à 180 jours** : ne pas s'appuyer sur un webhook dédié "consentement bientôt expiré" (aucun événement de ce type identifié dans la liste de webhooks Powens trouvée — seuls des événements de sync/suppression existent). À la place :
   - Stocker côté MHTL la date de dernier consentement réussi par connexion (déductible de la première synchro réussie après un flow Webview complet, ou d'un champ dédié si l'API Connections l'expose — à vérifier en sandbox).
   - Le job quotidien pg_cron (D27) calcule, pour chaque connexion, le nombre de jours écoulés depuis ce dernier consentement ; au-delà d'un seuil de sécurité (ex. 170 jours, marge avant les 180 jours réglementaires — certaines banques pouvant être plus strictes en pratique comme noté dans la recherche précédente), déclencher la notification push + bannière in-app (D26) invitant l'un des deux membres du foyer à relancer le flow Webview de reconnexion.
   - En complément, traiter tout état `SCARequired`/`wrongpass` détecté via webhook `CONNECTION_SYNCED` (si la synchro échoue pour cette raison) comme un signal immédiat de reconsentement nécessaire, sans attendre l'échéance des 180 jours calculée — les deux mécanismes (polling calendaire + détection d'échec en temps réel) sont complémentaires, pas redondants.
8. **Négocier le pricing production en parallèle du développement, pas après** (cf. Pricing Reality Check) — pour éviter de découvrir un blocage budgétaire seulement une fois l'app entièrement prête à passer en production, ce qui retarderait inutilement le calendrier du projet solo (D9).
9. **Documenter la limite sandbox de 50 connexions** dans le futur README technique du projet, pour éviter qu'un développeur (même solo) crée/détruise des connexions de test sans discipline et sature accidentellement le domaine sandbox pendant les tests manuels.

---

## References (URLs)

- Powens Console — inscription : https://console.powens.com/auth/register
- Powens Console — connexion : https://console.powens.com/
- Powens — Quick Start : https://docs.powens.com/documentation/integration-guides/quick-start
- Powens — Ajouter un premier utilisateur et une connexion : https://docs.powens.com/documentation/integration-guides/quick-start/add-a-first-user-and-connection
- Powens — API Overview : https://docs.powens.com/documentation/integration-guides/quick-start/api-overview
- Powens — Set up your Powens Console account : https://docs.powens.com/console-webview/console/introduction/set-up-your-powens-console-account
- Powens — Set up your Webview : https://docs.powens.com/console-webview/webview/set-up-your-webview
- Powens — Webview WYSIWYG : https://docs.powens.com/console-webview/console/webview-wysiwyg
- Powens — Webview (API Reference) : https://docs.powens.com/api-reference/overview/webview
- Powens — Authentication (API Reference) : https://docs.powens.com/api-reference/overview/authentication
- Powens — Errors (API Reference) : https://docs.powens.com/api-reference/overview/errors
- Powens — API design overview : https://docs.powens.com/api-reference
- Powens — Connections (API Reference) : https://docs.powens.com/api-reference/user-connections/connections
- Powens — Connectors (API Reference) : https://docs.powens.com/api-reference/user-connections/connectors
- Powens — Users (API Reference) : https://docs.powens.com/api-reference/user-connections/users
- Powens — SCA & connection states : https://docs.powens.com/documentation/integration-guides/sca-and-connection-states
- Powens — Custom connection implementation : https://docs.powens.com/documentation/integration-guides/advanced/custom-connection-implementation
- Powens — Webhooks : https://docs.powens.com/documentation/integration-guides/webhooks
- Powens — Introduction to Bank : https://docs.powens.com/documentation/integration-guides/bank/introduction-to-bank
- Powens — Bank integration guide : https://docs.powens.com/documentation/integration-guides/bank/bank-integration-guide
- Powens — Bank accounts (API Reference) : https://docs.powens.com/api-reference/products/data-aggregation/bank-accounts
- Powens — Bank transactions (API Reference) : https://docs.powens.com/api-reference/products/data-aggregation/bank-transactions
- Powens — Categorization (API Reference) : https://docs.powens.com/api-reference/products/data-aggregation/categorization
- Powens — Introduction to Transactions : https://docs.powens.com/documentation/integration-guides/transactions/introduction-to-transactions
- Powens — Wealth (guide d'intégration) : https://docs.powens.com/documentation/integration-guides/wealth
- Powens — Investments (Wealth Aggregation, API Reference) : https://docs.powens.com/api-reference/products/wealth-aggregation/investments
- Powens — Demo institution and test connectors : https://docs.powens.com/console-webview/webview/demo-institution-and-test-connectors
- Powens — Validating your implementation with the test connector : https://docs.powens.com/documentation/integration-guides/pay/validating-your-implementation-with-the-test-connector
- Powens — Demo integration : https://docs.powens.com/demo-integration
- Powens — page produit Bank : https://www.powens.com/products/bank/
- Powens — page produit Wealth (FR) : https://www.powens.com/fr/produits/wealth/
- Powens — page produit Categorize : https://www.powens.com/products/categorize/
- Powens — page Pricing (formulaire "contact us", pas de grille publique) : https://www.powens.com/products/pricing/
- Powens — blog, SCA étendue à 180 jours (FR) : https://www.powens.com/fr/blog/sca-180-jours/
- Powens — blog, SCA extended to 180 days (EN) : https://www.powens.com/blog/sca-extended-180-days/
- Powens — blog, SCA exemption > 180 days : https://www.powens.com/blog/sca-exemption-180-days-victory/
- Powens — blog, boost connection rates with Webview : https://www.powens.com/blog/boost-open-banking-connection-rates-with-powens-webview/
- Powens — nouveau cadre légal DSP2bis/DSP3 (FR) : https://www.powens.com/blog/nouveau-cadre-legislatif-des-paiements-dsp2-bis-dsp3-ou-veritable-tournant/
- Avis tiers — dim-mathinnov.fr, retours d'expérience Powens 2025 : https://www.dim-mathinnov.fr/2025/11/25/powens-avis-retours-dexperience-et-evaluation-complete-de-la-solution-open-banking-europeenne/
- Avis tiers — freelanceworld.fr, fonctionnement Powens 2026 : https://freelanceworld.fr/powens/
- Avis tiers — Capterra, Powens : https://www.capterra.com/p/247868/Powens/
- Avis tiers — GetApp, Powens (ex Budget Insight) : https://www.getapp.com/finance-accounting-software/a/budget-insight/
- Avis tiers — G2, Powens reviews : https://www.g2.com/products/powens/reviews
- Avis tiers — Appvizer, Powens (ex Budget Insight) : https://www.appvizer.fr/finance/systemes-bancaires/budget-insight
- Expo — expo-web-browser (openAuthSessionAsync) : https://docs.expo.dev/versions/latest/sdk/webbrowser/
- Expo — react-native-webview compatibilité Expo : https://docs.expo.dev/versions/latest/sdk/webview/
- Expo — Linking / deep linking : https://docs.expo.dev/guides/linking/
- Projective Group — extension délai réauthentification PSD2 à 180 jours : https://www.projectivegroup.com/psd2-alert-authentication-period-for-account-information-services-extended-to-180-days/

### Notes de fiabilité des sources

- **Toute la matière technique Powens ci-dessus provient de résultats de recherche web indexés (snippets/résumés)**, pas d'une lecture directe des pages `docs.powens.com` (bloquées en 403 par la protection anti-bot du site pour les outils de fetch automatisé utilisés dans cette session, y compris un proxy de lecture alternatif). Les informations convergent entre plusieurs requêtes indépendantes et sont cohérentes avec la première vague de recherche (`open-banking-aggregation.md`), ce qui donne un niveau de confiance raisonnable sur les **concepts et noms de ressources**, mais **les schémas exacts de requête/réponse (noms de champs JSON précis, codes d'erreur exacts, format exact des URLs Webview) doivent être revérifiés par un développeur humain ouvrant `docs.powens.com` dans un navigateur standard** avant de coder l'intégration — ce n'est pas une garantie de précision au niveau "copier-coller de la doc".
- **Aucun chiffre de pricing production Powens fiable n'a été trouvé**, en cohérence avec la première vague de recherche — ce n'est pas une lacune de cette recherche mais un fait confirmé : Powens ne publie aucune grille tarifaire, point à traiter comme un risque projet actif (cf. section Pricing Reality Check), pas comme une information manquante à rechercher davantage en ligne.
- La liste des événements webhook (`USER_CREATED`, `CONNECTION_SYNCED`, etc.) et des états de connexion (`SCARequired`, `wrongpass`, etc.) provient de snippets cohérents entre deux requêtes de recherche séparées — fiabilité correcte, mais la liste pourrait ne pas être exhaustive (d'autres événements/états existent probablement et n'ont pas remonté dans les extraits indexés).
