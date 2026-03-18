# InvoiceHub v2.0 — Frontend

Interface de gestion de facturation pour **Bridge Technologies Solutions (BTS)**, Douala, Cameroun.
Plateforme interne conforme **SYSCOHADA** — accès employés uniquement.

---

## Stack Technique

| Rôle | Technologie | Version |
|---|---|---|
| Framework | Next.js (App Router) | 15 |
| Langage | TypeScript (strict) | 5.7 |
| Styles | Tailwind CSS | 4 |
| Composants UI | Radix UI + shadcn/ui | latest |
| État serveur | TanStack Query | 5 |
| État UI | Zustand | 5 |
| Formulaires | React Hook Form + Zod | 7 / 3 |
| HTTP | Axios | 1.7 |
| Graphiques | Recharts | 2 |
| Temps réel | Socket.io Client | 4 |
| Icônes | Lucide React | 0.468 |
| Toasts | Sonner | 1.7 |
| Dates | date-fns | 4 |
| Package manager | pnpm | 9 |

---

## Prérequis

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm install -g pnpm`)
- Backend InvoiceHub (`bridge-backend/`) en cours d'exécution sur le port **3000**

---

## Installation

```bash
# 1. Cloner le repo et se placer dans le dossier
cd bridge-frontend

# 2. Installer les dépendances
pnpm install

# 3. Configurer les variables d'environnement
cp .env.local.example .env.local
# Éditer .env.local si besoin (voir section Variables d'environnement)

# 4. Lancer le serveur de développement
pnpm dev
```

L'application est accessible sur [http://localhost:3001](http://localhost:3001).

---

## Variables d'Environnement

Fichier `.env.local` à créer à la racine (copier depuis `.env.local.example`) :

```env
# URL de base de l'API REST (backend Express)
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# URL du serveur Socket.io (pour les notifications temps réel)
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000

# Nom de l'application (affiché dans les métadonnées)
NEXT_PUBLIC_APP_NAME=InvoiceHub
```

> **Note** : Toutes les variables préfixées `NEXT_PUBLIC_` sont exposées côté client.

---

## Scripts

```bash
pnpm dev        # Serveur de développement (Turbopack)
pnpm build      # Build de production (output: standalone)
pnpm start      # Serveur de production
pnpm lint       # ESLint
```

---

## Architecture

```
bridge-frontend/
├── docker/
│   └── Dockerfile              # Build multi-stage Node 20 Alpine
│
├── public/
│   └── logos/                  # Logos BTS (blanc, bleu, gris, noir)
│
└── src/
    ├── app/                    # Next.js App Router
    │   ├── (auth)/             # Pages non authentifiées
    │   │   ├── login/          # Connexion (layout split navy + formulaire)
    │   │   ├── 2fa/            # Étape TOTP après login
    │   │   └── reset-password/ # Réinitialisation mot de passe
    │   │
    │   ├── (dashboard)/        # Pages protégées (AppShell : Sidebar + Topbar)
    │   │   ├── layout.tsx
    │   │   ├── loading.tsx     # Skeleton global fallback
    │   │   ├── error.tsx       # Error boundary global
    │   │   ├── dashboard/      # Tableau de bord — KPIs, graphiques, tables
    │   │   ├── clients/        # CRUD clients + détail financier
    │   │   ├── products/       # Produits & Services + catégories
    │   │   ├── proformas/      # Cycle de vie proformas + PDF
    │   │   ├── invoices/       # Factures (standard/acompte/solde/avoir) + PDF
    │   │   ├── payments/       # Liste globale des paiements
    │   │   ├── recurring/      # Templates de facturation récurrente
    │   │   ├── notifications/  # Centre de notifications
    │   │   ├── users/          # Gestion utilisateurs (admin+commercial)
    │   │   ├── audit/          # Journaux d'audit (admin uniquement)
    │   │   ├── profile/        # Profil, mot de passe, 2FA, sessions
    │   │   ├── reports/        # Rapports & exports
    │   │   └── settings/       # Paramètres (5 onglets)
    │   │       ├── company/    # Identité légale + branding + finances
    │   │       ├── billing/    # TVA + séquences SYSCOHADA + bureaux
    │   │       ├── security/   # Sessions actives + 2FA entreprise
    │   │       ├── notifications/ # Préférences + templates email + rappels
    │   │       └── backups/    # Sauvegardes PostgreSQL
    │   │
    │   ├── global-error.tsx    # Erreur fatale (HTML standalone)
    │   ├── not-found.tsx       # Page 404 custom
    │   ├── layout.tsx          # Root layout (Providers)
    │   └── globals.css         # Tokens CSS + Tailwind base + responsive
    │
    ├── components/
    │   ├── layout/
    │   │   ├── AppShell.tsx    # Wrapper Sidebar + Topbar + main
    │   │   ├── Sidebar.tsx     # Navigation latérale (collapsible + overlay mobile)
    │   │   ├── Topbar.tsx      # Barre haute (breadcrumb + recherche + notifs)
    │   │   └── PageHeader.tsx  # Titre de page + actions
    │   ├── document/
    │   │   ├── LineItemsEditor.tsx  # Éditeur lignes produits/services
    │   │   └── TotalsPanel.tsx      # Panel HT / TVA / TTC
    │   ├── feedback/
    │   │   ├── TablePageSkeleton.tsx  # Skeleton réutilisable (loading.tsx)
    │   │   └── RouteError.tsx         # Composant erreur par route
    │   ├── forms/              # FormField, CurrencyInput
    │   ├── data-table/         # DataTable TanStack générique
    │   └── modals/             # ConfirmDialog, ActionSheet
    │
    ├── features/               # Logique métier feature-based
    │   ├── auth/               # Login, 2FA, sessions, store Zustand
    │   ├── dashboard/          # KPIs, graphiques Recharts
    │   ├── clients/            # CRUD + résumé financier
    │   ├── products/           # CRUD + catégories
    │   ├── proformas/          # CRUD + cycle de vie + PDF
    │   ├── invoices/           # CRUD + acompte/solde/avoir + PDF
    │   ├── payments/           # Liste + suppression
    │   ├── recurring/          # Templates récurrents
    │   ├── notifications/      # In-app + Socket.io
    │   ├── users/              # CRUD + avatar + 2FA
    │   ├── audit/              # Logs + stats + export CSV
    │   ├── settings/           # Paramètres entreprise + assets
    │   ├── tax-rates/          # CRUD taux TVA
    │   ├── offices/            # CRUD bureaux/agences
    │   ├── email-templates/    # CRUD + variables disponibles
    │   ├── backups/            # Déclencher + télécharger + supprimer
    │   └── search/             # Recherche globale (debounced)
    │
    ├── hooks/
    │   ├── useAuth.ts          # Redirection si non authentifié
    │   ├── usePermission.ts    # can('invoice', 'create') par rôle
    │   ├── useSocket.ts        # Socket.io via context
    │   ├── useDebounce.ts      # Debounce valeur React
    │   └── useLocalStorage.ts  # SSR-safe localStorage
    │
    ├── store/
    │   ├── auth.ts             # Re-export de features/auth/store
    │   └── sidebar.ts          # collapsed + mobileOpen (persisté)
    │
    ├── providers/
    │   ├── QueryProvider.tsx   # TanStack Query
    │   ├── SocketProvider.tsx  # Socket.io context
    │   └── ToastProvider.tsx   # Sonner toasts
    │
    ├── lib/
    │   ├── api-client.ts       # Axios + intercepteurs JWT + refresh auto
    │   ├── query-client.ts     # Config TanStack Query (staleTime 2min)
    │   ├── document-math.ts    # Calculs lignes + totaux HT/TTC (source unique)
    │   ├── constants.ts        # ROUTES, ROLES, STATUS_LABELS
    │   └── utils.ts            # cn(), formatXAF(), formatDate(), getInitials()
    │
    └── types/
        └── api.ts              # Types génériques réponses API paginées
```

---

## Charte Graphique

```
Sidebar navy   #0f2d4a
Primaire       #2D7DD2   (boutons, accents, liens actifs)
Fond           #f5f7fa
Surface card   #ffffff
Bordure        #e5e9ef
```

**Statuts des documents :**

| Statut | Couleur |
|---|---|
| Brouillon | Gris `#94a3b8` |
| Émise / Envoyée | Bleu `#3b82f6` |
| Payée | Vert `#22c55e` |
| Part. payée | Orange `#f59e0b` |
| En retard | Rouge `#ef4444` |
| Annulée | Gris foncé `#6b7280` |
| Acceptée | Émeraude `#10b981` |
| Rejetée | Rose `#f43f5e` |

---

## Fonctionnalités Principales

### Authentification
- Login email/mot de passe avec gestion d'erreur
- **2FA TOTP** (Google Authenticator, Authy) — codes de secours
- Refresh automatique du JWT (intercepteur Axios transparent)
- Gestion des sessions actives (révocation individuelle et globale)

### Documents SYSCOHADA
- **Numérotation atomique** via `fn_next_document_number()` côté PostgreSQL
  - Format : `BTS/{BUREAU}/{ANNÉE}/{MOIS}/FAC###` ou `PFM###`
- **Proformas** — cycle complet : brouillon → envoyé → accepté/rejeté → converti en facture
- **Factures** — standard, acompte, solde, avoir (généré automatiquement à l'annulation)
- **Calcul des totaux** en temps réel (HT, remise, TVA, TTC) — source unique dans `document-math.ts`
- **Génération PDF** et téléchargement côté backend (puppeteer)
- **Duplication** de documents existants

### Tableau de bord
- 4 KPI cards (CA du mois, factures émises, créances, retards)
- Graphique évolution CA (Recharts Line) — toggle mois/trimestre/année
- Donut statuts factures (Recharts Pie)
- Tables récentes (5 dernières factures + top 5 clients)

### Notifications temps réel
- Badge live dans la Topbar et la Sidebar (`useUnreadCount`)
- Socket.io — événement `notification:new` invalide le cache TanStack Query
- Centre de notifications avec onglets Toutes / Non lues

### Recherche globale
- Barre de recherche dans la Topbar (debounced 280ms)
- Dropdown résultats groupés : Clients, Factures, Proformas, Produits
- Navigation clavier (↑↓ / Entrée / Échap)

### Paramètres avancés
- Upload logo, en-tête PDF, pied de page, cachet, signature
- Gestion des taux TVA (CRUD inline)
- Gestion des bureaux/agences avec code SYSCOHADA
- Preview des séquences de numérotation par bureau
- Templates emails HTML (sujet + corps + variables disponibles)
- Niveaux d'escalade des rappels de retard (configurables)
- Sauvegardes PostgreSQL (déclencher / télécharger / supprimer)

### RBAC
| Rôle | Accès |
|---|---|
| `admin` | Accès complet + utilisateurs + audit + paramètres |
| `commercial` | CRUD documents + clients + produits + paiements |
| `employee` | Lecture seule |

---

## Architecture des Données

### Couche API (Axios)

```typescript
// src/lib/api-client.ts
// Request interceptor  → injecte Authorization: Bearer <accessToken>
// Response interceptor → 401 : refresh token automatique + retry
//                      → 403 : redirect /login
```

Chaque module `feature/` expose :
- `api.ts` — fonctions asynchrones appelant `apiClient`
- `hooks.ts` — hooks TanStack Query (`useQuery`, `useMutation`)
- `types.ts` — interfaces TypeScript alignées sur l'API

### Types partagés

`FormLine` et `DocumentTotals` ont une **source unique de vérité** dans
`src/features/proformas/types.ts` — réexportés depuis `invoices/types.ts`.

```typescript
// invoices/types.ts
export type { FormLine, DocumentTotals, DiscountType } from '@/features/proformas/types'
```

---

## Déploiement Docker

### Build et lancement avec Docker Compose

```bash
# Depuis bridge-backend/ (contient le docker-compose.yml complet)
docker-compose up --build

# Services :
#   db       → PostgreSQL 15     localhost:5432
#   redis    → Redis 7           localhost:6379
#   api      → API REST          http://localhost:3000
#   frontend → Next.js           http://localhost:3001
```

### Build frontend seul

```bash
# Depuis bridge-frontend/
docker build \
  -f docker/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://api:3000/api \
  --build-arg NEXT_PUBLIC_SOCKET_URL=http://api:3000 \
  -t invoicehub-frontend .

docker run -p 3001:3001 invoicehub-frontend
```

### Build de production (sans Docker)

```bash
pnpm build
pnpm start
# → http://localhost:3001
```

---

## Conventions de Code

### Nommage
- **Pages** : `page.tsx` — Server Component par défaut, `'use client'` si état/hooks
- **Composants** : PascalCase, colocalisés dans leur feature (`features/*/components/`)
- **Hooks** : préfixe `use`, colocalisés dans leur feature (`features/*/hooks.ts`)

### Formatage des données métier

```typescript
// Montants — toujours via formatXAF()
formatXAF(1_200_000)   // → "1 200 000 XAF"

// Dates — toujours via formatDate()
formatDate('2026-03-16')  // → "16 mars 2026"

// Numéros de document — affichés tels quels en font-mono
// BTS/DC/2026/03/FAC001
```

### Pattern Query Keys

```typescript
// Tous les hooks TanStack Query suivent ce pattern :
queryKey: ['invoices', 'list', filters]   // liste
queryKey: ['invoices', 'detail', id]      // détail
queryKey: ['invoices', 'pdf', id]         // ressource dérivée
```

---

## Responsive

- **≥ 1024px (desktop)** — Sidebar fixe, collapsible (64px icônes seules / 240px complet)
- **< 1024px (tablette/mobile)** — Sidebar masquée, accessible via bouton hamburger (overlay avec backdrop)
- Collapsed state persisté dans `localStorage` via Zustand

---

## Connexion au Backend

Le backend doit être lancé et accessible avant de démarrer le frontend.
Voir [`bridge-backend/README.md`](../bridge-backend/README.md) pour les instructions.

```bash
# Démarrage rapide backend (depuis bridge-backend/)
docker-compose up db redis -d   # PostgreSQL + Redis
pnpm dev                         # API sur http://localhost:3000
```

---

*InvoiceHub v2.0 — Bridge Technologies Solutions — Douala, Cameroun*
*Conforme SYSCOHADA · Devise XAF (Franc CFA)*
