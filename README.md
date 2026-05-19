# InvoiceHub v2.0 — Bridge Technologies Solutions

Plateforme de gestion de facturation entreprise pour **BTS (Bridge Technologies Solutions)**, Douala, Cameroun.
Conforme **SYSCOHADA** · Devise **XAF (Franc CFA)** · TVA **19,25 %**

---

## Structure du monorepo

```
BRIDGE/
├── invoicehub-api/          # API REST — NestJS 11 + TypeScript + Prisma
├── bridge-frontend/         # Interface web — Next.js 15 + TypeScript + Tailwind
├── nginx/                   # Reverse proxy — Nginx + SSL
├── invoicehub_schema_v3.sql # Schéma PostgreSQL complet (init DB)
├── docker-compose.yml       # Orchestration production (db, redis, api, frontend, ollama)
├── docker-compose.dev.yml   # Override développement (ports exposés, hot-reload)
├── .env.example             # Template variables d'environnement
├── deploy.bat               # Script de déploiement Windows automatisé
└── DEPLOIEMENT.md           # Guide de déploiement pas-à-pas
```

---

## Stack technique

| Couche | Backend | Frontend |
|---|---|---|
| Langage | TypeScript 5 | TypeScript 5 |
| Framework | NestJS 11 | Next.js 15 (App Router) |
| ORM | Prisma 5 | TanStack Query v5 |
| Base de données | PostgreSQL 15 | — |
| Cache / Queues | Redis 7 + BullMQ | — |
| Auth | JWT access 15m + refresh 7j | Zustand + Axios intercepteurs |
| 2FA | TOTP (otplib) + 8 codes de secours | QR code setup |
| Temps réel | Socket.io + Redis adapter | Socket.io Client |
| Styles | — | Tailwind CSS 4 |
| Graphiques | — | Recharts 2 |
| PDF | Puppeteer (Chromium headless) | Téléchargement |
| Email | Nodemailer | — |
| IA locale | Ollama (phi3:mini) | Assistant BTS streaming |
| Conteneurs | Docker + Docker Compose v2 | Multi-stage Dockerfile |
| Package manager | pnpm | pnpm |

---

## Variables d'environnement

Un seul fichier `.env` à la **racine du projet** sert de source de vérité pour tous les services.

```bash
# Copier le template et remplir les valeurs
cp .env.example .env
```

**Variables obligatoires :**

| Variable | Description |
|---|---|
| `DB_PASSWORD` | Mot de passe PostgreSQL |
| `JWT_ACCESS_SECRET` | Clé JWT access token (min 32 caractères) |
| `JWT_REFRESH_SECRET` | Clé JWT refresh token (min 32 caractères) |
| `APP_URL` | URL publique du frontend |
| `BACKEND_URL` | URL publique de l'API |
| `NEXT_PUBLIC_API_URL` | URL API vue depuis le navigateur |
| `NEXT_PUBLIC_SOCKET_URL` | URL Socket.io vue depuis le navigateur |

En développement local, `DATABASE_URL` et `REDIS_URL` doivent aussi pointer sur `localhost`.
Voir `.env.example` pour la liste complète avec commentaires.

---

## Architecture API (`invoicehub-api/`)

```
src/
├── main.ts                  # Bootstrap NestJS
├── app.module.ts            # Module racine — imports globaux
├── config/
│   └── env.validation.ts    # Validation Zod des variables d'environnement
├── common/
│   ├── decorators/          # @CurrentUser, @Roles, @Public
│   ├── guards/              # JwtAuthGuard (global), RolesGuard (global)
│   ├── filters/             # GlobalExceptionFilter
│   └── types/               # JwtPayload, Express.User augmentation
├── gateway/                 # Socket.io WebSocket Gateway
├── jobs/                    # BullMQ queues, workers, processors, scheduler
└── modules/
    ├── auth/                # Login, refresh, 2FA TOTP, sessions, reset-password
    ├── users/               # CRUD + avatar
    ├── clients/             # CRUD + résumé financier + quick-fill + import CSV
    ├── products/            # Catalogue + catégories
    ├── proformas/           # Devis — cycle complet + PDF + duplication
    ├── invoices/            # Factures — standard/acompte/solde/avoir + PDF
    ├── payments/            # Paiements + recalcul solde
    ├── recurring/           # Templates facturation récurrente
    ├── notifications/       # In-app + préférences + Socket.io
    ├── dashboard/           # KPIs + aging + cache Redis 5min
    ├── settings/            # Paramètres entreprise
    ├── audit/               # Journal immuable + export CSV
    ├── search/              # Recherche globale intelligente
    ├── reports/             # Rapports financiers + export CSV
    ├── tax-rates/           # CRUD taux TVA
    ├── offices/             # CRUD bureaux/agences
    ├── email-templates/     # Templates HTML configurables
    ├── backups/             # pg_dump + stockage local/S3/GCS/Azure/OneDrive
    ├── bank-accounts/       # Comptes bancaires BTS
    └── ai/                  # BTS Assistant (Ollama)
```

## Architecture Frontend (`bridge-frontend/`)

```
src/
├── app/
│   ├── (auth)/              # login · 2fa · reset-password
│   └── (dashboard)/         # Pages protégées — AppShell
│       ├── dashboard/ · clients/ · products/ · proformas/ · invoices/
│       ├── payments/ · recurring/ · notifications/ · users/ · audit/
│       ├── profile/ · reports/ · settings/
├── components/
│   ├── layout/              # AppShell · Sidebar · Topbar
│   ├── document/            # LineItemsEditor · TotalsPanel
│   └── feedback/            # TablePageSkeleton · RouteError · StatusBadge
├── features/                # Logique métier feature-based
├── hooks/                   # useAuth · usePermission · useSocket · useDebounce
├── store/                   # auth (Zustand) · sidebar
├── providers/               # QueryProvider · SocketProvider · ToastProvider
└── lib/                     # api-client · document-math · utils
```

---

## Fonctionnalités principales

### Documents SYSCOHADA

- **Numérotation atomique** — `fn_next_document_number()` PostgreSQL (SELECT FOR UPDATE, sans trou)
  - Format : `BTS/{BUREAU}/{AAAA}/{MM}/FAC###` · `PFM###` · `ACP###` · `AVO###`
- **Proformas** — `draft → sent → accepted / rejected / expired` → conversion en facture
- **Factures** — `standard`, `acompte`, `solde`, `avoir` (généré automatiquement à l'annulation)
- **PDF** — généré côté serveur (Puppeteer) avec logo, cachet et coordonnées bancaires
- **Duplication** — tout document devient brouillon modifiable

### Comptes bancaires

- Module `bank-accounts` — comptes BTS multi-banques
- Sélection du compte de réception sur chaque facture/proforma (affiché sur le PDF)
- Compte par défaut auto-sélectionné à la création

### Tableau de bord

- 4 KPI cards (CA du mois, factures émises, créances, retards) — cache Redis 5 min
- Graphique CA 12 mois (Recharts) · Donut statuts · Aging créances
- Top 5 clients + 5 dernières factures

### Authentification & Sécurité

- Login + **2FA TOTP** (Google Authenticator, Authy) + 8 codes de secours
- Refresh token automatique avec rotation, gestion des sessions actives
- RBAC : `admin` > `commercial` > `employee`
- Rate limiting · Audit immuable (protégé au niveau PostgreSQL)

### Temps réel & Jobs

- Notifications in-app via **Socket.io** — badge live dans la Topbar
- **BullMQ** : relances escaladées J+0/7/15/30, facturation récurrente, backup automatique
- Emails internes BTS avec liens directs vers les documents

---

## RBAC

| Rôle | Accès |
|---|---|
| `admin` | Accès complet + utilisateurs + audit + paramètres + backups |
| `commercial` | CRUD documents + clients + produits + paiements |
| `employee` | Lecture seule |

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
| Acompte/Solde | Facture acompte (%) + facture solde liées par `parent_invoice_id` |

---

## Charte graphique

| Élément | Couleur |
|---|---|
| Sidebar | `#0f2d4a` |
| Primaire | `#2D7DD2` |
| Fond | `#f5f7fa` |

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

---

## Déploiement

Voir **[DEPLOIEMENT.md](./DEPLOIEMENT.md)** pour le guide complet développement et production.

```bash
# Production — script automatisé (Windows)
deploy.bat

# Production + BTS Assistant (Ollama)
deploy.bat --with-ollama

# Passer les vérifications TypeScript
deploy.bat --skip-tests
```

---

*InvoiceHub v2.0 — Bridge Technologies Solutions — Douala, Cameroun*
*Conforme SYSCOHADA · Devise XAF (Franc CFA) · TVA 19,25 %*
