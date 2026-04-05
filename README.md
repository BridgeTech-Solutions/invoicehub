# InvoiceHub v2.0 — Bridge Technologies Solutions

Plateforme de gestion de facturation entreprise pour **BTS (Bridge Technologies Solutions)**, Douala, Cameroun.
Conforme **SYSCOHADA** · Devise **XAF (Franc CFA)** · TVA **19,25 %**

---

## Structure du monorepo

```
BRIDGE/
├── bridge-backend/          # API REST — Node.js + Express + TypeScript + Prisma
├── bridge-frontend/         # Interface web — Next.js 15 + TypeScript + Tailwind
├── invoicehub_schema_v2.sql # Schéma PostgreSQL complet (1 328 lignes)
└── README.md                # Ce fichier
```

---

## Stack technique

| Couche | Backend | Frontend |
|---|---|---|
| Langage | TypeScript 5 | TypeScript 5 |
| Framework | Express 4 | Next.js 15 (App Router) |
| ORM / Data | Prisma 5 | TanStack Query v5 |
| Base de données | PostgreSQL 15 | — |
| Cache / Queues | Redis 7 + BullMQ | — |
| Auth | JWT access 15m + refresh 7j | Zustand store + Axios intercepteurs |
| 2FA | TOTP (otplib) | QR code + backup codes |
| Temps réel | Socket.io + Redis adapter | Socket.io Client |
| Styles | — | Tailwind CSS 4 + shadcn/ui |
| Graphiques | — | Recharts 2 |
| PDF | Puppeteer (Chromium headless) | Téléchargement depuis backend |
| Email | Nodemailer | — |
| IA locale | Ollama + Mistral (Docker) | Assistant BTS (streaming) |
| Conteneurs | Docker + docker-compose (5 services) | Docker multi-stage |
| Package manager | pnpm | pnpm |

---

## Démarrage rapide

### Prérequis

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm install -g pnpm`)
- **Docker Desktop**

---

### 1. Configuration des variables d'environnement

```bash
cd bridge-backend
cp .env.example .env
```

Remplir au minimum dans `.env` :

```env
JWT_ACCESS_SECRET=cle_secrete_minimum_32_caracteres
JWT_REFRESH_SECRET=autre_cle_secrete_minimum_32_caracteres
DATABASE_URL=postgresql://postgres:strongpassword@localhost:5432/invoicehub
DB_PASSWORD=strongpassword
REDIS_URL=redis://localhost:6379
```

Pour le frontend, créer `bridge-frontend/.env.local` :

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=InvoiceHub
```

---

### 2. Mode développement (recommandé)

**Terminal 1 — Backend**

```bash
cd bridge-backend

# Démarrer PostgreSQL + Redis
docker-compose up db redis -d

# Installer les dépendances
pnpm install

# Générer le client Prisma et synchroniser le schéma
pnpm prisma:generate
pnpm prisma:push

# Lancer l'API (hot reload)
pnpm dev
# → http://localhost:3000
```

**Terminal 2 — Frontend**

```bash
cd bridge-frontend

# Installer les dépendances
pnpm install

# Lancer l'interface (Turbopack)
pnpm dev
# → http://localhost:3001
```

---

### 3. Mode production — Docker complet

Ajouter `SERVER_IP` dans `.env` (IP du serveur sur le réseau local) :

```env
SERVER_IP=192.168.1.10
OLLAMA_ENABLED=true     # optionnel — active l'assistant BTS
```

Puis lancer le script de déploiement à la racine du projet :

```bash
# Windows
deploy.bat
```

Le script effectue automatiquement : vérifications, git pull, TypeScript, tests, docker-compose build + up, migrations Prisma, et téléchargement du modèle Ollama (avec confirmation).

Services démarrés :

| Service | URL |
|---|---|
| API REST | http://SERVER_IP:3000 |
| Interface web | http://SERVER_IP:3001 |
| PostgreSQL | interne Docker uniquement |
| Redis | interne Docker uniquement |
| Ollama (IA) | interne Docker uniquement |

---

## Architecture

### Backend (`bridge-backend/`)

```
src/
├── app.ts              # Express : 19 routers + middlewares
├── server.ts           # Écoute HTTP + graceful shutdown
├── config/             # Env (Zod), Prisma singleton, Redis singleton, constantes
├── core/
│   ├── errors/         # AppError (code + statusCode + message)
│   └── middleware/     # auth · rbac · audit · errorHandler · requestLogger · rateLimitByUser
├── lib/                # jwt · bcrypt · totp · mailer · pdf · documentNumber · csv · socket
├── jobs/               # BullMQ queues, workers, scheduler, 5 processors (email/notif/overdue/recurring/reminder)
└── modules/
    ├── auth/           # Login, refresh, 2FA TOTP, sessions, reset-password
    ├── users/          # CRUD + avatar
    ├── clients/        # CRUD + résumé financier + quick-fill
    ├── products/       # Catalogue + catégories + line-defaults
    ├── proformas/      # Devis — cycle complet + PDF + duplication
    ├── invoices/       # Factures — compute dry-run + émission + annulation + avoir auto + PDF
    ├── payments/       # Paiements + recalcul solde
    ├── recurring/      # Templates facturation récurrente
    ├── notifications/  # In-app + préférences + Socket.io
    ├── dashboard/      # KPIs + aging + cache Redis 5min
    ├── settings/       # Paramètres entreprise + upload assets
    ├── audit/          # Journal immuable + stats + export CSV
    ├── search/         # Recherche globale intelligente (NLP)
    ├── reports/        # Rapports financiers (CA, TVA, impayés...) + export CSV
    ├── tax-rates/      # CRUD taux TVA
    ├── offices/        # CRUD bureaux/agences
    ├── email-templates/# Templates HTML configurables + prévisualisation
    └── backups/        # pg_dump + stockage local/S3/GCS + cron automatique
```

### Frontend (`bridge-frontend/`)

```
src/
├── app/
│   ├── (auth)/         # login · 2fa · reset-password
│   └── (dashboard)/    # Pages protégées — AppShell (Sidebar + Topbar)
│       ├── dashboard/  · clients/ · products/ · proformas/ · invoices/
│       ├── payments/   · recurring/ · notifications/ · users/ · audit/
│       ├── profile/    · reports/
│       └── settings/   # company · billing · security · notifications · backups
├── components/
│   ├── layout/         # AppShell · Sidebar · Topbar (recherche globale) · PageHeader
│   ├── document/       # LineItemsEditor · TotalsPanel
│   ├── feedback/       # TablePageSkeleton · RouteError · StatusBadge · EmptyState
│   └── modals/         # ConfirmDialog
├── features/           # Logique métier feature-based (api · hooks · types · components)
├── hooks/              # useAuth · usePermission · useSocket · useDebounce · useLocalStorage
├── store/              # auth (Zustand) · sidebar (collapsed + mobileOpen)
├── providers/          # QueryProvider · SocketProvider · ToastProvider
├── lib/                # api-client (Axios + JWT intercepteurs) · document-math · utils · constants
└── types/              # Types génériques API paginées
```

---

## Fonctionnalités principales

### Documents SYSCOHADA

- **Numérotation atomique** — `fn_next_document_number()` PostgreSQL (SELECT FOR UPDATE, sans trou)
  - Format : `BTS/{BUREAU}/{AAAA}/{MM}/FAC###` · `PFM###` · `ACP###` · `AVO###`
- **Proformas** — `draft → sent → accepted / rejected / expired` → conversion en facture
- **Factures** — `standard`, `acompte`, `solde`, `avoir` (généré automatiquement à l'annulation)
- **Compute dry-run** — calcul des totaux + alertes (solde impayé client, montant inhabituel, doublon) sans sauvegarde
- **PDF** — généré côté serveur (Puppeteer) avec header/footer/cachet uploadés
- **Duplication** — tout document devient brouillon modifiable

### Tableau de bord

- 4 KPI cards (CA du mois, factures émises, créances, retards) — cache Redis 5 min
- Graphique évolution CA 12 mois (Recharts Line) — toggle mois/trimestre/année
- Donut statuts factures (Recharts Pie)
- Vieillissement créances (aging < 30j · 30-60j · 60-90j · > 90j)
- Top 5 clients + 5 dernières factures

### Authentification & Sécurité

- Login email/mot de passe + **2FA TOTP** (Google Authenticator, Authy) + 8 codes de secours
- Refresh token automatique (intercepteur Axios transparent, rotation à chaque usage)
- Gestion des sessions actives — révocation individuelle et globale
- RBAC : `admin` > `commercial` > `employee`
- Rate limiting : 300 req/15min global · 10/15min par IP pour `/login`
- Audit immuable (protégé au niveau base de données)

### Temps réel

- Notifications in-app via **Socket.io** — badge live dans la Topbar
- Événement `notification:new` invalide le cache TanStack Query
- Jobs BullMQ : relances escaladées J+0/7/15/30, facturation récurrente, marquage en retard, backup automatique

### Recherche globale

- Barre de recherche dans la Topbar (debounced 280ms)
- Résultats groupés : Clients, Factures, Proformas, Produits
- Navigation clavier ↑↓ / Entrée / Échap
- NLP côté backend : requêtes en langage naturel (`"Camtel mars 2026"`, `"impayé > 500000"`)

### Responsive

- **≥ 1024px** — Sidebar fixe, collapsible (64px icônes / 240px complet), état persisté en `localStorage`
- **< 1024px** — Sidebar masquée, accessible via bouton hamburger (overlay avec backdrop)

---

## RBAC

| Rôle | Accès |
|---|---|
| `admin` | Accès complet + utilisateurs + audit + paramètres + backups |
| `commercial` | CRUD documents + clients + produits + paiements |
| `employee` | Lecture seule |

---

## Charte graphique

| Élément | Couleur |
|---|---|
| Sidebar | `#0c2340` / `#0f2d4a` |
| Primaire | `#2D7DD2` |
| Fond | `#f0f4f9` |
| Surface | `#ffffff` |

**Statuts des documents :**

| Statut | Couleur |
|---|---|
| Brouillon | Gris `#94a3b8` |
| Émise | Bleu `#3b82f6` |
| Payée | Vert `#16a34a` |
| Partiellement payée | Orange `#d97706` |
| En retard | Rouge `#dc2626` |
| Annulée | Gris foncé `#64748b` |
| Acceptée (proforma) | Émeraude `#10b981` |
| Rejetée (proforma) | Rose `#f43f5e` |
| Expirée (proforma) | Violet `#9333ea` |

**Polices :** Sora (display) · DM Sans (corps) · JetBrains Mono (montants, numéros)

---

## Scripts

### Backend

```bash
pnpm dev              # Hot reload (tsx watch)
pnpm build            # Compilation TypeScript → dist/
pnpm start            # Serveur de production compilé

pnpm prisma:generate  # Générer le client Prisma
pnpm prisma:push      # Synchroniser schéma avec la DB (dev)
pnpm prisma:migrate   # Créer une migration (prod)
pnpm prisma:studio    # Interface graphique DB
```

### Frontend

```bash
pnpm dev              # Serveur de développement (Turbopack)
pnpm build            # Build de production (output: standalone)
pnpm start            # Serveur de production
pnpm lint             # ESLint
```

---

## Déploiement Docker

Le `docker-compose.yml` dans `bridge-backend/` orchestre **5 services** :

```
PostgreSQL 15  →  interne Docker (pas exposé)
Redis 7        →  interne Docker (pas exposé)
Ollama         →  interne Docker (modèles dans volume ollama_data)
API Express    →  http://SERVER_IP:3000
Frontend Next  →  http://SERVER_IP:3001
```

Toutes les URLs réseau sont construites automatiquement depuis `SERVER_IP` défini dans `.env` — pas besoin de modifier `docker-compose.yml`.

```bash
# Déploiement complet via le script (recommandé)
deploy.bat

# Ou manuellement
cd bridge-backend
docker-compose up --build -d

# Vérifier les logs
docker-compose logs -f api
docker-compose logs -f frontend
docker-compose logs -f ollama

# Arrêter
docker-compose down
```

---

## Règles métier SYSCOHADA

| Règle | Implémentation |
|---|---|
| Numérotation sans trou | `fn_next_document_number()` PostgreSQL `FOR UPDATE` |
| Format numéro | `BTS/{BUREAU}/{AAAA}/{MM}/{FAC\|PFM\|ACP\|AVO}###` |
| Snapshots prix | Lignes copiées du catalogue à la création — jamais recalculées |
| Avoir automatique | Généré dans la même transaction que l'annulation |
| Soft-delete universel | `deleted_at` timestamp, jamais de DELETE physique |
| Audit immuable | Règle PostgreSQL : pas d'UPDATE/DELETE sur `audit_logs` |
| Acompte/Solde | Facture acompte (%) + facture solde liées à la même commande |

---

## Base de données

Schéma PostgreSQL complet dans `invoicehub_schema_v2.sql` (1 328 lignes).

**Initialisation manuelle :**
```bash
psql -U postgres -d invoicehub -f invoicehub_schema_v2.sql
```

**Extensions requises :** `uuid-ossp` · `pgcrypto` · `unaccent`

**Domaines logiques :**
1. Système / Sécurité — `company_settings`, `agency_offices`, `tax_rates`, `users`, `refresh_tokens`, `login_history`, `password_reset_tokens`
2. Entités métier — `clients`, `product_categories`, `products`, `document_sequences`
3. Proformas — `proformas`, `proforma_lines`, `proforma_status_history`
4. Factures — `invoices`, `invoice_lines`, `invoice_status_history`, `payments`
5. Modules transverses — récurrentes, notifications, templates email, audit, backups

---

*InvoiceHub v2.0 — Bridge Technologies Solutions — Douala, Cameroun*
*Conforme SYSCOHADA · Devise XAF (Franc CFA) · TVA 19,25 %*
