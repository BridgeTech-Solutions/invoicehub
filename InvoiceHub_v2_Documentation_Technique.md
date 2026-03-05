# InvoiceHub v2.0 — Documentation Technique Complète
### Bridge Technologies Solutions (BTS) — Douala, Cameroun
### Rédigé par L'equipe Technique de BTS — Mars 2026

---

## TABLE DES MATIÈRES

1. Vue d'ensemble du projet
2. Stack technique et justifications
3. Architecture du projet (structure des dossiers)
4. Base de données — schéma et règles métier
5. Prisma ORM — comment fonctionne le mapping
6. Configuration et variables d'environnement
7. Infrastructure de sécurité
8. Système d'authentification complet
9. Contrôle d'accès (RBAC)
10. Journalisation d'audit
11. Module Auth — endpoints et flux
12. Module Users — gestion des utilisateurs
13. Module Clients — gestion des clients
14. Module Products & Categories — catalogue
15. Module Proformas — cycle de vie complet
16. Module Invoices — facturation avancée
17. Module Payments — enregistrement des paiements
18. Module Recurring — facturation récurrente
19. Module Notifications
20. Module Dashboard — indicateurs métier
21. Génération de PDF
22. Numérotation SYSCOHADA — règle critique
23. Calcul financier — formules utilisées
24. Gestion des erreurs
25. Docker et déploiement
26. Procédure de démarrage
27. Guide de contribution

---

## 1. VUE D'ENSEMBLE DU PROJET

InvoiceHub v2.0 est une plateforme de facturation entreprise développée pour **Bridge Technologies Solutions (BTS)**, société informatique basée à Douala, Cameroun. Le système est conforme au **système comptable SYSCOHADA** (Système Comptable de l'Organisation pour l'Harmonisation en Afrique du Droit des Affaires).

### Ce que le système gère

- Création et suivi de **devis (proformas)** envoyés aux clients
- Conversion des devis acceptés en **factures**
- Gestion du cycle complet de paiement (acomptes, soldes, avoirs)
- **Facturation récurrente** automatisée (abonnements, contrats de maintenance)
- **Catalogue produits/services** avec catégories et prix
- **Gestion des clients** (entreprises et particuliers)
- **Tableau de bord** avec indicateurs clés de performance (KPIs)
- **Authentification sécurisée** avec 2FA (double authentification)
- Conformité légale : numérotation sans trou, journalisation immuable

### Devise et marché

Toutes les transactions sont en **XAF (Franc CFA)**. La TVA standard camerounaise est de **19,25 %** conformément au droit fiscal camerounais.

---

## 2. STACK TECHNIQUE ET JUSTIFICATIONS

| Composant | Choix | Justification |
|---|---|---|
| Runtime | **Node.js 20** | LTS stable, excellent pour les APIs JSON |
| Langage | **TypeScript 5** | Typage statique = moins de bugs en production |
| Framework HTTP | **Express 4** | Léger, maîtrisé, écosystème mature |
| ORM | **Prisma 5** | Typage automatique, migrations, performance |
| Validation | **Zod** | Validation runtime + inférence de types TS |
| Auth | **jsonwebtoken + bcryptjs** | Standards JWT, bcrypt coût 12 |
| 2FA | **otplib** | Implémentation TOTP (RFC 6238) |
| Emails | **nodemailer** | Universel, compatible tout SMTP |
| PDF | **puppeteer** | Rendu fidèle HTML→PDF via Chromium |
| Logs | **winston + morgan** | Logs structurés JSON en production |
| Sécurité | **helmet, cors, express-rate-limit** | Protection OWASP |
| Package manager | **pnpm** | Plus rapide que npm, liens symboliques |
| Conteneurs | **Docker + docker-compose** | Déploiement reproductible |
| Base de données | **PostgreSQL 15** | Robustesse, JSON, fonctions stockées |

---

## 3. ARCHITECTURE DU PROJET

```
bridge-backend/
│
├── prisma/
│   └── schema.prisma           ← Modèles Prisma (mapping des tables SQL)
│
├── src/
│   ├── app.ts                  ← Création de l'application Express
│   ├── server.ts               ← Démarrage du serveur + arrêt propre
│   │
│   ├── config/
│   │   ├── env.ts              ← Variables d'environnement validées (Zod)
│   │   ├── database.ts         ← Instance Prisma Client (singleton)
│   │   └── constants.ts        ← Constantes métier (statuts, rôles)
│   │
│   ├── core/
│   │   ├── errors/
│   │   │   └── AppError.ts     ← Classe d'erreur avec code HTTP
│   │   ├── middleware/
│   │   │   ├── auth.ts         ← Vérification JWT
│   │   │   ├── rbac.ts         ← Contrôle des rôles
│   │   │   ├── audit.ts        ← Journal des mutations
│   │   │   ├── errorHandler.ts ← Gestion globale des erreurs
│   │   │   └── requestLogger.ts← Logs HTTP (morgan + winston)
│   │   └── types/
│   │       └── express.d.ts    ← Extension des types Express (req.user)
│   │
│   ├── lib/
│   │   ├── jwt.ts              ← Création/vérification des tokens
│   │   ├── bcrypt.ts           ← Hash/comparaison des mots de passe
│   │   ├── totp.ts             ← Double authentification TOTP
│   │   ├── mailer.ts           ← Envoi d'emails SMTP
│   │   ├── pdf.ts              ← Génération PDF via Puppeteer
│   │   └── documentNumber.ts   ← Numérotation SYSCOHADA (appel SQL)
│   │
│   └── modules/                ← Un dossier par domaine métier
│       ├── auth/
│       ├── users/
│       ├── clients/
│       ├── products/
│       ├── proformas/
│       ├── invoices/
│       ├── payments/
│       ├── recurring/
│       ├── notifications/
│       └── dashboard/
│
├── docker/
│   ├── Dockerfile              ← Image production multi-stage
│   └── Dockerfile.dev          ← Image développement avec hot reload
│
├── docker-compose.yml          ← Stack de production
├── docker-compose.dev.yml      ← Overrides développement
├── .env.example                ← Template des variables d'environnement
├── package.json
└── tsconfig.json
```

### Pattern par module

Chaque module métier suit exactement le même pattern en 4 fichiers :

```
module.routes.ts     → Déclare les endpoints, applique les middlewares
module.controller.ts → Reçoit req/res, parse l'input, appelle le service
module.service.ts    → Contient toute la logique métier (base de données)
module.schema.ts     → Schémas Zod de validation des entrées
```

Ce découpage garantit la **séparation des responsabilités** : chaque fichier a un rôle unique et clair.

---

## 4. BASE DE DONNÉES — SCHÉMA ET RÈGLES MÉTIER

Le schéma PostgreSQL (`invoicehub_schema_v2.sql`) contient **28 tables**, organisées en 5 domaines.

### Domaine 1 — Système et sécurité

| Table | Rôle |
|---|---|
| `company_settings` | Paramètres globaux de BTS (nom, logo, TVA par défaut) |
| `agency_offices` | Bureaux BTS — le code bureau entre dans la numérotation |
| `tax_rates` | Taux de TVA configurables |
| `users` | Comptes utilisateurs avec authentification et 2FA |
| `refresh_tokens` | Tokens de session (stockés hashés) |
| `login_history` | Journal de connexions (succès + échecs) |
| `password_reset_tokens` | Tokens de réinitialisation (usage unique, 1h) |

### Domaine 2 — Entités commerciales

| Table | Rôle |
|---|---|
| `clients` | Annuaire clients (entreprises + particuliers) |
| `product_categories` | Catégories du catalogue |
| `products` | Catalogue produits et services |
| `document_sequences` | Compteurs de numérotation par bureau/type/mois |

### Domaine 3 — Proformas (devis)

| Table | Rôle |
|---|---|
| `proformas` | En-têtes des devis |
| `proforma_lines` | Lignes de détail (snapshot des prix) |
| `proforma_status_history` | Historique complet des changements de statut |

### Domaine 4 — Facturation

| Table | Rôle |
|---|---|
| `invoices` | Toutes les factures (standard, acompte, solde, avoir, récurrente) |
| `invoice_lines` | Lignes de détail (snapshot des prix) |
| `invoice_status_history` | Historique des changements de statut |
| `payments` | Paiements reçus |

### Domaine 5 — Modules annexes

| Table | Rôle |
|---|---|
| `recurring_invoice_templates` | Gabarits de facturation récurrente |
| `recurring_invoice_template_lines` | Lignes des gabarits |
| `notifications` | Notifications in-app |
| `notification_settings` | Préférences de notification par utilisateur |
| `email_templates` | Templates d'emails stockés en base |
| `audit_logs` | Journal d'audit immuable |
| `backups` | Historique des sauvegardes |

### Règles d'intégrité importantes

- **Soft-delete partout** : aucune table n'utilise DELETE. Tout est archivé avec `deleted_at`.
- **Snapshots de prix** : quand une ligne de proforma ou facture est créée, le prix et la description du produit sont copiés. Modifier le catalogue n'affecte pas les documents existants.
- **Audit immuable** : des règles PostgreSQL au niveau base de données empêchent toute modification ou suppression dans `audit_logs`.

---

## 5. PRISMA ORM — COMMENT FONCTIONNE LE MAPPING

### Qu'est-ce que Prisma ?

Prisma est un ORM (Object-Relational Mapper) TypeScript. Il fait le lien entre les tables PostgreSQL et des objets TypeScript typés. Au lieu d'écrire du SQL brut, on utilise l'API Prisma :

```typescript
// Exemple : trouver un utilisateur actif par email
const user = await prisma.user.findFirst({
  where: { email: 'test@bts.cm', deletedAt: null },
  select: { id: true, email: true, role: true }
});
```

Prisma génère le SQL optimisé correspondant et retourne un objet TypeScript entièrement typé.

### Le fichier schema.prisma

`prisma/schema.prisma` est la carte de toutes les tables. Chaque modèle Prisma correspond à une table SQL. Les noms sont convertis :
- Table SQL `agency_offices` → modèle Prisma `AgencyOffice`
- Colonne SQL `created_by` → champ Prisma `createdById` (avec `@map("created_by")`)
- Type SQL `user_role` (enum) → enum Prisma `UserRole`

### Exemple de modèle Prisma

```prisma
model Invoice {
  id        String        @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  number    String        @unique @db.VarChar(50)
  type      InvoiceType   @default(standard)
  status    InvoiceStatus @default(draft)
  totalTtc  Decimal       @map("total_ttc") @db.Decimal(15, 2)
  // ...
  lines     InvoiceLine[]  // Relation One-to-Many
  payments  Payment[]      // Relation One-to-Many

  @@map("invoices")        // Nom de la table SQL
}
```

### Utilisation de $queryRaw (requêtes SQL brutes)

Pour la numérotation des documents, on utilise directement une fonction PostgreSQL :

```typescript
const result = await prisma.$queryRaw`
  SELECT fn_next_document_number(
    ${officeId}::uuid,
    ${documentType}::"document_type"
  ) AS fn_next_document_number
`;
```

Cela permet d'utiliser les fonctions PostgreSQL avancées tout en restant dans Prisma.

---

## 6. CONFIGURATION ET VARIABLES D'ENVIRONNEMENT

### Fichier `src/config/env.ts`

Ce fichier est la **première chose qui s'exécute** au démarrage. Il valide toutes les variables d'environnement avec Zod. Si une variable est manquante ou invalide, l'application s'arrête immédiatement avec un message d'erreur clair — jamais de comportement silencieusement incorrect.

```typescript
const envSchema = z.object({
  DATABASE_URL: z.string().url(),           // Doit être une URL valide
  JWT_ACCESS_SECRET: z.string().min(32),    // Minimum 32 caractères
  PORT: z.coerce.number().default(3000),    // Convertit string → number
  // ...
});
```

### Liste des variables

| Variable | Obligatoire | Description |
|---|---|---|
| `DATABASE_URL` | ✅ Oui | URL PostgreSQL complète |
| `JWT_ACCESS_SECRET` | ✅ Oui | Clé HMAC access token (min 32 chars) |
| `JWT_REFRESH_SECRET` | ✅ Oui | Clé HMAC refresh token (min 32 chars) |
| `JWT_ACCESS_EXPIRES_IN` | Non (15m) | Durée vie access token |
| `JWT_REFRESH_EXPIRES_IN` | Non (7d) | Durée vie refresh token |
| `SMTP_HOST` | Non | Envoi email désactivé si absent |
| `SMTP_PORT` | Non (587) | Port SMTP |
| `SMTP_FROM` | Non | Adresse expéditeur |
| `APP_URL` | Non | URL publique (liens dans emails) |
| `TOTP_ISSUER` | Non | Nom dans l'app authenticator |
| `PORT` | Non (3000) | Port d'écoute HTTP |

---

## 7. INFRASTRUCTURE DE SÉCURITÉ

### Middlewares globaux (dans app.ts)

**helmet** : ajoute des en-têtes HTTP de sécurité automatiquement
- `X-Content-Type-Options: nosniff` — empêche le MIME sniffing
- `X-Frame-Options: DENY` — empêche le clickjacking
- `Strict-Transport-Security` — force HTTPS
- Et une dizaine d'autres protections

**cors** : contrôle les origines autorisées à accéder à l'API
```typescript
app.use(cors({ origin: env.APP_URL, credentials: true }));
```

**express-rate-limit** : limite le nombre de requêtes par IP

| Endpoint | Limite | Fenêtre |
|---|---|---|
| Toutes les routes | 300 requêtes | 15 minutes |
| `POST /auth/login` | 10 tentatives | 15 minutes |
| `POST /auth/forgot-password` | 5 demandes | 1 heure |

### Protection anti-brute-force

En plus du rate limiting, le système incrémente un compteur `failed_login_attempts` à chaque échec de connexion. Après 5 échecs, le compte est verrouillé (`locked_at` est renseigné). La réinitialisation du mot de passe déverrouille le compte.

### Stockage des secrets

| Secret | Stockage |
|---|---|
| Mot de passe | Hash bcrypt (coût 12) — jamais en clair |
| Refresh token | Hash SHA-256 — jamais en clair |
| Token de reset | Hash SHA-256 — jamais en clair |
| Secret TOTP | Stocké tel quel (chiffrement DB possible en prod) |

---

## 8. SYSTÈME D'AUTHENTIFICATION COMPLET

### Architecture à deux tokens

L'authentification utilise deux types de tokens JWT :

**Access token** (courte durée — 15 minutes par défaut)
- Transmis dans chaque requête : `Authorization: Bearer <token>`
- Contient : `sub` (user ID), `email`, `role`, `type: 'access'`
- Vérifié côté serveur avec une vérification DB en parallèle (statut compte)

**Refresh token** (longue durée — 7 jours par défaut)
- Envoyé uniquement à `/auth/refresh`
- Stocké en base sous forme de hash SHA-256
- Permet d'obtenir un nouvel access token sans re-connexion

### Flux de connexion (login)

```
Client                         Serveur
  |                               |
  |-- POST /auth/login ---------->|
  |   { email, password, totp }   |
  |                               |-- 1. Vérifier email + statut compte
  |                               |-- 2. Comparer mot de passe (bcrypt)
  |                               |-- 3. Vérifier TOTP si 2FA activé
  |                               |-- 4. Réinitialiser compteur d'échecs
  |                               |-- 5. Créer refresh token en base (hashé)
  |                               |-- 6. Signer access token + refresh token
  |<-- { accessToken, refreshToken, user } --|
```

### Flux de renouvellement (refresh)

```
Client                         Serveur
  |                               |
  |-- POST /auth/refresh -------->|
  |   { refreshToken }            |
  |                               |-- 1. Vérifier signature JWT
  |                               |-- 2. Trouver le hash en base
  |                               |-- 3. Vérifier non révoqué et non expiré
  |                               |-- 4. RÉVOQUER l'ancien token (rotation)
  |                               |-- 5. Émettre nouveaux tokens
  |<-- { accessToken, refreshToken } --|
```

La **rotation** des refresh tokens signifie que chaque utilisation génère un nouveau token et révoque l'ancien. Si un token volé est réutilisé, le serveur détecte la réutilisation (token déjà révoqué) et peut alerter.

### Double authentification TOTP (RFC 6238)

Le 2FA utilise l'algorithme TOTP (Time-based One-Time Password) — compatible Google Authenticator, Authy, etc.

**Activation (en 2 étapes) :**
1. `POST /auth/2fa/enable` → génère un secret et un QR code
2. L'utilisateur scanne le QR code avec son application
3. `POST /auth/2fa/verify` → confirme avec un code valide → 2FA activé

**À la connexion :**
- Si 2FA activé et code absent → réponse `401 TOTP_REQUIRED` (le frontend affiche le champ)
- Si le code est incorrect → refus, tentative comptabilisée

---

## 9. CONTRÔLE D'ACCÈS (RBAC)

### Les trois rôles

| Rôle | Description | Accès |
|---|---|---|
| `admin` | Administrateur système | Tout |
| `commercial` | Chargé de clientèle | Clients, devis, factures, produits |
| `employee` | Employé | Lecture + saisie paiements |

### Comment c'est implémenté

Le middleware `authorize()` est une **fabrique** : elle retourne un middleware Express configuré avec les rôles autorisés.

```typescript
// Réservé aux admins
router.delete('/:id', authorize('admin'), handler)

// Admins et commerciaux
router.post('/', authorize('admin', 'commercial'), handler)

// Tous les utilisateurs authentifiés
router.get('/', authenticate, handler)
```

La vérification se fait en deux étapes :
1. `authenticate` vérifie le token JWT et injecte `req.user`
2. `authorize(...)` vérifie que `req.user.role` est dans la liste autorisée

---

## 10. JOURNALISATION D'AUDIT

### Pourquoi c'est important

La conformité SYSCOHADA exige de tracer toutes les opérations sur les données financières. La table `audit_logs` est **immuable** au niveau PostgreSQL — des règles de base de données empêchent UPDATE et DELETE dessus.

### Le middleware `auditMiddleware`

```typescript
// Exemple d'utilisation sur une route
router.post('/:id/cancel',
  authenticate,
  authorize('admin'),
  auditMiddleware('invoices', 'STATUS_CHANGE'),
  invoicesController.cancel
)
```

Le middleware s'active **après l'envoi de la réponse** (événement `finish`) :
- Seules les opérations réussies (codes 2xx) sont loggées
- N'impacte pas la latence de la réponse
- En cas d'échec du log, l'API continue normalement (dégradation silencieuse)

### Actions auditées

`CREATE`, `UPDATE`, `DELETE`, `SOFT_DELETE`, `RESTORE`, `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `PASSWORD_CHANGE`, `PASSWORD_RESET`, `ROLE_CHANGE`, `STATUS_CHANGE`, `CONVERT_TO_INVOICE`, `PAYMENT_REGISTERED`, `PAYMENT_DELETED`, `EMAIL_SENT`, `PDF_GENERATED`, `EXPORT`

---

## 11. MODULE AUTH — ENDPOINTS

Base URL : `/api/auth`

| Méthode | Route | Auth requise | Description |
|---|---|---|---|
| POST | `/login` | Non | Connexion |
| POST | `/logout` | Non | Révocation refresh token |
| POST | `/refresh` | Non | Renouvellement tokens |
| POST | `/forgot-password` | Non | Demande reset password |
| POST | `/reset-password` | Non | Reset avec token email |
| POST | `/2fa/enable` | Oui | Génère QR code TOTP |
| POST | `/2fa/verify` | Oui | Active le 2FA |
| POST | `/2fa/disable` | Oui | Désactive le 2FA |

---

## 12. MODULE USERS — GESTION DES UTILISATEURS

Base URL : `/api/users`

| Méthode | Route | Rôle requis | Description |
|---|---|---|---|
| GET | `/me` | Authentifié | Profil de l'utilisateur connecté |
| PUT | `/me/password` | Authentifié | Changer son propre mot de passe |
| GET | `/` | admin | Lister tous les utilisateurs |
| POST | `/` | admin | Créer un utilisateur |
| GET | `/:id` | admin | Détail d'un utilisateur |
| PUT | `/:id` | admin | Modifier un utilisateur |
| DELETE | `/:id` | admin | Archiver un utilisateur (soft-delete) |

### Points importants

- La **suppression est un soft-delete** : l'utilisateur est marqué `deleted_at` et son statut passe à `suspended`. Ses documents sont conservés intacts.
- À la création, le mot de passe est hashé (bcrypt coût 12) et `must_change_password` est mis à `true`.
- Changer son mot de passe révoque automatiquement tous les refresh tokens (force la reconnexion sur les autres appareils).

---

## 13. MODULE CLIENTS

Base URL : `/api/clients`

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Lister (filtres : type, statut, ville, recherche) |
| POST | `/` | Créer un client |
| GET | `/:id` | Détail d'un client |
| PUT | `/:id` | Modifier |
| DELETE | `/:id` | Archiver (soft-delete) |
| GET | `/:id/summary` | Résumé financier |

### Le résumé financier `/summary`

Retourne en une requête :
- Nombre total de factures
- Total facturé (toutes factures émises)
- Total encaissé (factures payées)
- Total en attente de paiement
- Nombre de factures en cours

---

## 14. MODULE PRODUITS ET CATÉGORIES

Base URL categories : `/api/product-categories`
Base URL products : `/api/products`

Les catégories sont livrées préconfigurées avec 7 catégories BTS standard : Infrastructure, Sécurité, Cloud, Maintenance, Conseil/DSI, Logiciels, Matériels.

### Gestion des produits

| Champ | Description |
|---|---|
| `name` | Désignation du produit/service |
| `type` | `product` ou `service` |
| `unit` | Unité : heure, jour, forfait, pièce, licence, mois, année |
| `unitPriceHt` | Prix unitaire hors taxes |
| `taxRateValue` | Taux TVA (snapshottisé dans les lignes de documents) |
| `reference` | Référence fabricant ou SKU |
| `metadata` | Champ JSON libre (specs techniques, marque, etc.) |

---

## 15. MODULE PROFORMAS — CYCLE DE VIE

Base URL : `/api/proformas`

### Statuts et transitions

```
                        ┌─────────────┐
                        │    DRAFT    │ ← Création
                        └──────┬──────┘
                               │ POST /:id/send
                        ┌──────▼──────┐
                        │    SENT     │ ← Envoyé au client
                        └──┬──────┬───┘
                           │      │
         POST /:id/accept  │      │ POST /:id/reject
                    ┌──────▼──┐ ┌─▼────────┐
                    │ACCEPTED │ │ REJECTED │
                    └────┬────┘ └──────────┘
                         │
              POST /:id/convert
                    ┌────▼────┐
                    │ FACTURE │ (nouveau document)
                    └─────────┘
```

**EXPIRED** : statut automatique quand `valid_until` < date du jour

### Création d'une proforma

1. Le client soumet les données (lignes, remises, dates)
2. Le contrôleur valide avec Zod
3. Le service génère le numéro SYSCOHADA (appel SQL atomique)
4. Les totaux sont calculés côté serveur (jamais côté client)
5. La proforma est créée avec un premier enregistrement dans `proforma_status_history`

### Calcul des totaux (formule SYSCOHADA)

Pour chaque ligne :
```
subtotal_ht = quantité × prix_unitaire_HT
discount_amount = subtotal_ht × taux_remise / 100
net_ht = subtotal_ht − discount_amount
tax_amount = net_ht × taux_TVA / 100
total_ttc = net_ht + tax_amount
```

Pour le document :
```
subtotal_document = Σ(net_ht de chaque ligne)
remise_globale = subtotal_document × taux_remise_globale / 100
total_ht = subtotal_document − remise_globale
total_tax = Σ(tax_amount de chaque ligne)
total_ttc = total_ht + total_tax
```

### Conversion en facture

`POST /:id/convert` crée une facture de type `standard` en copiant :
- Le client, le bureau, le sujet, les notes
- Toutes les lignes (snapshot des prix de la proforma)
- Les totaux calculés

La proforma passe au statut `accepted` et la facture créée est au statut `draft`.

---

## 16. MODULE INVOICES — FACTURATION AVANCÉE

Base URL : `/api/invoices`

### Les cinq types de factures

| Type | Description |
|---|---|
| `standard` | Facture classique |
| `acompte` | Facture d'acompte (% du total — ex: 30%) |
| `solde` | Facture de solde (déduit les acomptes versés) |
| `avoir` | Note de crédit (générée automatiquement à l'annulation) |
| `recurring` | Facture issue d'un gabarit récurrent |

### Cycle acompte / solde

```
Contrat 1 000 000 XAF
       │
       ├─→ Facture ACOMPTE (30%) = 300 000 XAF → client paie 300 000
       │
       └─→ Facture SOLDE
              total_ttc = 1 000 000
              − acomptes versés = 300 000
              = montant dû = 700 000 XAF
```

La facture de solde pointe vers la facture d'acompte via `parent_invoice_id`.

### Annulation et avoir automatique

Quand une facture émise est annulée (`POST /:id/cancel`) :
1. La facture passe au statut `cancelled`
2. **Un avoir est automatiquement créé** (même transaction SQL)
3. L'avoir reprend les mêmes lignes que la facture annulée
4. L'avoir pointe vers la facture annulée via `credited_invoice_id`

Cette opération est **atomique** : si la création de l'avoir échoue, l'annulation n'est pas enregistrée non plus.

### Cycle de statuts

```
draft → issued → partially_paid → paid
                     ↓
                  overdue (si date échéance dépassée)
                     ↓
                  cancelled (+ avoir créé automatiquement)
```

---

## 17. MODULE PAYMENTS — PAIEMENTS

Endpoint principal : `POST /api/invoices/:id/payment`
Liste globale : `GET /api/payments`

### Ce qui se passe à chaque paiement

Dans une transaction atomique :
1. Le paiement est créé en base
2. `amount_paid` de la facture est incrémenté
3. `balance_due` est recalculé
4. Si `balance_due = 0` → statut `paid`
5. Si premier paiement partiel → statut `partially_paid`
6. L'historique de statut est mis à jour si le statut change

### Suppression d'un paiement

Les paiements ne sont jamais supprimés physiquement. Le soft-delete (`deleted_at`) :
1. Marque le paiement comme supprimé
2. Recalcule le solde en agrégeant les paiements restants actifs
3. Ajuste le statut de la facture en conséquence

---

## 18. MODULE RECURRING — FACTURATION RÉCURRENTE

Base URL : `/api/recurring`

### Concept

Un gabarit récurrent (`recurring_invoice_template`) contient :
- Le client, le bureau, la devise
- L'intervalle : `monthly`, `quarterly`, `biannual`, `annual`
- Les lignes de facturation (désignation, quantité, prix)
- `next_invoice_date` : date de la prochaine génération

### Génération d'une facture (`POST /:id/generate`)

1. Vérifie que le gabarit est actif et non expiré
2. Génère un numéro de facture SYSCOHADA
3. Calcule les totaux à partir des lignes du gabarit
4. Crée la facture (statut `draft`, type `recurring`)
5. Met à jour `next_invoice_date` selon l'intervalle
6. Met à jour `last_generated_at`

### Automatisation

La génération peut être déclenchée :
- **Manuellement** via `POST /:id/generate`
- **Automatiquement** par un cron job externe qui appelle la même route pour les gabarits dont `next_invoice_date <= aujourd'hui`

---

## 19. MODULE NOTIFICATIONS

Base URL : `/api/notifications`

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Lister (filtre : non lues seulement) |
| PUT | `/:id/read` | Marquer comme lue |
| PUT | `/read-all` | Tout marquer comme lu |

Les réponses incluent `unreadCount` — le nombre de notifications non lues, utile pour le badge dans l'interface.

---

## 20. MODULE DASHBOARD — INDICATEURS MÉTIER

Base URL : `/api/dashboard/kpis`

Retourne en un seul appel :

```json
{
  "invoices": {
    "totalAmount": 15000000,
    "totalCount": 47,
    "thisMonthAmount": 3200000,
    "thisMonthCount": 8
  },
  "overdue": {
    "amount": 850000,
    "count": 3
  },
  "payments": {
    "thisMonthAmount": 2100000
  },
  "pending": {
    "amount": 4500000,
    "count": 12
  },
  "clients": { "activeCount": 34 },
  "proformas": { "thisMonthCount": 11 },
  "recentInvoices": [...],
  "topClients": [...],
  "monthlyRevenue": [
    { "month": "2026-01", "total": 2800000 },
    { "month": "2026-02", "total": 3100000 },
    { "month": "2026-03", "total": 3200000 }
  ]
}
```

Toutes ces données sont calculées avec des requêtes Prisma parallèles (`Promise.all`) pour minimiser le temps de réponse.

---

## 21. GÉNÉRATION DE PDF

### Technologie : Puppeteer (Chromium headless)

Puppeteer est une bibliothèque qui contrôle un navigateur Chrome/Chromium en mode headless (sans interface graphique). Le processus de génération :

1. **Démarrer Chromium** en mode headless
2. **Injecter le HTML** du document dans une page
3. **Attendre** que le rendu soit complet (`networkidle0`)
4. **Exporter en PDF** format A4 avec les marges définies
5. **Fermer Chromium** (toujours, même en cas d'erreur)

### Structure du template HTML

Le template est généré par `buildDocumentHtml()` avec :
- En-tête BTS (logo, coordonnées, numéro de document)
- Section parties (émetteur + client)
- Tableau des lignes avec colonnes : désignation, qté/unité, prix HT, TVA, TTC
- Récapitulatif des totaux
- Notes et conditions de paiement
- Pied de page légal

### Format des montants

Les montants sont formatés en franc CFA sans décimales avec séparateur d'espace :
`1500000 XAF` → `1 500 000 XAF`

---

## 22. NUMÉROTATION SYSCOHADA — RÈGLE CRITIQUE

### Format

```
BTS / DC / 2026 / 01 / fac 001
 │     │    │     │    │    │
 │     │    │     │    │    └─ Numéro séquentiel (3 chiffres)
 │     │    │     │    └────── Préfixe : pfm (proforma) ou fac (facture)
 │     │    │     └─────────── Mois (2 chiffres)
 │     │    └───────────────── Année (4 chiffres)
 │     └────────────────────── Code du bureau
 └──────────────────────────── Code de l'entreprise
```

### Pourquoi l'appel SQL est obligatoire

La numérotation doit être :
- **Sans trou** : pas de numéro manqué entre deux numéros consécutifs (exigence légale SYSCOHADA)
- **Atomique** : deux utilisateurs qui créent une facture simultanément doivent obtenir des numéros différents

La fonction PostgreSQL `fn_next_document_number()` utilise `INSERT ... ON CONFLICT DO UPDATE` avec un verrou implicite pour garantir ces propriétés. Toute tentative de recalculer le numéro côté JavaScript serait sujette aux conditions de course (race conditions).

```typescript
// ✅ Correct — appel SQL atomique
const number = await prisma.$queryRaw`
  SELECT fn_next_document_number(${officeId}::uuid, ${type}::"document_type")
`;

// ❌ Interdit — race condition possible
const lastInvoice = await prisma.invoice.findFirst({ orderBy: { number: 'desc' } });
const number = incrementNumber(lastInvoice.number); // JAMAIS ça
```

---

## 23. CALCUL FINANCIER — FORMULES UTILISÉES

### Niveau ligne

```
subtotal_ht     = quantité × prix_unitaire_HT
discount_amount = subtotal_ht × (discount_value / 100)   [si type = 'percentage']
                = min(discount_value, subtotal_ht)         [si type = 'fixed']
                = 0                                        [si type = 'none']
net_ht          = subtotal_ht − discount_amount
tax_amount      = net_ht × (tax_rate / 100)
total_ttc       = net_ht + tax_amount
```

### Niveau document

```
subtotal_document      = Σ net_ht de toutes les lignes
global_discount_amount = subtotal_document × (global_discount_value / 100)  [%]
                       = min(global_discount_value, subtotal_document)        [fixe]
total_ht               = subtotal_document − global_discount_amount
total_tax              = Σ tax_amount de toutes les lignes
total_ttc              = total_ht + total_tax
```

Tous les calculs sont **arrondis à 2 décimales** avec `Number(x.toFixed(2))` pour éviter les erreurs de virgule flottante JavaScript.

### Cycle de paiement

```
amount_due  = total_ttc − total_acomptes_deducted  (pour facture solde)
amount_paid = Σ paiements actifs sur la facture
balance_due = amount_due − amount_paid
```

---

## 24. GESTION DES ERREURS

### La classe AppError

Toutes les erreurs métier héritent de `AppError` :
```typescript
throw AppError.notFound('Facture introuvable');
throw AppError.badRequest('Montant supérieur au solde dû');
throw AppError.forbidden('Accès réservé aux administrateurs');
```

### Le gestionnaire global (errorHandler)

Un seul middleware intercepte toutes les erreurs et retourne une réponse JSON uniforme :
```json
{ "success": false, "code": "NOT_FOUND", "message": "Facture introuvable" }
```

### Hiérarchie de traitement

1. **Erreurs Zod** (validation) → `400 VALIDATION_ERROR` avec détail par champ
2. **AppError** (métier) → code HTTP défini à la levée
3. **Erreurs Prisma connues** → P2002 (doublon) → 409, P2025 (not found) → 404
4. **Erreurs inconnues** → 500 (message générique en production)

---

## 25. DOCKER ET DÉPLOIEMENT

### Architecture Docker

```
docker-compose.yml
├── db  : postgres:15-alpine
│         volume : postgres_data (persistance)
│         init   : invoicehub_schema_v2.sql (exécuté au premier démarrage)
│
└── api : image construite depuis docker/Dockerfile
          dépend de : db (health check)
          port : 3000:3000
```

### Dockerfile multi-stage (production)

```dockerfile
# Stage 1 : Build
FROM node:20-alpine AS builder
RUN pnpm install --frozen-lockfile
RUN pnpm build          # TypeScript → JavaScript dans dist/

# Stage 2 : Production
FROM node:20-alpine AS production
RUN pnpm install --prod  # Uniquement les dépendances de production
COPY dist/ ./dist/       # Seulement le JavaScript compilé
CMD ["node", "dist/server.js"]
```

L'image finale ne contient pas TypeScript ni les fichiers source — elle est plus petite et plus sécurisée.

### Graceful shutdown

Quand Docker envoie `SIGTERM` pour arrêter le conteneur, le serveur :
1. Arrête d'accepter de nouvelles connexions
2. Attend la fin des requêtes en cours
3. Ferme la connexion PostgreSQL proprement
4. Quitte avec code 0 (succès)

Si le shutdown prend plus de 10 secondes, il est forcé (code 1).

---

## 26. PROCÉDURE DE DÉMARRAGE

### Prérequis

- Docker Desktop installé
- pnpm installé (`npm install -g pnpm`)
- Node.js 20+

### Démarrage en développement

```bash
# 1. Cloner et aller dans le répertoire
cd bridge-backend

# 2. Copier et configurer les variables d'environnement
cp .env.example .env
# Éditer .env : remplir JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (min 32 chars)

# 3. Démarrer PostgreSQL seul en premier
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up db -d

# 4. Installer les dépendances
pnpm install

# 5. Générer le client Prisma
pnpm prisma:generate

# 6. Démarrer l'API en mode hot-reload
pnpm dev
```

L'API est disponible sur `http://localhost:3000`
La base de données est exposée sur `localhost:5432`

### Démarrage en production (Docker complet)

```bash
cp .env.example .env
# Remplir toutes les variables, notamment DB_PASSWORD

docker-compose up -d
```

### Vérification

```bash
# Santé de l'API
curl http://localhost:3000/health

# Réponse attendue :
# { "status": "ok", "timestamp": "2026-03-05T...", "env": "production" }
```

---

## 27. GUIDE DE CONTRIBUTION

### Ajouter un nouveau module

Exemple : créer un module `contracts` pour les contrats clients.

1. **Créer le dossier** : `src/modules/contracts/`

2. **Créer contracts.schema.ts** : définir les schémas Zod pour les entrées

3. **Créer contracts.service.ts** : logique métier avec Prisma
   ```typescript
   export class ContractsService {
     async list(input: ListContractsInput) { ... }
     async findById(id: string) { ... }
     async create(input: CreateContractInput, createdById: string) { ... }
   }
   export const contractsService = new ContractsService();
   ```

4. **Créer contracts.controller.ts** : parse l'input, appelle le service, retourne JSON

5. **Créer contracts.routes.ts** : enregistrer les routes avec les middlewares

6. **Enregistrer dans app.ts** :
   ```typescript
   import { contractsRouter } from './modules/contracts/contracts.routes';
   app.use(`${prefix}/contracts`, contractsRouter);
   ```

### Conventions de code

- Tous les `id` passés en paramètre sont des UUID validés par Zod (`.uuid()`)
- Toute opération de lecture vérifie `deletedAt: null`
- Les erreurs sont levées avec `AppError` (jamais `throw new Error(...)` brut)
- Les contrôleurs n'ont aucune logique : ils délèguent tout au service
- Les services ne connaissent pas `Request` ni `Response`

---

*Document généré automatiquement — InvoiceHub v2.0 — Bridge Technologies Solutions — Mars 2026*
