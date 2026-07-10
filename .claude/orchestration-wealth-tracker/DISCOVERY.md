# DISCOVERY — MHTL Wealth

Document d'autorité pour toutes les décisions de conception et d'implémentation.
Toute décision est numérotée (D1, D2, ...) pour référence croisée depuis PHASES.md et les fichiers de tâches.

---

## Batch 1 — Vision & périmètre

**D1. Plateformes cibles v1**
iOS + Android simultanément (React Native/Expo permet de livrer les deux sans effort supplémentaire majeur).

**D2. Institutions/comptes à connecter en priorité**
- Banques traditionnelles (Société Générale, BNP, Crédit Agricole...)
- Banques en ligne (Boursorama, Fortuneo, BforBank...)
- Courtiers/PEA (Boursobank, Trade Republic, DEGIRO, Bourse Direct...)
- Assurance-vie (Linxea, Yomoni, banque privée...)
- **Veracash** (plateforme d'épargne en métaux précieux — or/argent physique) — à intégrer, source spécifique à rechercher (API ou agrégateur ?)
- **Binance** (exchange crypto) — API read-only exchange
- **Placement Direct** (plateforme d'investissement — SCPI/crowdfunding immobilier probable) — à rechercher

**D3. Budget mensuel APIs tierces**
Minimal / gratuit uniquement au départ. Implication : privilégier les tiers gratuits (CoinGecko free, Twelve Data free, Frankfurter, gold-api.com) et démarrer l'agrégation bancaire avec le sandbox Powens/Bridge le plus longtemps possible ; l'abonnement production payant sera une décision ultérieure à réévaluer une fois l'app fonctionnelle.

**D4. Mode démo/sandbox**
Oui — l'app doit permettre de tester avec des données fictives avant de connecter les vrais comptes bancaires.

---

## Batch 2 — Stack technique

**D5. Stack mobile**
React Native + Expo (managed workflow, EAS Build).

**D6. Backend**
Supabase (Postgres + Auth + Row Level Security).

**D7. Agrégateur bancaire**
Powens (choix principal — utilisé par Finary, meilleure couverture PEA/assurance-vie/PER). Bridge non retenu comme fallback prioritaire mais reste une option de secours si Powens pose problème en sandbox.

**D8. Hébergement**
Pas de contrainte stricte d'hébergement UE — Supabase région EU reste le choix par défaut (latence, cohérence avec Powens qui est un acteur français) mais ce n'est pas un impératif réglementaire bloquant pour ce projet à usage personnel/familial.

**D9. Maintenance**
Projet solo — pas d'équipe technique MHTL Group derrière, donc privilégier simplicité opérationnelle (peu de pièces mobiles à maintenir, documentation claire) plutôt que des patterns pensés pour une équipe.

---

## Batch 3 — Sécurité

**D10. 2FA**
Obligatoire dès la v1 (TOTP, type Google Authenticator/Authy) pour les deux comptes du foyer, en plus du mot de passe.

**D11. Biométrie**
Login complet (mot de passe + 2FA) à la première connexion / après expiration de session, puis déverrouillage rapide par Face ID/empreinte pour les sessions suivantes (couche de confort, pas un remplacement de l'auth).

**D12. Récupération d'accès**
Le partenaire (l'autre membre du foyer) peut aider à débloquer/valider la récupération d'accès de l'autre, en plus (pas à la place) du flux standard de reset par email. Implication data model : le rôle "owner"/"member" du foyer doit permettre à un membre d'initier une action de récupération assistée pour l'autre membre du même `household_id`.

**D13. Audit log**
Non nécessaire — usage familial de confiance, pas de journal de modifications visible pour la v1.

---

## Batch 4 — Actifs (crypto, or, devises)

**D14. Binance**
Clé API en lecture seule Binance (jamais de scope trading/withdraw) pour lire soldes et positions.

**D15. Wallets crypto self-custody**
Oui — l'utilisateur a un **Ledger** (hardware wallet). Il faut suivre les adresses on-chain associées (via une API type Covalent/Moralis/Alchemy en lecture seule par adresse publique — pas de connexion au device Ledger lui-même, juste suivi de solde par adresse). À approfondir en Phase 4 : quelles chaînes/adresses précises sont sur ce Ledger (BTC, ETH, autres ?) — question à reposer à l'utilisateur au moment de la config (Phase 5) puisque ça dépend des adresses réelles.

**D16. Veracash**
Pas d'API publique confirmée à ce stade — **à rechercher en Phase 4** (API partenaire, export CSV/relevé, ou saisie manuelle en fallback si aucune intégration n'existe).

**D17. Placement Direct**
Également à rechercher en Phase 4 (API, export, ou saisie manuelle en fallback).

**D18. Devise de référence**
EUR uniquement pour l'affichage du patrimoine total (conversion systématique via Frankfurter/taux ECB), pas de bascule multi-devises en v1.

---

## Batch 5 — Dépenses récurrentes & UX

**D19. Catégorisation des dépenses**
Catégorisation automatique via Powens, mappée sur ~10-12 catégories simples pour l'UI (Logement, Charges & Abonnements, Alimentation, Restaurants, Transport, Santé, Shopping, Loisirs, Voyages, Services), avec possibilité de recatégoriser manuellement une transaction.

**D20. Fenêtre de calcul de la moyenne**
Fenêtre glissante de 6 mois (hors mois en cours), avec médiane comme métrique principale (robuste aux valeurs extrêmes) et moyenne en complément.

**D21. Alertes d'anomalies**
Oui — notification (push + in-app) quand une catégorie s'écarte significativement (ex: seuil à définir en implémentation, type ±30-40%) de sa moyenne glissante sur 6 mois.

**D22. Écran d'accueil**
Vue patrimoine global (net worth total, courbe d'évolution, répartition par classe d'actif) en premier écran à l'ouverture de l'app.

---

## Batch 6 — Design, déploiement, exploitation

**D23. Thème visuel**
Sombre par défaut (bleu marine/or, cohérent avec le blason MHTL Group), mode clair disponible en option dans les réglages.

**D24. Stratégie de déploiement**
TestFlight (iOS) + build interne Android d'abord, pas de publication publique sur les stores en v1 — usage privé du foyer uniquement pour l'instant.

**D25. Comptes développeur**
L'utilisateur souhaite éviter les coûts (cohérent avec D3 — budget minimal/gratuit). **Contrainte réelle à documenter** : Apple ne propose pas de TestFlight gratuit — le programme Apple Developer (99$/an) est obligatoire pour toute distribution TestFlight, même privée entre 2 personnes. Il n'existe pas de contournement gratuit équivalent à TestFlight sur iOS.
- **Approche par défaut retenue** : démarrer en développement avec des builds de dev gratuits (Expo dev client installé directement via câble/Xcode avec un Apple ID gratuit, limité à un renouvellement tous les 7 jours) pour les tests solo pendant le développement ; sur Android, distribution totalement gratuite possible via un fichier APK partagé directement (sideload), sans passer par Google Play.
- Le passage à un vrai compte développeur Apple (99$/an) ne sera nécessaire que si l'utilisateur veut un TestFlight confortable pour son épouse (installations qui ne expirent pas tous les 7 jours) — décision à reconfirmer avec l'utilisateur en Phase 5 quand ce point deviendra bloquant concrètement.
- Compte développeur Google Play (25$ une fois, à vie) reste optionnel tant que l'APK est distribué en sideload.

**D26. Alertes d'échec de synchronisation**
Notification push + bannière in-app dès qu'une source de données (banque, courtier, crypto, or) ne se synchronise plus correctement (échec technique ou reconsentement DSP2 expiré après 180 jours).

---

## Batch 7 — Performance, tests, résilience

**D27. Fréquence de rafraîchissement**
Synchronisation automatique 1x/jour (job nocturne planifié — pg_cron/Edge Function côté Supabase), plus rafraîchissement manuel (pull-to-refresh) disponible à tout moment dans l'app.

**D28. Stratégie de test end-to-end pendant le développement**
Utilisateurs/environnements sandbox (Powens sandbox, CoinGecko demo, Twelve Data free, données fictives) — ne jamais utiliser les vraies données bancaires/crypto de l'utilisateur pendant le développement. Le passage aux vraies données se fera uniquement à la demande explicite de l'utilisateur, une fois l'app validée en sandbox.

**D29. Gestion des échecs partiels de synchronisation**
Dégradation gracieuse : afficher les données disponibles (dernières valeurs connues) pour les sources en échec, avec un badge/avertissement clair sur la ou les sources concernées, plutôt que de bloquer tout l'affichage du patrimoine total.

**D30. Monitoring d'erreurs applicatives**
Pas de monitoring dédié (type Sentry) pour la v1 — projet personnel à petite échelle, la gestion d'erreur se limite au traitement in-app (D26, D29) sans alerting externe vers l'utilisateur en tant qu'« admin ».

---

## Audit de complétude (Phase 3c)

| Catégorie | Statut | Référence |
|---|---|---|
| Modèle de données | Défini (households/users, comptes multi-catégories, positions, transactions, catégories) | D2, D6, D9, D12, D14-D19 — détail schéma en Phase 9 (PHASES.md) |
| Chaque service externe | Spécifié, sauf Veracash/Placement Direct/adresses Ledger — recherche complémentaire actée | D7, D14-D17 (recherche Phase 4 requise pour D16/D17, précision adresses en Phase 5 pour D15) |
| Chaque type de contenu/sortie | Défini (catégories, alertes, vue patrimoine) | D19, D21, D22, D26 |
| Gestion d'erreurs | Définie (sync failures, échecs partiels, pas de monitoring externe) | D26, D29, D30 |
| Sécurité | Définie (2FA, biométrie, récupération, pas d'audit log) | D10-D13 |
| Stratégie de test | Définie (sandbox only pendant le dev) | D4, D28 |
| Cas limites | Couverts (échec partiel, resync 180j, anomalies dépenses) | D21, D26, D29 |
| Performance | Définie (sync quotidienne + refresh manuel, budget API minimal) | D3, D27 |
| Workflow utilisateur | Défini (écran d'accueil, biométrie quotidienne, 2 profils) | D11, D22 |
| Déploiement | Défini (TestFlight/APK sideload, pas de store public en v1) | D24, D25 |
| Contraintes plateforme | Couvertes par la recherche (disclosures Apple/Google finance) — à opérationnaliser en Phase 5/6 | recherche `mobile-app-stack.md` |
| Assets existants | Aucun code/compte existant ; seul asset = logo MHTL Group | `assets/mhtl-logo.png` |

**Items explicitement reportés à la Phase 4 (recherche post-Discovery) :**
1. Intégration Veracash (API/export/manuel) — D16
2. Intégration Placement Direct (API/export/manuel) — D17
3. Détail technique du suivi d'adresses Ledger on-chain (quelles chaînes supporter par défaut) — D15
4. Confirmation du coût réel Powens en sortie de sandbox (pour réévaluer D3/D25 si besoin)

Réponse à la question de complétude : un agent d'exécution lisant uniquement ce DISCOVERY.md peut prendre toutes les décisions d'implémentation de la v1 sans deviner, à l'exception des 4 points ci-dessus qui sont *volontairement* laissés à la recherche Phase 4 plutôt qu'à un choix arbitraire maintenant.

