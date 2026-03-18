# InvoiceHub v2.0 — Backend API

Plateforme de facturation entreprise pour **Bridge Technologies Solutions (BTS)** — Douala, Cameroun.
Conforme **SYSCOHADA** · Devise **XAF (Franc CFA)** · TVA **19,25 %**

---

## Stack technique

| Rôle | Technologie |
|---|---|
| Runtime | Node.js 20 |
| Langage | TypeScript 5 |
| Framework | Express 4 |
| ORM | Prisma 5 |
| Base de données | PostgreSQL 15 |
| Cache / Queues | Redis 7 + BullMQ |
| Validation | Zod |
| Auth | JWT (access 15m + refresh 7j) + bcrypt |
| 2FA | TOTP (otplib) + codes de secours |
| Email | Nodemailer |
| PDF | Puppeteer (Chromium headless) |
| Temps réel | Socket.io + Redis adapter |
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

Remplir au minimum :

```env
JWT_ACCESS_SECRET=une_cle_secrete_dau_moins_32_caracteres
JWT_REFRESH_SECRET=une_autre_cle_secrete_dau_moins_32_caracteres
DATABASE_URL=postgresql://postgres:strongpassword@localhost:5432/invoicehub
DB_PASSWORD=strongpassword
REDIS_URL=redis://localhost:6379
```

### 2. Mode développement (hot reload)

```bash
docker-compose up db redis -d   # PostgreSQL + Redis
pnpm install                    # Dépendances
pnpm prisma:generate            # Client Prisma
pnpm prisma:push                # Schéma → DB
pnpm dev                        # API sur http://localhost:3000
```

### 3. Mode production (Docker complet)

```bash
docker-compose up -d
```

---

## Structure du projet

```
bridge-backend/
├── prisma/
│   └── schema.prisma              # 21 modèles Prisma
├── src/
│   ├── app.ts                     # Express : middlewares + 19 routers
│   ├── server.ts                  # Écoute HTTP + graceful shutdown
│   ├── config/
│   │   ├── env.ts                 # Variables d'env validées (Zod)
│   │   ├── database.ts            # Prisma singleton
│   │   ├── redis.ts               # IORedis singleton (BullMQ)
│   │   └── constants.ts           # Constantes métier
│   ├── core/
│   │   ├── errors/AppError.ts
│   │   └── middleware/
│   │       ├── auth.ts            # JWT → req.user
│   │       ├── rbac.ts            # authorize('admin','commercial',...)
│   │       ├── audit.ts           # Auto-log mutations → audit_logs
│   │       ├── errorHandler.ts    # Gestionnaire global
│   │       ├── requestLogger.ts   # Morgan + Winston
│   │       └── rateLimitByUser.ts # Rate limit par userId (Redis)
│   ├── lib/
│   │   ├── jwt.ts                 # sign/verify tokens
│   │   ├── bcrypt.ts              # hash/compare passwords
│   │   ├── totp.ts                # TOTP 2FA
│   │   ├── mailer.ts              # SMTP Nodemailer
│   │   ├── pdf.ts                 # PDF Puppeteer + templates HTML
│   │   ├── documentNumber.ts      # fn_next_document_number() PostgreSQL
│   │   ├── csv.ts                 # Export CSV avec BOM UTF-8
│   │   └── socket.ts              # Socket.io (emitToUser, emitToAll)
│   ├── jobs/
│   │   ├── queues.ts              # 5 queues BullMQ
│   │   ├── workers.ts             # Démarrage/arrêt workers
│   │   ├── scheduler.ts           # 3 crons répétables
│   │   └── processors/
│   │       ├── email.processor.ts
│   │       ├── notification.processor.ts
│   │       ├── overdue.processor.ts
│   │       ├── recurring.processor.ts
│   │       └── reminder.processor.ts
│   └── modules/
│       ├── auth/                  # Auth + 2FA + sessions
│       ├── users/                 # Utilisateurs + avatar
│       ├── clients/               # Clients + quick-fill
│       ├── products/              # Catalogue + line-defaults
│       ├── proformas/             # Devis
│       ├── invoices/              # Factures + compute dry-run
│       ├── payments/              # Paiements
│       ├── recurring/             # Facturation récurrente
│       ├── notifications/         # Notifications in-app + préférences
│       ├── dashboard/             # KPIs + aging + cache Redis
│       ├── settings/              # Paramètres entreprise + uploads assets
│       ├── audit/                 # Journal d'audit
│       ├── search/                # Recherche globale intelligente
│       ├── reports/               # Rapports financiers
│       ├── tax-rates/             # Taux de TVA
│       ├── offices/               # Bureaux / agences
│       └── email-templates/       # Templates d'emails
├── assets/                        # Header, footer, cachet PDF (uploadés)
├── uploads/                       # Avatars, assets uploadés
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## Endpoints API

Tous les endpoints sont préfixés par `/api`. Les routes protégées requièrent :
```
Authorization: Bearer <access_token>
```

---

### Santé

```
GET /health  →  { status, db, redis, uptime, timestamp }
```

---

### Authentification — `/api/auth`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/login` | Public | Email + mot de passe (+ TOTP si 2FA actif) |
| POST | `/logout` | Public | Révoque le refresh token |
| POST | `/refresh` | Public | Rotation du refresh token |
| POST | `/forgot-password` | Public | Lien de réinitialisation par email |
| POST | `/reset-password` | Public | Nouveau mot de passe via token email |
| POST | `/2fa/enable` | Authentifié | Génère secret TOTP + QR code |
| POST | `/2fa/verify` | Authentifié | Active le 2FA → retourne 8 backup codes |
| POST | `/2fa/disable` | Authentifié | Désactive le 2FA (code TOTP requis) |
| POST | `/2fa/backup-codes` | Authentifié | Régénère les backup codes (code TOTP requis) |
| GET | `/sessions` | Authentifié | Liste les sessions actives |
| DELETE | `/sessions/:id` | Authentifié | Révoque une session |
| DELETE | `/sessions` | Authentifié | Révoque toutes les sessions sauf la courante |

---

### Utilisateurs — `/api/users`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/me` | Tous | Profil connecté |
| PUT | `/me` | Tous | Modifier son profil |
| PUT | `/me/password` | Tous | Changer son mot de passe |
| PUT | `/me/avatar` | Tous | Uploader son avatar (multipart) |
| DELETE | `/me/avatar` | Tous | Supprimer son avatar |
| GET | `/` | Admin | Liste paginée |
| POST | `/` | Admin | Créer un utilisateur |
| GET | `/:id` | Admin | Détail |
| PUT | `/:id` | Admin | Modifier (rôle inclus) |
| DELETE | `/:id` | Admin | Archiver (soft-delete) |

---

### Clients — `/api/clients`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Tous | Liste paginée + `?export=csv` |
| POST | `/` | Tous | Créer |
| GET | `/:id` | Tous | Détail |
| PUT | `/:id` | Tous | Modifier |
| DELETE | `/:id` | Tous | Archiver |
| GET | `/:id/summary` | Tous | Résumé financier (CA, payé, en attente) |
| GET | `/:id/quick-fill` | Tous | Données pré-remplissage document (produits suggérés, dernier prix, solde impayé) |

---

### Catalogue — `/api/product-categories` et `/api/products`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/api/product-categories` | Tous | Liste catégories |
| POST | `/api/product-categories` | Admin | Créer catégorie |
| GET/PUT/DELETE | `/api/product-categories/:id` | Admin | CRUD catégorie |
| GET | `/api/products?clientId=...` | Tous | Liste triée par usage avec ce client + `?export=csv` |
| POST | `/api/products` | Admin/Commercial | Créer produit |
| GET | `/api/products/:id` | Tous | Détail |
| GET | `/api/products/:id/line-defaults?clientId=...` | Tous | Auto-complétion ligne (désignation, prix catalogue, dernier prix client) |
| PUT | `/api/products/:id` | Admin/Commercial | Modifier |
| DELETE | `/api/products/:id` | Admin | Supprimer |

---

### Proformas — `/api/proformas`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Tous | Liste + `?export=csv` |
| POST | `/` | Tous | Créer (numérotation PostgreSQL atomique) |
| GET | `/:id` | Tous | Détail (lignes + historique statut) |
| PUT | `/:id` | Tous | Modifier (draft uniquement) |
| DELETE | `/:id` | Tous | Supprimer |
| POST | `/:id/send` | Tous | Envoyer |
| POST | `/:id/accept` | Tous | Accepter |
| POST | `/:id/reject` | Tous | Rejeter (avec motif) |
| POST | `/:id/convert` | Tous | Convertir en facture |
| POST | `/:id/duplicate` | Tous | Dupliquer en brouillon |
| GET | `/:id/pdf` | Tous | Télécharger le PDF |

**Cycle** : `draft → sent → accepted / rejected / expired`

---

### Factures — `/api/invoices`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Tous | Liste + `?export=csv` |
| POST | `/compute` | Tous | Calcul dry-run (totaux + alertes, sans sauvegarde) |
| POST | `/` | Tous | Créer |
| GET | `/:id` | Tous | Détail (lignes + paiements + historique) |
| PUT | `/:id` | Tous | Modifier (draft uniquement) |
| POST | `/:id/issue` | Tous | Émettre (draft → issued) |
| POST | `/:id/cancel` | Admin/Commercial | Annuler + avoir automatique |
| POST | `/:id/duplicate` | Tous | Dupliquer en brouillon |
| POST | `/:id/payment` | Tous | Enregistrer un paiement |
| GET | `/:id/pdf` | Tous | Télécharger le PDF |

**Types** : `standard`, `acompte`, `solde`, `avoir`, `recurring`
**Cycle** : `draft → issued → partially_paid → paid` (+ `overdue`, `cancelled`)

---

### Paiements — `/api/payments`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Tous | Liste + `?export=csv` |
| DELETE | `/:id` | Admin | Supprimer (recalcul solde auto) |

---

### Facturation récurrente — `/api/recurring`

CRUD complet + `POST /:id/activate` · `POST /:id/deactivate` · `POST /:id/generate`

---

### Notifications — `/api/notifications`

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Liste (filtre non-lues, pagination) |
| PUT | `/read-all` | Tout marquer comme lu |
| PUT | `/:id/read` | Marquer une notification |
| GET | `/settings` | Préférences par type |
| PUT | `/settings` | Configurer canal (in_app / email / both) |

---

### Dashboard — `/api/dashboard`

| Méthode | Route | Description |
|---|---|---|
| GET | `/kpis` | KPIs (CA, retards, encaissements, top clients, CA mensuel 12 mois) — mis en cache Redis 5min |
| GET | `/aging` | Vieillissement des créances (< 30j, 30-60j, 60-90j, > 90j) |

---

### Paramètres — `/api/settings`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Tous | Paramètres entreprise |
| PUT | `/` | Admin | Modifier (identité, délais, sécurité, escalade relances) |
| PUT | `/assets/logo` | Admin | Uploader le logo |
| PUT | `/assets/stamp` | Admin | Uploader le cachet |
| PUT | `/assets/signature` | Admin | Uploader la signature |
| PUT | `/assets/header` | Admin | Uploader l'image header PDF |
| PUT | `/assets/footer` | Admin | Uploader l'image footer PDF |

---

### Recherche globale — `/api/search`

```
GET /api/search?q=<requête libre>

Exemples :
  "Camtel 2025"          → factures/proformas du client Camtel en 2025
  "impayé > 500000"      → factures impayées > 500 000 XAF
  "FAC-031"              → navigation directe
  "mars 2026 brouillon"  → documents brouillon de mars 2026
```

---

### Rapports — `/api/reports`

| Méthode | Route | Description |
|---|---|---|
| GET | `/revenue` | CA mensuel par période |
| GET | `/by-client` | CA par client |
| GET | `/by-category` | CA par catégorie |
| GET | `/unpaid` | Situation impayés |
| GET | `/payments` | Journal encaissements |
| GET | `/tax-summary` | Récap TVA (déclaration) |

Tous supportent `?format=json` (défaut) et `?format=csv`.

---

### Sauvegardes — `/api/backups`

> Voir le guide complet : [BACKUPS.md](./BACKUPS.md)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `POST` | `/` | Admin | Déclencher un backup manuel (async, 202) |
| `GET` | `/` | Admin | Liste des backups |
| `GET` | `/:id` | Admin | Détail d'un backup |
| `GET` | `/:id/download` | Admin | Télécharger le fichier `.sql.gz` |
| `DELETE` | `/:id` | Admin | Supprimer (fichier + enregistrement) |

**Stockage supporté :** `local` · `s3` (AWS / Cloudflare R2 / MinIO) · `google` (GCS)
**Cron automatique :** chaque jour à 00:00 UTC
**Rate limit :** 3 backups manuels / heure

---

### Journal d'audit — `/api/audit-logs`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Admin | Historique immuable + `?export=csv` |
| GET | `/stats` | Admin | Statistiques d'activité |

---

### Taux de TVA — `/api/tax-rates`

CRUD complet (admin). Le taux par défaut ne peut pas être supprimé.

---

### Bureaux — `/api/offices`

CRUD complet (admin). Le bureau par défaut ne peut pas être supprimé.

---

### Templates email — `/api/email-templates`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Admin | Liste tous les templates |
| GET | `/:id` | Admin | Détail |
| PUT | `/:id` | Admin | Modifier sujet + corps HTML |
| POST | `/:id/preview` | Admin | Prévisualiser avec variables de test |

---

## Files d'attente (BullMQ)

| Queue | Déclenchement | Description |
|---|---|---|
| `email` | Événementiel | Envoi SMTP, 3 tentatives, backoff exponentiel |
| `notification` | Événementiel | In-app + email conditionnel selon préférences |
| `overdue` | Cron 00:05 UTC | Marque factures en retard, expire proformas |
| `recurring` | Cron 00:10 UTC | Génère factures récurrentes |
| `reminder` | Cron 00:15 UTC | Escalade relances internes (J+0/7/15/30) |
| `backup` | Cron 00:00 UTC + manuel | pg_dump + gzip + stockage local/S3/GCS |

---

## Sécurité

| Mécanisme | Détail |
|---|---|
| JWT | Access 15min + Refresh 7j, rotation à chaque usage |
| Stockage tokens | SHA-256 en base, jamais en clair |
| 2FA TOTP | QR code + 8 codes de secours à usage unique |
| Brute-force | Verrouillage compte après N tentatives (configurable) |
| RBAC | `admin` > `commercial` > `employee` |
| Audit immuable | Règle PostgreSQL : pas d'UPDATE/DELETE sur `audit_logs` |
| Rate limiting | 300 req/15min global · 10/15min login · Per-user pour PDF |
| Helmet + CORS | Headers sécurisés, origine restreinte à `APP_URL` |

---

## Règles métier SYSCOHADA

| Règle | Implémentation |
|---|---|
| Numérotation sans trou | `fn_next_document_number()` PostgreSQL avec `FOR UPDATE` |
| Format numéro | `BTS/{BUREAU}/{AAAA}/{MM}/{fac\|pfm}{XXX}` |
| Snapshots prix | Lignes copiées du catalogue à la création |
| Avoir automatique | Généré dans la même transaction que l'annulation |
| Soft-delete | `deleted_at` timestamp, jamais de DELETE physique |
| Audit immuable | Protégé au niveau base de données |
| Acompte/Solde | Total HT = projet complet, TTC = montant acompte |

---

## Scripts disponibles

```bash
pnpm dev              # Hot reload (tsx watch)
pnpm build            # Compilation TypeScript → dist/
pnpm start            # Production compilée

pnpm prisma:generate  # Générer le client Prisma
pnpm prisma:push      # Synchroniser schéma avec la DB
pnpm prisma:migrate   # Créer une migration
pnpm prisma:studio    # Interface graphique DB
```

---

## Variables d'environnement

| Variable | Requis | Défaut | Description |
|---|---|---|---|
| `NODE_ENV` | | `development` | Environnement |
| `PORT` | | `3000` | Port HTTP |
| `API_PREFIX` | | `/api` | Préfixe routes |
| `DATABASE_URL` | ✅ | — | URL PostgreSQL |
| `JWT_ACCESS_SECRET` | ✅ | — | Clé HMAC access token (min 32 chars) |
| `JWT_REFRESH_SECRET` | ✅ | — | Clé HMAC refresh token (min 32 chars) |
| `JWT_ACCESS_EXPIRES_IN` | | `15m` | Durée access token |
| `JWT_REFRESH_EXPIRES_IN` | | `7d` | Durée refresh token |
| `REDIS_URL` | ✅ | — | URL Redis |
| `SMTP_HOST` | | — | Hôte SMTP (email désactivé si absent) |
| `SMTP_PORT` | | `587` | Port SMTP |
| `SMTP_FROM` | | `noreply@bts.cm` | Expéditeur |
| `APP_URL` | | `http://localhost:3000` | URL publique (liens emails) |
| `TOTP_ISSUER` | | `InvoiceHub BTS` | Nom dans l'app authenticator |
| `BACKUP_STORAGE_DISK` | | `local` | Disque de stockage : `local` \| `s3` \| `google` |
| `BACKUP_DIR` | | `./uploads/backups` | Dossier backups (si `local`) |
| `BACKUP_RETENTION_DAYS` | | `30` | Rétention automatique (jours) |
| `BACKUP_CRON` | | `0 0 * * *` | Expression cron du backup automatique |
| `PGDUMP_PATH` | | `pg_dump` | Chemin vers l'exécutable `pg_dump` |
| `S3_BUCKET` | | — | Nom du bucket S3/R2/MinIO |
| `S3_REGION` | | — | Région S3 (ex: `eu-west-1`, `auto` pour R2) |
| `S3_ACCESS_KEY_ID` | | — | Clé d'accès S3 |
| `S3_SECRET_ACCESS_KEY` | | — | Clé secrète S3 |
| `S3_ENDPOINT` | | — | Endpoint custom (R2 ou MinIO, vide pour AWS) |
| `GCS_BUCKET` | | — | Nom du bucket Google Cloud Storage |
| `GCS_KEY_FILE` | | — | Chemin vers le JSON de compte de service GCP |

---

**Bridge Technologies Solutions (BTS)** · Douala, Cameroun
