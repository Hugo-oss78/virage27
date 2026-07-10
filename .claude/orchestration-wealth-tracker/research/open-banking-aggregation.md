# Recherche — Agrégation bancaire / Open Banking (DSP2) pour MHTL Wealth

> Périmètre : fournisseurs d'agrégation de comptes utilisables depuis une app mobile (React Native/Expo probable) pour un utilisateur français, couvrant comptes bancaires, épargne, et si possible produits d'investissement (PEA, compte-titres, assurance-vie). L'or physique et les cryptos/exchanges sont hors périmètre de cette note (saisie manuelle / APIs de cours dédiées, cf. recherche séparée).

## 1. Résumé

Pour une app de patrimoine "à la Finary" ciblant un utilisateur français, le choix se réduit en pratique à deux acteurs français leaders — **Powens** (ex-Budget Insight) et **Bridge** (ex-Bankin' for Business) — complétés éventuellement par des acteurs paneuropéens (**Plaid**, **Tink**, **Salt Edge**) si une expansion hors France est envisagée. **Finary utilise Powens comme agrégateur unique** (source : étude de cas Powens/Finary), ce qui en fait la référence la plus directement comparable au projet MHTL. Powens et Bridge sont tous deux agréés ACPR (AISP/PISP), conformes DSP2, et disposent d'un produit spécifique pour les comptes-titres/PEA/assurance-vie (Powens "Wealth", Bridge "Multistep"/agrégation enrichie) — contrairement à Plaid dont la couverture France/investissement est plus limitée, et à Tink/Salt Edge qui sont solides mais moins "France-first".

Aucun des cinq fournisseurs n'affiche de grille tarifaire publique complète : tous fonctionnent sur devis ("contactez-nous"), avec un sandbox gratuit en self-service. Les intégrations mobiles se font via un **webview/redirect hébergé par le fournisseur** (flow OAuth2/PSD2 SCA), pas via un SDK natif "credentials-in-app" — ce qui est structurant pour l'architecture React Native (utilisation d'un composant WebView / navigateur in-app plutôt que des champs de saisie custom).

Recommandation : démarrer en sandbox avec **Powens** (couverture la plus large, produit Wealth mature pour PEA/assurance-vie/compte-titres, cas d'usage Finary directement transposable), avec **Bridge** comme second choix / fallback évalué en parallèle (racheté par BPCE, positionnement "développeur-friendly", bonne couverture banques françaises, agrégation également enrichie côté épargne/assurance-vie).

## 2. Fournisseurs — Fiches détaillées

### 2.1 Powens (ex-Budget Insight)

- **Positionnement** : fintech française (Paris, fondée 2012), ~130 employés, actionnariat Crédit Mutuel Arkéa (depuis 2019) + PSG Equity (2024). Plus de 230 entreprises clientes (banques, fintechs, assureurs, cabinets comptables), dont **Finary**.
- **Statut réglementaire** : Powens SAS, établissement de paiement agréé ACPR (CIB 16948), autorisations AISP/PISP, licence DSP2 + EME. Les clients déjà régulés peuvent utiliser le mode "marque blanche" avec leur propre licence ; les non-régulés s'appuient sur la licence Powens.
- **Couverture** : plus de **1 800 banques dans 12+ pays européens** ; plus de 200 banques et plateformes d'investissement, ~250 Md€ d'actifs synchronisés, portefeuilles de 2,5M+ particuliers. Fiabilité annoncée 99,95% de disponibilité.
- **Produits pertinents** :
  - **Bank** : agrégation comptes courants/épargne (soldes, transactions, catégorisation).
  - **Wealth** (ex "API Wealth") : agrégation de comptes-titres, **assurance-vie**, **PEA**, PER/PEE/PERCO, portefeuilles crypto exposés via plateformes, avec détail actif par actif (ISIN, quantité, valorisation, historique de performance, transactions d'achat/vente/frais). C'est le produit directement utile pour la section "investissements" de MHTL Wealth.
  - **Pay** (initiation de paiement) — hors scope v1 (app en lecture seule).
- **Flow d'authentification** : **Connect Webview** — un ensemble d'endpoints web hébergés par Powens que l'app ouvre dans un navigateur/webview ; l'utilisateur choisit sa banque, saisit ses identifiants et donne son consentement (RGPD) directement sur l'interface Powens, puis est redirigé vers un `redirect_uri` avec un code temporaire à échanger côté backend. Ce n'est **pas** un SDK "credentials-in-app" — MHTL n'a jamais accès aux identifiants bancaires de l'utilisateur, ce qui simplifie la conformité DSP2/RGPD mais impose d'intégrer un composant WebView (React Native `react-native-webview`, ou onglet navigateur système via Chrome Custom Tabs/SFSafariViewController pour un meilleur support "app-to-app" — recommandé par Powens pour maximiser la compatibilité avec les apps bancaires qui redirigent vers leur propre app installée plutôt qu'un navigateur classique).
- **Modèle de synchronisation** : les connexions (`connections`) portent un état (`state`) reflétant la synchro (succès, erreur SCA, identifiants invalides, etc.) — l'intégrateur doit gérer ces états et guider l'utilisateur pour une reconnexion en cas d'échec. Rafraîchissement déclenché à la demande via API ou automatique côté Powens ; webhooks disponibles pour être notifié des mises à jour (plutôt que du polling pur).
- **SDK / outils dev** : API REST documentée (docs.powens.com), pas de SDK React Native officiel dédié trouvé — intégration via appels REST + webview standard. Environnement **sandbox gratuit en self-service** avec un "demo institution" et des connecteurs de test pour valider le flow sans vraie banque.
- **Pricing** : non public, sur devis ("pricing customisé selon les besoins"). Sandbox gratuit. Pas de "starter pack" documenté publiquement.
- **Cas d'usage confirmé** : Finary combine les produits **Bank** et **Wealth** de Powens pour sa vue patrimoniale consolidée ; données chiffrées AES-256 au repos, TLS 1.3 en transit côté Finary. Un fil de discussion sur le forum communautaire Finary ("Stratégie — Dépendance à Powens — agrégateurs et fiabilité des synchros") indique que la dépendance à un agrégateur unique (Powens) est un point de vigilance identifié par les utilisateurs eux-mêmes concernant la fiabilité des synchronisations — un signal à prendre en compte pour la stratégie de résilience de MHTL (cf. section Pièges).

### 2.2 Bridge (ex-Bankin' for Business / bridgeapi.io)

> Attention : ne pas confondre avec **bridge.xyz**, une société américaine de paiements stablecoin/crypto sans rapport, qui remonte fréquemment dans les résultats de recherche sous le nom "Bridge". Le fournisseur pertinent ici est **bridgeapi.io**, la marque B2B de Bankin'.

- **Positionnement** : lancé par Bankin' (application française de gestion de budget grand public) sous la marque Bridge pour son offre B2B. Racheté/investi par **BPCE** (2022), intégré à l'écosystème paiement du groupe (PayPlug, Dalenys, Xpollens, Bridge). Plus de 200 clients B2B (banques, ERPs, éditeurs de logiciels de compta).
- **Statut réglementaire** : première fintech européenne à avoir obtenu l'agrément ACPR pour les services d'information sur les comptes et d'initiation de paiement (AISP/PISP), pionnier open banking français depuis 2011.
- **Couverture** : ~350 établissements financiers français, britanniques, espagnols et allemands (chiffre variable selon les sources : 82 à 350+ institutions rapportées) ; couvre comptes courants/joints, épargne, crédits, **assurance-vie**, comptes-titres (agrégation "enrichie").
- **Produits pertinents** : agrégation de comptes (Bridge Aggregation), authentification bancaire automatique, catégorisation automatique des flux (>98% de précision annoncée), rapprochement bancaire, et des offres d'agrégation enrichie couvrant l'épargne/l'assurance-vie pour les cas d'usage patrimoniaux — comparable en ambition à Powens Wealth mais moins documenté publiquement en détail (ISIN, historique de performance par ligne, etc. à valider en sandbox).
- **Flow d'authentification** : flow web/redirect équivalent à Powens (webview hébergé par Bridge, consentement DSP2, redirection avec code). Pas de détails publics fins sur un SDK React Native dédié — l'intégration mobile suit le même patron générique "ouvrir une WebView vers l'URL Bridge Connect".
- **Sandbox** : disponible ("Bridge Connect" testable en sandbox avec des connecteurs de test), accès en s'inscrivant sur le portail développeur.
- **Pricing** : non public non plus ; sources tierces peu fiables évoquent un ordre de grandeur "à partir de ~499 €/mois" pour un abonnement B2B ou des tarifs "par utilisateur/mois" (quelques euros/mois/utilisateur actif) — **à vérifier directement avec Bridge**, ces chiffres ne sont pas confirmés par une source primaire.

### 2.3 Plaid (référence internationale, coverage EU/France)

- Leader mondial (US), forte présence UK/Europe (~2 000 institutions financières européennes revendiquées, couverture directe). Lancé en France en beta dès 2019 (avec Espagne, Irlande), disponibilité "90%+ de couverture consommateurs/entreprises, souvent >99%".
- Statut : licence e-money/PSD2 en Europe (Plaid Financial Ltd, agréé au Royaume-Uni/Irlande selon les entités).
- **Pour la France spécifiquement**, la couverture et la profondeur produit (notamment sur les produits d'investissement type PEA/assurance-vie, très spécifiques au marché français) sont **nettement moins matures que Powens ou Bridge** — Plaid est surtout pertinent pour du "checking/savings" basique ou pour une app visant une audience internationale. Peu de retours d'expérience French fintech utilisant Plaid comme agrégateur principal pour ce type de cas d'usage patrimonial.
- SDK : Plaid Link, disponible en React Native (`react-native-plaid-link-sdk`), très bien documenté — c'est objectivement le SDK mobile le plus mature du marché si la couverture France suffit.
- Pricing : sales-gated, mais Plaid a une politique de pricing plus transparente aux US/UK (par produit : Balance, Transactions, Identity...) que la plupart des concurrents ; en zone Euro le pricing reste sur devis.

### 2.4 Tink (Visa)

- Racheté par Visa en 2022 (1,8 Md€). Couverture large : 3 400+ banques dans 18 marchés européens, France incluse. Licence AISP/PISP dans la plupart des marchés UE.
- Produits : Account Check, Account Aggregation, Income Check, Risk Insights, Money Manager, Payments — API REST OAuth unifiée (api.tink.com).
- Pricing 100% sales-led, aucun tarif public, pas de free tier documenté (essai possible sur demande commerciale).
- Pertinence France : bonne couverture bancaire généraliste, mais comme Plaid, moins spécifiquement orientée "patrimoine à la française" (PEA/assurance-vie) que Powens/Bridge dans la documentation publique disponible.

### 2.5 Salt Edge

- Plateforme AISP paneuropéenne, ISO 27001, conforme DSP2, connecte tous types de comptes y compris **investment/saving/loan/mortgage accounts**. A initialement déployé ses API PSD2 aux Pays-Bas et en France avant extension à l'EEE.
- 60+ sandboxes PSD2 publiés (bon niveau de testabilité).
- Pricing : usage-based (au volume d'appels API), pas de tier gratuit permanent identifié, devis personnalisé pour besoins spécifiques.
- Moins présent dans l'écosystème "fintech patrimoine française" que Powens/Bridge dans les recherches — probablement un second choix technique correct mais avec moins de retours d'expérience locaux.

## 3. Tableau comparatif

| Critère | **Powens** (ex-Budget Insight) | **Bridge** (bridgeapi.io) | **Plaid** | **Tink** (Visa) | **Salt Edge** |
|---|---|---|---|---|---|
| Origine / actionnariat | France — Crédit Mutuel Arkéa + PSG Equity | France — groupe BPCE | USA | Suède — racheté par Visa | Moldavie/UK (paneuropéen) |
| Agrément | ACPR AISP/PISP, licence DSP2+EME | ACPR AISP/PISP (1er agréé DSP2 en Europe) | Licence EU (UK/Irlande selon entité) | AISP/PISP dans la plupart des marchés UE | AISP, ISO 27001 |
| Couverture banques FR | Très large (1800+ banques EU / 200+ banques+plateformes investissement) | ~350 établissements FR/UK/ES/DE (chiffres variables selon sources) | Correcte mais moins profonde sur produits FR spécifiques | Large (3400+ banques EU, FR incluse) | Correcte, présence FR dès le lancement PSD2 |
| PEA / assurance-vie / compte-titres | **Oui — produit "Wealth" dédié**, détail par ligne (ISIN, quantité, valorisation, historique) | Oui — agrégation enrichie épargne/assurance-vie annoncée, détail public plus limité | Limité / peu documenté pour la France | Non spécifiquement documenté pour produits FR | Oui (investment accounts génériques), granularité FR à valider |
| Crypto (exchanges via plateforme) | Oui, via agrégation de plateformes exposant crypto | Non documenté publiquement | Non | Non | Non documenté |
| Sandbox | Gratuit, self-service, connecteurs de démo | Disponible, inscription développeur requise | Oui, très mature | Sur demande | 60+ sandboxes PSD2 publiés |
| SDK mobile (React Native) | Pas de SDK RN officiel — webview générique (`react-native-webview` + Chrome Custom Tabs/SFSafariViewController recommandé) | Pas de SDK RN officiel identifié — même patron webview | **Plaid Link** — SDK RN officiel mature | Flows d'auth prêts à l'emploi, intégration webview/redirect | Webview/redirect standard PSD2 |
| Flow d'auth | Webview hébergé (OAuth-like), redirect_uri + code | Webview hébergé (Bridge Connect), redirect | Plaid Link (webview/SDK natif hybride) | OAuth REST, flows d'auth prêts | Webview/redirect PSD2 |
| Webhooks | Oui (états de connexion) | Oui (mentionné pour Bridge en général dans l'écosystème) | Oui | Oui | Oui |
| Pricing public | Non — sur devis | Non — sur devis (chiffres tiers non fiables ~499€/mois évoqués) | Non en zone euro — sur devis | Non — 100% sales-led | Non — usage-based, sur devis |
| Cas d'usage patrimoine FR connu | **Finary** (Bank + Wealth) | Bankin' (produit grand public historique du même groupe) | Aucun cas patrimoine FR notable trouvé | Aucun cas patrimoine FR notable trouvé | Aucun cas patrimoine FR notable trouvé |
| Fiabilité annoncée | 99,95% disponibilité (mais un fil communautaire Finary évoque des soucis de fiabilité de synchro perçus par les utilisateurs) | Non chiffré publiquement | Haute (marché mature US/UK) | Haute | Non chiffré publiquement |

## 4. Approche recommandée

1. **Choisir Powens comme agrégateur principal.** C'est le seul fournisseur avec un cas d'usage documenté et directement comparable (Finary), un produit Wealth mature pour PEA/assurance-vie/compte-titres — exactement le périmètre du §7.1/7.2 du PRD — et un sandbox gratuit permettant de valider rapidement en Discovery/Phase 3 avant tout engagement commercial.
2. **Ouvrir un compte sandbox Powens dès la phase de Discovery** pour valider concrètement : (a) quelles banques françaises précises de l'utilisateur et de son épouse sont couvertes, (b) la qualité réelle des données Wealth (PEA/assurance-vie) via les connecteurs de démo, (c) l'ergonomie du flow webview en conditions React Native/Expo.
3. **Garder Bridge en option de secours / comparaison**, notamment si Powens s'avère trop cher en production ou si la couverture d'une banque spécifique de l'utilisateur est meilleure côté Bridge — les deux sont interchangeables dans l'architecture (même patron webview + backend qui échange le code contre un token et interroge l'API REST du fournisseur).
4. **Ne pas retenir Plaid/Tink/Salt Edge en v1** : leur valeur ajoutée (couverture internationale) ne correspond pas au besoin (couple français, banques françaises), et leur documentation publique sur les produits patrimoniaux français (PEA, assurance-vie) est nettement plus faible. À reconsidérer seulement si le produit doit un jour couvrir des comptes hors zone euro.
5. **Architecture d'intégration mobile** :
   - Backend MHTL détient les credentials API (client_id/secret) du fournisseur ; jamais exposés côté app mobile.
   - App React Native ouvre une **WebView** (ou idéalement un onglet navigateur système via Chrome Custom Tabs / SFSafariViewController pour bénéficier du meilleur support "deep link vers l'app bancaire installée" lors du 3DS/SCA) pointant vers l'URL Connect générée par le backend.
   - Après consentement utilisateur, le fournisseur redirige vers un `redirect_uri` (deep link `mhtlwealth://callback` ou universal link) avec un code temporaire.
   - Le backend échange ce code contre les données de connexion, stocke uniquement l'identifiant de connexion (jamais les identifiants bancaires — ils ne transitent jamais par MHTL, c'est le fournisseur qui les gère), et déclenche une synchro initiale.
   - Rafraîchissement : privilégier les **webhooks** du fournisseur (notification "nouvelle synchro disponible" / "connexion en erreur") plutôt que du polling agressif, complété par un rafraîchissement manuel "pull-to-refresh" côté app et une synchro planifiée (ex. quotidienne) en tâche de fond backend.
   - Couche de **normalisation** : les deux comptes rattachés au foyer (mari/femme) doivent être mappés vers un modèle de données unique côté MHTL (compte, catégorie d'actif, solde, historique) indépendant du fournisseur sous-jacent — permet de changer de fournisseur ou d'en ajouter un second sans casser le reste de l'app (cf. §6 pièges — éviter le lock-in total).

## 5. Pièges identifiés (DSP2 / architecture / coûts)

- **Durée de revalidation SCA : 90 jours n'est plus la règle.** Le délai initial de 90 jours pour le renouvellement de l'authentification forte (SCA) côté PSU a été **porté à 180 jours depuis le 25 juillet 2023** via le règlement délégué UE 2022/2360. Il faut donc prévoir une reconnexion/re-consentement utilisateur au moins tous les 180 jours (et non 90) pour chaque connexion bancaire — mais certaines banques appliquent encore des politiques plus strictes en pratique, donc le produit doit gérer un état de connexion "expirée" par compte et guider l'utilisateur (le mari OU la femme, l'un des deux suffisant) vers une reconnexion en un tap.
- **Webview obligatoire, pas de saisie de mot de passe bancaire dans l'app.** Aucun des fournisseurs étudiés ne propose de flow "SDK natif avec formulaire de login in-app" pour la France — c'est un webview/redirect hébergé par le fournisseur (conforme DSP2, exigé réglementairement pour ne jamais exposer les identifiants bancaires à un tiers non bancaire). Impact produit : l'UX de connexion bancaire n'est pas 100% "brandée MHTL", il faut le prévoir dans les maquettes (écran de transition + webview).
- **Sandbox ≠ production : coûts et process d'onboarding distincts.** Le sandbox est gratuit et en self-service chez Powens et Bridge, mais le passage en production nécessite généralement un process de vérification KYB (Know Your Business) et une négociation commerciale — à anticiper dans le planning (ne pas supposer qu'on peut "juste passer en prod" le jour du lancement).
- **Pricing opaque, à négocier tôt.** Aucun des cinq fournisseurs n'a de grille tarifaire publique fiable pour un cas d'usage B2C bas-volume comme MHTL (2 utilisateurs, foyer unique). Il faut engager une conversation commerciale dès la Discovery pour connaître : coût minimum mensuel, coût par connexion active, et si un "plan développeur solo/petit volume" existe (certains agrégateurs ont des grilles différentes pour un usage perso/interne vs SaaS commercial — à clarifier explicitement puisque MHTL est un usage familial, pas un produit vendu à des tiers).
- **Dépendance à un agrégateur unique.** Un fil de discussion communautaire Finary pointe explicitement le risque de dépendance à un agrégateur unique (Powens) pour la fiabilité des synchronisations. Pour MHTL, dont l'usage est plus restreint (un seul foyer, un nombre de comptes limité et connu à l'avance), ce risque est moindre mais reste à surveiller — prévoir un mécanisme de fallback manuel (saisie/màj manuelle d'un solde) si une connexion reste en erreur au-delà d'un délai donné, pour ne jamais bloquer complètement la vue patrimoniale.
- **Rate limits / quotas non documentés publiquement.** Aucun fournisseur ne publie de limites précises (requêtes/minute, requêtes/jour) en dehors d'un accord commercial — à faire préciser explicitement lors de la négociation, en particulier parce que MHTL veut un rafraîchissement automatique (deux utilisateurs pouvant chacun déclencher un refresh manuel sur les mêmes comptes → risque de doubler les appels).
- **Confusion de nommage "Bridge".** Le fournisseur français pertinent est `bridgeapi.io` (Bankin'/BPCE). Il existe une société américaine sans rapport nommée **bridge.xyz** (paiements stablecoin) et un outil générique "BridgeAPI.store" (marketplace d'API) qui remontent dans les recherches — à ne pas confondre lors de toute recherche future ou négociation commerciale.
- **Granularité investissement variable selon le fournisseur.** Le détail ligne par ligne (ISIN, quantité, PRU, historique de valorisation) nécessaire pour calculer une performance par actif (§7.2 du PRD) n'est confirmé en détail public que pour **Powens Wealth**. Pour Bridge et les autres, il faudra valider en sandbox que la donnée retournée est suffisamment fine pour calculer le rendement par ligne de PEA/assurance-vie, plutôt que de se contenter d'un solde global du contrat.
- **Comptes joints / accès partagé à 2 utilisateurs.** Aucun fournisseur n'a de notion native de "compte partagé par deux utilisateurs MHTL" — c'est un problème de modélisation côté backend MHTL, pas côté agrégateur : une seule connexion bancaire par institution doit être rattachée au foyer patrimonial partagé (pas à un utilisateur individuel), avec n'importe lequel des deux membres du couple capable de déclencher la reconnexion SCA au nom du foyer.

## 6. Implications de coût

- **Aucun coût confirmé et fiable en source primaire** pour un usage bas-volume comme MHTL (2 utilisateurs, ~5-15 comptes/connexions au total). Tous les chiffres trouvés en ligne pour Bridge (ex. "à partir de ~499€/mois") proviennent de sources tierces non officielles et doivent être vérifiés directement avec le commercial Bridge/Powens avant toute décision budgétaire.
- **Sandbox = gratuit** chez Powens (confirmé, self-service) et Bridge (accès développeur gratuit) — donc le développement et les tests peuvent démarrer sans engagement financier.
- **Production = sur devis** partout. Pour un budget prévisionnel de Discovery, prévoir une fourchette large (potentiellement de quelques dizaines à quelques centaines d'euros/mois selon le fournisseur et le mode de facturation — au forfait vs à la connexion active) tant qu'aucun devis réel n'a été obtenu.
- **Actions concrètes recommandées avant la fin de la phase Discovery** :
  1. Créer un compte développeur/sandbox Powens et Bridge (gratuit).
  2. Tester en sandbox la connexion aux banques réellement utilisées par l'utilisateur et son épouse.
  3. Demander un devis chiffré à Powens (prioritaire) et Bridge (comparaison) en précisant explicitement le cas d'usage : application familiale interne (pas de revente à des tiers), 2 utilisateurs, volume de comptes attendu, besoin PEA/assurance-vie/compte-titres.
  4. Vérifier si un "plan développeur/petit compte" à coût réduit existe pour ce type d'usage non commercial (à négocier explicitement — rien ne l'indique publiquement mais c'est une question à poser).

## 7. Références / Sources

- Bridge (bridgeapi.io) — quickstart et documentation : https://docs.bridgeapi.io/docs/quickstart
- Bridge — page DSP2 : https://www.bridgeapi.io/solutions/paiement-et-remboursement/dsp2
- Bridge — présentation société : https://www.bridgeapi.io/qui-sommes-nous
- Bridge — agrégateur de comptes DSP2 : https://www.bridgeapi.io/solutions/rapprochement-bancaire-automatise-en-continu/agregateur-de-compte
- Bridge — SCA / authentification forte : https://support.bridgeapi.io/hc/fr-fr/articles/360014016220-Qu-est-ce-que-l-authentification-forte-SCA
- Open Banking Tracker — Bridge (bridgeapi.io), banques supportées : https://www.openbankingtracker.com/api-aggregators/bridgeapi-io
- Open Banking Tracker — Bridge, alternatives : https://www.openbankingtracker.com/api-aggregators/bridgeapi-io/alternatives
- Open Banking Tracker — Budget Insight/Powens : https://www.openbankingtracker.com/budget-insight
- Open Banking Tracker — Budget Insight, banques supportées : https://www.openbankingtracker.com/api-aggregators/budget-insight
- Open Banking Tracker — Pays France : https://www.openbankingtracker.com/country/france
- Open Banking Tracker — meilleurs fournisseurs 2026 : https://www.openbankingtracker.com/blog/best-open-banking-api-providers-developers-2026
- Powens — plateforme Open Finance : https://www.powens.com/fr/
- Powens — produit Wealth : https://www.powens.com/fr/produits/wealth/
- Powens — Wealth & Loans Open Finance : https://www.powens.com/fr/produits/wealth-loans/
- Powens — solutions gestion de patrimoine : https://www.powens.com/fr/solutions/gestion-patrimoine/
- Powens — étude de cas Finary (Bank + Wealth) : https://www.powens.com/fr/customer-stories/finary/
- Powens — documentation API, Investments (Wealth Aggregation) : https://docs.powens.com/api-reference/products/wealth-aggregation/investments
- Powens — documentation Webview : https://docs.powens.com/api-reference/overview/webview
- Powens — Connections API : https://docs.powens.com/api-reference/user-connections/connections
- Powens — SCA & états de connexion : https://docs.powens.com/documentation/integration-guides/sca-and-connection-states
- Powens — quickstart, ajout premier utilisateur/connexion : https://docs.powens.com/documentation/integration-guides/quick-start/add-a-first-user-and-connection
- Powens — blog agrégation multi-sources : https://www.powens.com/fr/blog/agregation-bancaire-multi-sources/
- Community Finary — fonctionnement de Powens/Budget Insight : https://community.finary.com/t/fonctionnement-de-powens-budget-insight/8657
- Community Finary — dépendance à Powens, fiabilité des synchros : https://community.finary.com/t/strategie-dependance-a-powens-agregateurs-et-fiabilite-des-synchros/37162
- Finary — blog, choix d'un agrégateur de comptes : https://webflow.finary.com/fr/blog/finance-perso/budget/agregateur-de-compte
- Plaid — couverture institutions Europe : https://plaid.com/docs/institutions/europe/
- Plaid — lancement France/Espagne/Irlande : https://plaid.com/blog/plaid-in-france-spain-and-ireland/
- Plaid — expansion Europe : https://plaid.com/blog/plaid-europe-new-partnerships-and-country-coverage/
- Plaid — couverture globale : https://plaid.com/global/
- Open Banking Tracker — Plaid, banques supportées : https://www.openbankingtracker.com/api-aggregators/plaid
- Tink — page d'accueil / couverture : https://tink.com/
- Tink — pricing (sales-gated) : https://tink.com/pricing/
- Tink — FAQ : https://tink.com/faq/
- Open Banking Tracker — Tink, banques supportées : https://www.openbankingtracker.com/api-aggregators/tink
- Salt Edge — produit Account Information : https://www.saltedge.com/products/account_information
- Salt Edge — documentation générale : https://docs.saltedge.com/general/v5/
- Salt Edge — 60+ sandboxes PSD2 : https://blog.saltedge.com/salt-edge-60-psd2-sandboxes/
- Salt Edge — conformité PSD2 : https://www.saltedge.com/products/psd2_compliance
- Banque de France — note d'usage SCA/DSP2 (ACPR/OSMP) : https://www.banque-france.fr/system/files/2023-10/Banque%20de%20Frnace%20-%20Osmp_-_dsp2-sca_-_note_sur_les_cas_dusage.pdf
- Bridge — article authentification forte (SCA), délai 90→180 jours : https://www.bridgeapi.io/news/authentification-forte-sca-securisation-paiements
- La Finance Pour Tous — DSP2 : https://www.lafinancepourtous.com/decryptages/finance-perso/banque-et-credit/directives-europeennes-sur-les-services-de-paiement/deuxieme-directive-europeenne-sur-les-services-de-paiement-dsp2/
- CertEurope — DSP2 et authentification forte : https://www.certeurope.fr/blog/dsp2-et-authentification-forte-que-prevoit-la-directive-europeenne/
- Linxo — agrégateurs bancaires, 6 points à retenir (webhooks, DSP2) : https://linxo.com/agregateurs-bancaires/
- Linxo — solution d'agrégation bancaire : https://linxo.com/solution-aggregation-bancaire/
- BigMedia Bpifrance — mapping 2025 des acteurs français de l'open banking : https://bigmedia.bpifrance.fr/nos-actualites/mapping-2025-des-acteurs-francais-de-lopen-banking
- ADNews Galitt — BPCE investit dans Bridge : https://adnews.galitt.com/en/articles/details/bpce-investit-dans-bridge-pour-prendre-le-virage-du-virement-instantane
- dim-mathinnov.fr — avis Powens, retours d'expérience 2025 : https://www.dim-mathinnov.fr/2025/11/25/powens-avis-retours-dexperience-et-evaluation-complete-de-la-solution-open-banking-europeenne/

### Notes de fiabilité des sources

- Les chiffres de pricing Bridge (~499€/mois) proviennent d'agrégateurs d'avis tiers (komission.fr) non officiels — **à considérer comme non fiables** et à reconfirmer directement auprès de Bridge.
- Le passage du délai SCA de 90 à 180 jours (règlement délégué UE 2022/2360, applicable depuis le 25/07/2023) est corroboré par plusieurs sources indépendantes (Bridge, La Finance Pour Tous) — **information fiable**, mais il est recommandé de vérifier le comportement réel observé en sandbox/production pour les banques françaises spécifiques de l'utilisateur, certaines pouvant appliquer des politiques plus conservatrices.
- Les chiffres de couverture (nombre de banques) varient significativement d'une source à l'autre pour un même fournisseur (ex. Bridge : 82 vs 350 institutions selon la source) — ces écarts reflètent probablement des périmètres de comptage différents (comptes personnels vs pro, France seule vs multi-pays) ; à clarifier directement avec le fournisseur pour le périmètre exact "banques françaises grand public" pertinent pour MHTL.
