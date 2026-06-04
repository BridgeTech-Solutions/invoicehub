# InvoiceHub v2.0 — Bridge Technologies Solutions

Plateforme ERP interne pour **BTS (Bridge Technologies Solutions)**, Douala, Cameroun.  
Conforme **SYSCOHADA** · Devise **XAF (Franc CFA)** · TVA **19,25 %**

---

## Structure du monorepo

```
BRIDGE/
├── invoicehub-api/          # API REST — NestJS 11 + TypeScript + Prisma (actif)
├── bridge-backend/          # Ancienne API Express (remplacée par invoicehub-api)
├── bridge-frontend/         # Interface web — Next.js 15 + TypeScript + Tailwind 4
├── nginx/                   # Reverse proxy — Nginx + SSL
├── invoicehub_schema_v3.sql # Schéma PostgreSQL complet (init DB)
├── docker-compose.yml       # Orchestration production
├── docker-compose.dev.yml   # Override développement (ports exposés, hot-reload)
├── .env.example             # Template variables d'environnement
├── deploy.bat               # Script déploiement Windows automatisé
└── DEPLOY_WINDOWS_SERVER.md # Guide déploiement Windows Server
```

---

## Stack technique

| Couche | Backend (`invoicehub-api`) | Frontend (`bridge-frontend`) |
|---|---|---|
| Langage | TypeScript 5 | TypeScript 5 |
| Framework | NestJS 11 | Next.js 15 (App Router) |
| ORM | Prisma 5 | TanStack Query v5 |
| Base de données | PostgreSQL 15 | — |
| Cache / Queues | Redis 7 + BullMQ | — |
| Auth | JWT access 15 min + refresh 7 j | Zustand + Axios intercepteurs |
| 2FA | TOTP (otplib) + 8 codes de secours | QR code setup |
| Temps réel | Socket.io + Redis adapter | Socket.io Client |
| Styles | — | Tailwind CSS 4 + CSS variables |
| Graphiques | — | Recharts 2 |
| PDF | Puppeteer (Chromium headless) | Téléchargement direct |
| Email | Nodemailer | — |
| IA locale | Ollama (phi3:mini) | Assistant BTS streaming |
| Conteneurs | Docker + Docker Compose v2 | Multi-stage Dockerfile |
| Package manager | pnpm | pnpm |

---

## Modules Backend (`invoicehub-api/src/modules/`)

| Module | Fonctionnalités clés |
|---|---|
| `auth` | Login, refresh, 2FA TOTP, sessions, reset-password, backup codes |
| `users` | CRUD + avatar + gestion de profil |
| `clients` | CRUD + résumé financier + quick-fill + import CSV |
| `suppliers` | CRUD fournisseurs + coordonnées bancaires + historique achats |
| `products` | Catalogue + catégories + prix + TVA par ligne |
| `proformas` | Devis — cycle `draft→sent→accepted/rejected/expired` + PDF + duplication |
| `invoices` | Factures — `standard`, `acompte`, `solde`, `avoir` auto + PDF + duplication |
| `payments` | Paiements + recalcul solde automatique |
| `purchase-orders` | Bons de commande — cycle `draft→approved→ordered→received→billed` |
| `supplier-invoices` | Factures fournisseurs + rapprochement BC + paiements |
| `expenses` | Notes de frais + catégories + budgets + workflow approbation |
| `stock` | Inventaire + mouvements + niveaux + alertes + CMUP automatique |
| `recurring` | Templates facturation récurrente (cron BullMQ) |
| `bank-accounts` | Comptes bancaires BTS multi-banques |
| `bank` | Import relevés + transactions + rapprochements + règles matching |
| `accounting` | Plan comptable SYSCOHADA + journaux + écritures + lettrage + TVA |
| `approvals` | Workflow d'approbation multi-niveaux |
| `notifications` | In-app + préférences + Socket.io temps réel |
| `dashboard` | KPIs + aging + cache Redis 5 min |
| `reports` | Rapports financiers + export CSV |
| `settings` | Paramètres entreprise + bureaux + taux TVA + templates email |
| `audit` | Journal immuable + export CSV |
| `search` | Recherche globale intelligente multi-entités |
| `backups` | pg_dump + stockage local / S3 / Azure / OneDrive |
| `ai` | BTS Assistant (Ollama streaming) |

---

## Architecture Frontend (`bridge-frontend/src/`)

```
app/
├── (auth)/
│   ├── login/               # Terminal BTS — panneau données live + formulaire
│   ├── 2fa/                 # Vérification TOTP / code de secours
│   └── reset-password/      # Mot de passe oublié + réinitialisation
└── (dashboard)/             # AppShell — Sidebar + Topbar + OverlaySubNav
    ├── dashboard/           # KPIs · graphiques CA · aging créances
    ├── clients/             # Liste · détail · nouveau · édition
    ├── suppliers/           # Liste · détail · nouveau · édition
    ├── products/            # Catalogue · catégories
    ├── proformas/           # Liste · détail · nouveau · édition
    ├── invoices/            # Liste · détail · nouveau · édition
    ├── payments/            # Liste · nouveau paiement
    ├── recurring/           # Templates récurrents
    ├── purchase-orders/     # Liste · détail · nouveau · édition
    ├── supplier-invoices/   # Liste · détail · nouveau · édition
    ├── expenses/            # Liste (3 tabs) · détail · nouveau · édition
    │   ├── categories/      # Gestion des catégories avec palette couleur
    │   └── budgets/         # Budgets annuels/mensuels avec progress bars
    ├── stock/               # Inventaire · mouvements · niveaux · alertes
    ├── bank/                # Comptes · import · transactions · rapprochements
    ├── accounting/          # Plan comptable · journaux · écritures · lettrage
    ├── reports/             # Rapports financiers
    ├── approvals/           # Workflow approbation
    ├── notifications/       # Centre de notifications
    ├── users/               # Gestion utilisateurs (admin)
    ├── audit/               # Journal d'audit (admin)
    └── settings/            # Paramètres entreprise + sécurité + intégrations

features/                    # Logique métier feature-based (api + hooks + types)
components/
├── layout/                  # AppShell · Sidebar · Topbar · OverlaySubNav
├── ui/                      # CompanyLogo · GlobalSearch
└── feedback/                # TablePageSkeleton · RouteError · StatusBadge
store/                       # auth (Zustand) · sidebar (collapsed + overlay)
```

---

## Fonctionnalités principales

### Documents SYSCOHADA

- **Numérotation atomique** — `fn_next_document_number()` PostgreSQL (`SELECT FOR UPDATE`, sans trou)
  - Format : `BTS/{BUREAU}/{AAAA}/{MM}/FAC###` · `PFM###` · `ACP###` · `AVO###`
- **Proformas** — `draft → sent → accepted / rejected / expired` → conversion en facture
- **Factures** — `standard`, `acompte`, `solde`, `avoir` (auto-généré à l'annulation)
- **PDF** — généré côté serveur (Puppeteer) avec logo, cachet BTS, coordonnées bancaires
- **Duplication** — tout document devient brouillon modifiable

### Achats & Dépenses

- **Bons de commande** — cycle complet avec approbation et réception partielle
- **Factures fournisseurs** — rapprochement BC, paiements multiples, suivi balance dûe
- **Notes de frais** — workflow `draft→submitted→approved→paid`, catégories colorées, budgets mensuels/annuels avec alertes dépassement

### Stock & Produits

- Inventaire multi-entrepôt, mouvements (entrée/sortie/ajustement/transfert)
- CMUP automatique, niveaux min/max, alertes stock critique
- Historique complet des mouvements par produit

### Banque & Comptabilité

- Import de relevés bancaires (CSV/OFX), matching automatique via règles configurables
- Rapprochements bancaires avec résidu non rapproché
- Plan comptable SYSCOHADA, journaux, écritures, lettrage, déclarations TVA
- Export Sage

### Authentification & Sécurité

- Login + **2FA TOTP** (Google Authenticator, Authy) + 8 codes de secours
- Refresh token automatique avec rotation, gestion des sessions actives
- RBAC : `admin` > `commercial` > `employee`
- Rate limiting · Audit immuable (protégé au niveau PostgreSQL)

### Interface

- **Sidebar** rétractable avec sections et OverlaySubNav (panels Bank, Comptabilité, Stock, Dépenses, Rôles, Paramètres)
- **Recherche globale** intelligente avec parser langage naturel, keyboard nav, groupée par entité
- **Pages auth** : design Terminal BTS (Bloomberg × Palantir) — JetBrains Mono + Bricolage Grotesque
- Dark/Light mode, responsive mobile

### Temps réel & Jobs (BullMQ)

- Notifications in-app via **Socket.io** — badge live dans la Topbar
- Relances escaladées J+0/7/15/30 automatiques
- Facturation récurrente automatique (cron 00:10 UTC)
- Backup automatique planifié

---

## RBAC

| Rôle | Accès |
|---|---|
| `admin` | Accès complet — utilisateurs, audit, paramètres, backups, rôles |
| `commercial` | CRUD documents + clients + fournisseurs + produits + paiements + achats |
| `employee` | Lecture + notes de frais personnelles |

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
| CMUP stock | Recalculé à chaque entrée — jamais stocké de façon permanente |

---

## Charte graphique (Dashboard)

| Élément | Valeur |
|---|---|
| Sidebar | `#0f2d4a` (navy) |
| Primaire | `#2D7DD2` (bleu BTS) |
| Fond | `#f5f7fa` |
| Font display | Sora |
| Font body | DM Sans |
| Font mono | JetBrains Mono |

**Pages auth** : fond `#070B11`, accent `#00BFFF`, fonts Bricolage Grotesque + JetBrains Mono

---

## Variables d'environnement

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DB_PASSWORD` | Mot de passe PostgreSQL |
| `JWT_ACCESS_SECRET` | Clé JWT access token (min 32 car.) |
| `JWT_REFRESH_SECRET` | Clé JWT refresh token (min 32 car.) |
| `APP_URL` | URL publique du frontend |
| `BACKEND_URL` | URL publique de l'API |
| `NEXT_PUBLIC_API_URL` | URL API vue depuis le navigateur |
| `NEXT_PUBLIC_SOCKET_URL` | URL Socket.io vue depuis le navigateur |
| `REDIS_URL` | URL Redis (`redis://localhost:6379`) |
| `SMTP_*` | Configuration email Nodemailer |
| `OLLAMA_URL` | URL Ollama pour BTS Assistant |

---

## Déploiement

Voir **[DEPLOY_WINDOWS_SERVER.md](./DEPLOY_WINDOWS_SERVER.md)** pour le guide complet.

```bash
# Production — script automatisé (Windows)
deploy.bat

# Avec BTS Assistant (Ollama)
deploy.bat --with-ollama
```

---

*InvoiceHub v2.0 — Bridge Technologies Solutions — Douala, Cameroun*  
*Conforme SYSCOHADA · XAF (Franc CFA) · TVA 19,25 %*
