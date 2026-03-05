# InvoiceHub v2.0 — Backend API

Plateforme de facturation entreprise pour **Bridge Technologies Solutions (BTS)** — Douala, Cameroun.

---

## Stack technique

| Rôle | Technologie |
|---|---|
| Runtime | Node.js 20 |
| Langage | TypeScript 5 |
| Framework | Express 4 |
| ORM | Prisma 5 |
| Base de données | PostgreSQL 15 |
| Validation | Zod |
| Auth | JWT (access + refresh) + bcrypt |
| 2FA | TOTP (otplib) |
| Email | Nodemailer |
| PDF | Puppeteer |
| Logs | Winston + Morgan |
| Conteneurs | Docker + docker-compose |
| Package manager | pnpm |

---

## Prérequis

- [Node.js 20+](https://nodejs.org)
- [pnpm](https://pnpm.io) — `npm install -g pnpm`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

## Démarrage rapide

### 1. Variables d'environnement

```bash
cp .env.example .env
```

Remplir au minimum dans `.env` :

```env
JWT_ACCESS_SECRET=une_cle_secrete_dau_moins_32_caracteres
JWT_REFRESH_SECRET=une_autre_cle_secrete_dau_moins_32_caracteres
DATABASE_URL=postgresql://postgres:strongpassword@localhost:5432/invoicehub
DB_PASSWORD=strongpassword
```

### 2. Mode développement (hot reload)

```bash
# Démarrer PostgreSQL
docker-compose up db -d

# Installer les dépendances
pnpm install

# Générer le client Prisma
pnpm prisma:generate

# Lancer l'API
pnpm dev
```

L'API démarre sur **http://localhost:3000**

### 3. Mode production (Docker complet)

```bash
docker-compose up -d
```

Les deux services (PostgreSQL + API) démarrent ensemble.
Le schéma SQL est appliqué automatiquement au premier démarrage.

---

## Structure du projet

```
bridge-backend/
├── prisma/
│   └── schema.prisma          # Modèles Prisma (mapping des tables SQL)
├── src/
│   ├── app.ts                 # Application Express (middlewares, routes)
│   ├── server.ts              # Démarrage du serveur + graceful shutdown
│   ├── config/
│   │   ├── env.ts             # Variables d'environnement validées (Zod)
│   │   ├── database.ts        # Instance Prisma (singleton)
│   │   └── constants.ts       # Constantes métier
│   ├── core/
│   │   ├── errors/AppError.ts # Classe d'erreur avec code HTTP
│   │   ├── middleware/
│   │   │   ├── auth.ts        # Vérification JWT → inject req.user
│   │   │   ├── rbac.ts        # Contrôle des rôles (admin/commercial/employee)
│   │   │   ├── audit.ts       # Journal des mutations (SYSCOHADA)
│   │   │   ├── errorHandler.ts# Gestionnaire d'erreurs global
│   │   │   └── requestLogger.ts # Logs HTTP (morgan + winston)
│   │   └── types/express.d.ts # Extension des types Express
│   ├── lib/
│   │   ├── jwt.ts             # Sign/verify access + refresh tokens
│   │   ├── bcrypt.ts          # Hash/compare mots de passe
│   │   ├── totp.ts            # Génération/vérification TOTP (2FA)
│   │   ├── mailer.ts          # Envoi d'emails SMTP
│   │   ├── pdf.ts             # Génération PDF via Puppeteer
│   │   └── documentNumber.ts  # Numérotation SYSCOHADA (appel SQL)
│   └── modules/
│       ├── auth/              # Authentification et sécurité
│       ├── users/             # Gestion des utilisateurs
│       ├── clients/           # Annuaire clients
│       ├── products/          # Catalogue produits et catégories
│       ├── proformas/         # Devis commerciaux
│       ├── invoices/          # Facturation (standard, acompte, solde, avoir)
│       ├── payments/          # Enregistrement des paiements
│       ├── recurring/         # Facturation récurrente
│       ├── notifications/     # Notifications in-app
│       └── dashboard/         # KPIs et indicateurs
├── docker/
│   ├── Dockerfile             # Image production (multi-stage)
│   └── Dockerfile.dev         # Image développement
├── docker-compose.yml         # Stack production
├── docker-compose.dev.yml     # Overrides développement
├── .env.example               # Template des variables d'environnement
├── tsconfig.json
└── package.json
```

---

## Scripts disponibles

```bash
pnpm dev              # Démarrage avec hot reload (tsx watch)
pnpm build            # Compilation TypeScript → dist/
pnpm start            # Démarrage de la version compilée

pnpm prisma:generate  # Générer le client Prisma depuis schema.prisma
pnpm prisma:push      # Synchroniser le schéma avec la DB (dev)
pnpm prisma:migrate   # Créer et appliquer une migration
pnpm prisma:studio    # Interface graphique de la base de données
```

---

## API — Endpoints

Tous les endpoints sont préfixés par `/api`.

### Authentification — `/api/auth`

| Méthode | Route | Description |
|---|---|---|
| POST | `/login` | Connexion (retourne access + refresh tokens) |
| POST | `/logout` | Révocation du refresh token |
| POST | `/refresh` | Renouvellement des tokens |
| POST | `/forgot-password` | Demande de réinitialisation par email |
| POST | `/reset-password` | Réinitialisation avec le token email |
| POST | `/2fa/enable` | Générer le QR code TOTP |
| POST | `/2fa/verify` | Activer le 2FA |
| POST | `/2fa/disable` | Désactiver le 2FA |

### Utilisateurs — `/api/users`

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/me` | Tous | Profil connecté |
| PUT | `/me/password` | Tous | Changer son mot de passe |
| GET | `/` | admin | Lister les utilisateurs |
| POST | `/` | admin | Créer un utilisateur |
| GET | `/:id` | admin | Détail |
| PUT | `/:id` | admin | Modifier |
| DELETE | `/:id` | admin | Archiver (soft-delete) |

### Clients — `/api/clients`

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Lister (filtre : type, statut, ville, recherche) |
| POST | `/` | Créer |
| GET | `/:id` | Détail |
| PUT | `/:id` | Modifier |
| DELETE | `/:id` | Archiver |
| GET | `/:id/summary` | Résumé financier (CA, payé, en attente) |

### Catalogue — `/api/product-categories` et `/api/products`

CRUD complet sur les deux ressources.

### Proformas — `/api/proformas`

| Méthode | Route | Description |
|---|---|---|
| GET/POST | `/` | Lister / Créer |
| GET/PUT/DELETE | `/:id` | Détail / Modifier (si draft) / Supprimer |
| POST | `/:id/send` | Envoyer au client |
| POST | `/:id/accept` | Accepter |
| POST | `/:id/reject` | Rejeter |
| POST | `/:id/convert` | Convertir en facture |
| GET | `/:id/pdf` | Télécharger le PDF |

### Factures — `/api/invoices`

| Méthode | Route | Description |
|---|---|---|
| GET/POST | `/` | Lister / Créer |
| GET/PUT | `/:id` | Détail / Modifier (si draft) |
| POST | `/:id/issue` | Émettre |
| POST | `/:id/cancel` | Annuler (génère un avoir automatiquement) |
| POST | `/:id/payment` | Enregistrer un paiement |
| GET | `/:id/pdf` | Télécharger le PDF |

### Paiements — `/api/payments`

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Lister |
| DELETE | `/:id` | Soft-delete (admin uniquement) |

### Récurrents — `/api/recurring`

CRUD + `POST /:id/activate` / `POST /:id/deactivate` / `POST /:id/generate`

### Notifications — `/api/notifications`

`GET /` · `PUT /:id/read` · `PUT /read-all`

### Dashboard — `/api/dashboard`

| Méthode | Route | Description |
|---|---|---|
| GET | `/kpis` | Tous les indicateurs métier |

### Santé

```
GET /health  →  { "status": "ok", "timestamp": "...", "env": "..." }
```

---

## Authentification des requêtes

Toutes les routes protégées nécessitent l'en-tête :

```
Authorization: Bearer <access_token>
```

L'access token est obtenu via `POST /api/auth/login` et renouvelé via `POST /api/auth/refresh`.

---

## Rôles et permissions

| Rôle | Description |
|---|---|
| `admin` | Accès complet — gestion des utilisateurs, annulation de factures |
| `commercial` | Création de devis/factures, gestion des clients et produits |
| `employee` | Consultation et saisie de paiements |

---

## Règles métier importantes

**Numérotation SYSCOHADA** — Format : `BTS/{BUREAU}/{ANNÉE}/{MOIS}/{pfm|fac}{XXX}`
Exemple : `BTS/DC/2026/01/fac001`. Générée côté PostgreSQL pour garantir l'atomicité et l'absence de trous.

**Snapshots de prix** — Les prix et descriptions sont copiés dans les lignes de documents au moment de la création. Modifier le catalogue n'affecte pas les documents existants.

**Avoir automatique** — L'annulation d'une facture émise crée automatiquement une note de crédit (avoir) dans la même transaction.

**Soft-delete** — Aucune donnée n'est jamais supprimée physiquement. Tout est archivé via `deleted_at`.

**Audit immuable** — Toutes les mutations sont journalisées dans `audit_logs`. Cette table est protégée au niveau PostgreSQL (pas de UPDATE/DELETE possible).

---

## Variables d'environnement — référence complète

Voir [.env.example](.env.example) pour la liste complète.

| Variable | Défaut | Description |
|---|---|---|
| `NODE_ENV` | `development` | Environnement d'exécution |
| `PORT` | `3000` | Port d'écoute HTTP |
| `DATABASE_URL` | — | URL PostgreSQL (obligatoire) |
| `JWT_ACCESS_SECRET` | — | Clé HMAC access token, min 32 chars (obligatoire) |
| `JWT_REFRESH_SECRET` | — | Clé HMAC refresh token, min 32 chars (obligatoire) |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Durée de vie access token |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Durée de vie refresh token |
| `SMTP_HOST` | — | Hôte SMTP (email désactivé si absent) |
| `SMTP_PORT` | `587` | Port SMTP |
| `SMTP_FROM` | `noreply@bts.cm` | Adresse expéditeur |
| `APP_URL` | `http://localhost:3000` | URL publique (liens emails) |
| `TOTP_ISSUER` | `InvoiceHub BTS` | Nom dans l'app authenticator |

---

## Développé pour

**Bridge Technologies Solutions (BTS)**
Douala, Cameroun — [bts.cm](https://bts.cm)

Système comptable : SYSCOHADA · Devise : XAF (Franc CFA) · TVA : 19,25 %
