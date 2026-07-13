# PRD — MHTL Wealth (application de gestion de patrimoine)

## 1. Résumé

Application mobile de suivi de patrimoine personnel, inspirée de **Finary**, permettant de centraliser et suivre la performance de l'ensemble de ses avoirs : comptes bancaires, produits financiers, trading, or et cryptomonnaies. Va au-delà de Finary en ajoutant une analyse fine des **dépenses récurrentes** (dépense moyenne par catégorie). Compte **partagé en couple** (mari/femme) avec authentification par mot de passe. Marque : **MHTL Group — Family Wealth & Investments** (logo fourni — écu bleu marine et or avec monogramme "MHT" et couronne de laurier, wordmark "MHTL Group" et sous-titre "Family Wealth & Investments").

## 2. Problème

L'utilisateur souhaite une vue unifiée et à jour de son patrimoine (banque, épargne, bourse, or, crypto) avec des statistiques de performance par actif/compte, sans avoir à consulter chaque app séparément. Il veut aussi mieux comprendre ses habitudes de dépenses récurrentes (abonnements, charges, etc.) via une moyenne par catégorie. Le compte doit être utilisable à deux (couple), avec un accès égal aux mêmes données.

## 3. Utilisateurs cibles

- Utilisateur principal (le demandeur) et son épouse, partageant un seul et même compte/patrimoine familial.
- Usage personnel (pas de multi-tenant B2C large à ce stade) — mais l'architecture doit permettre plusieurs utilisateurs liés à un même foyer patrimonial.

## 4. Objectifs

1. Centraliser tous les comptes (banque, épargne, trading, or, crypto) dans une seule application mobile, alimentés par scan de relevé/capture d'écran + extraction IA (banque/épargne/trading/or/Veracash/Placement Direct) et par API automatique (crypto Binance, cours or/crypto/bourse).
2. Fournir des statistiques de performance par compte/catégorie d'actif (valorisation, évolution, rendement).
3. Suivre les dépenses récurrentes et calculer une dépense moyenne par type/catégorie de dépense.
4. Permettre un accès partagé et sécurisé à deux utilisateurs (couple) sur le même patrimoine.
5. Authentification par mot de passe (email + mot de passe au minimum).
6. Identité visuelle MHTL (logo fourni) intégrée dans l'app (splash screen, icône, écran de connexion).

## 5. Périmètre (in scope v1)

- App mobile (iOS/Android — cross-platform probable, à confirmer en Discovery).
- Alimentation des comptes multi-catégories **par scan de relevé/capture d'écran + extraction IA** (pivot v2, remplace l'agrégation Open Banking/DSP2 — voir §7.1) :
  - Comptes bancaires (comptes courants, épargne)
  - Produits financiers / investissements (assurance-vie, PEA, comptes-titres, ETF, actions, SCPI/crowdfunding type Placement Direct)
  - Trading (positions actives, PnL)
  - Or (métaux précieux, y compris Veracash — valorisation au cours du jour pour la quantité déclarée)
  - Crypto (Binance via clé API en lecture seule ; wallet Ledger via adresses publiques on-chain)
- Statistiques de performance par compte et par catégorie d'actif (valeur actuelle, évolution %, historique).
- Vue patrimoine globale consolidée (net worth total, répartition par classe d'actif).
- Suivi des dépenses récurrentes :
  - Détection/saisie des dépenses récurrentes
  - Catégorisation des dépenses
  - Calcul de la dépense moyenne par type de dépense (mensuelle/annuelle)
- Comptes utilisateurs :
  - Authentification par email + mot de passe
  - Accès partagé à deux utilisateurs (couple) sur le même patrimoine/données
- Branding MHTL (logo fourni, palette bleu marine/or à en tirer).

## 6. Hors périmètre (v1) — à confirmer en Discovery

- Version web (l'utilisateur demande explicitement "application mobile")
- Conseil financier automatisé / robo-advisor
- Plus de 2 utilisateurs par foyer patrimonial
- Paiements / virements depuis l'app (lecture seule des comptes, pas d'exécution de transactions bancaires)
- Réseau social / partage public de performance (contrairement à Finary qui a un volet communautaire)

## 7. Fonctionnalités clés

### 7.1 Alimentation des comptes — scan de relevés (pivot v2)
> **Changement d'architecture (post-Discovery/Recherche)** : l'agrégation Open Banking/DSP2 (Powens) a été écartée — son tarif de production n'est jamais public (sur devis uniquement), ce qui entre en conflit avec le budget minimal souhaité (voir DISCOVERY D3/D31 et la recherche `powens-integration-implementation.md`). À la place, méthode unique et unifiée pour **toutes** les sources bancaires/financières (y compris Veracash et Placement Direct qui n'ont de toute façon aucune API) :
- L'utilisateur (ou son épouse) prend en photo ou uploade un relevé/capture d'écran (PDF ou image) depuis son app bancaire/plateforme.
- Extraction automatique par IA (vision) des soldes, positions et transactions du document.
- Écran de validation/correction avant enregistrement (l'extraction n'est jamais appliquée silencieusement).
- Cadence : à la demande, quand l'utilisateur scanne un nouveau relevé (plus de synchro automatique quotidienne pour les comptes bancaires — voir DISCOVERY D27 révisé). La vue patrimoine affiche la date du dernier relevé pris en compte par compte.
- Crypto (Binance) et cours de l'or/crypto restent sur API automatique (pas concernés par le problème de coût Powens).

### 7.2 Statistiques de performance
- Par compte : valeur actuelle, variation (jour/semaine/mois/année/depuis origine)
- Par classe d'actif : répartition du patrimoine (camembert/graphique), performance comparée
- Vue consolidée : patrimoine net total dans le temps (courbe d'évolution)

### 7.3 Dépenses récurrentes
- Identification des dépenses récurrentes (abonnements, loyers, charges, etc.)
- Catégorisation (ex: logement, transport, abonnements, loisirs, alimentation)
- Calcul et affichage de la dépense moyenne par catégorie (mensuelle)
- Alertes/tendances si une catégorie dépasse la moyenne habituelle (à valider en Discovery)

### 7.4 Comptes & accès partagé
- Authentification email + mot de passe
- Deux profils utilisateurs liés à un même espace patrimonial partagé (le couple voit les mêmes données)
- Gestion de session sécurisée (à définir : biométrie en plus du mdp ? — question Discovery)

### 7.5 Branding
- Logo MHTL Group (écu + wordmark "MHTL Group" + sous-titre "Family Wealth & Investments") sur écran de connexion, splash screen, icône d'app
- Charte graphique dérivée du logo (bleu marine #0B1F3A-ish, or/doré, style "blason", typographie serif pour le wordmark)

## 8. Contraintes techniques connues

- Application **mobile** (React Native + Expo, voir DISCOVERY D5)
- Nécessite un backend capable d'appeler un modèle de vision (extraction de relevés/documents) — pas d'agrégateur bancaire DSP2 en v1 (pivot v2, voir §7.1)
- Nécessite des APIs de cours (or, crypto, actions/ETF)
- Sécurité renforcée requise (données financières sensibles, accès partagé à 2 personnes ; documents scannés contiennent des données bancaires sensibles à protéger au même niveau)

## 9. Risques / points d'attention

- Extraction de relevés par IA : fiabilité jamais garantie à 100%, nécessite un écran de correction systématique ; qualité dépendante de la photo/scan fourni par l'utilisateur.
- Fraîcheur des données : plus de synchro automatique quotidienne pour les comptes bancaires — le patrimoine affiché n'est à jour qu'au dernier relevé scanné, à bien communiquer dans l'UI (D27 révisé).
- Sécurité : mot de passe seul peut être jugé insuffisant pour données financières — 2FA activée (D10). Documents scannés à stocker/traiter avec le même niveau de protection que les autres données financières.
- Or physique / Veracash / Placement Direct : pas d'API, valorisation via scan de relevé comme les autres comptes (ou saisie manuelle en dernier recours).
- Crypto : Binance via clé API lecture seule ; Ledger via adresses publiques on-chain uniquement (jamais le device).
- Partage de compte à 2 : modèle de données doit distinguer "utilisateur" (identité/login) de "foyer patrimonial" (données partagées).

## 10. Métriques de succès (à affiner en Discovery)

- L'utilisateur et son épouse peuvent se connecter chacun avec leurs identifiants et voir le même patrimoine consolidé.
- Le patrimoine total et sa répartition par classe d'actif sont visibles en moins de 2 taps depuis l'ouverture de l'app.
- La dépense moyenne par catégorie est calculée automatiquement à partir des dépenses récurrentes saisies/détectées.

## 11. Prochaines étapes

1. Recherche (Phase 2) sur : agrégation bancaire/Open Banking, APIs cours or/crypto/bourse, stack mobile cross-platform, modèles de données patrimoine multi-utilisateurs, auth partagée sécurisée.
2. Questions de Discovery (Phase 3) pour trancher : stack technique précis, liste des comptes/banques à supporter, niveau de sécurité (2FA ?), détail des catégories de dépenses, design system dérivé du logo, stratégie de déploiement (App Store/Play Store), budget API.
