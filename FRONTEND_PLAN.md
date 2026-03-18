# InvoiceHub v2.0 — Plan Frontend (Next.js)

> Plateforme de facturation entreprise pour Bridge Technologies Solutions (BTS), Douala, Cameroun.
> Conforme SYSCOHADA. Frontend interne (accès employés uniquement).

---

## 1. Stack Technique

| Rôle | Package | Version |
|---|---|---|
| Framework | `next` | 15 (App Router) |
| Language | `typescript` | 5+ |
| Styles | `tailwindcss` | 4 |
| Composants UI | `shadcn/ui` | latest |
| Icônes | `lucide-react` | latest |
| État serveur | `@tanstack/react-query` | 5 |
| État UI global | `zustand` | 5 |
| Formulaires | `react-hook-form` + `zod` | latest |
| HTTP client | `axios` | latest |
| Graphiques | `recharts` | 2 |
| Temps réel | `socket.io-client` | 4 |
| PDF viewer | `react-pdf` | 7 |
| Dates | `date-fns` | 3 |
| Tableaux | `@tanstack/react-table` | 8 |
| Toasts | `sonner` | latest |

---

## 2. Charte Graphique (d'après maquettes)

### Couleurs principales

```css
/* tokens CSS dans globals.css */
--color-sidebar-bg:     #0f2d4a;   /* Sidebar fond navy foncé */
--color-sidebar-text:   #94b4cc;   /* Texte inactif sidebar */
--color-sidebar-active: #ffffff;   /* Texte actif sidebar */
--color-primary:        #2D7DD2;   /* Bleu InvoiceHub (logo) */
--color-primary-hover:  #1a5fa8;
--color-bg:             #f5f7fa;   /* Fond gris très clair */
--color-surface:        #ffffff;   /* Cards/panels */
--color-border:         #e5e9ef;

/* Statuts */
--color-status-draft:     #94a3b8; /* Brouillon — gris */
--color-status-sent:      #3b82f6; /* Émise / Envoyée — bleu */
--color-status-paid:      #22c55e; /* Payée — vert */
--color-status-partial:   #f59e0b; /* Partiellement payée — orange */
--color-status-overdue:   #ef4444; /* En retard — rouge */
--color-status-cancelled: #6b7280; /* Annulée — gris foncé */
--color-status-accepted:  #10b981; /* Acceptée — vert émeraude */
--color-status-rejected:  #f43f5e; /* Rejetée — rouge rosé */
```

### Typographie
- Font: `Inter` (Google Fonts) — sans-serif propre, lisible
- Titres de page: `text-2xl font-semibold text-gray-900`
- Labels: `text-sm font-medium text-gray-700`
- Valeurs monétaires: `font-mono font-semibold` (XAF formaté)

### Layout global
```
┌────────────────────────────────────────────────────────────┐
│  SIDEBAR (240px fixe, fond #0f2d4a navy)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [Logo BTS blanc — logo 2.png]  [← toggle collapse]  │  │
│  │                                                      │  │
│  │  ─ PRINCIPAL ──────────────────────────────────────  │  │
│  │  ◉ Tableau de bord                                   │  │
│  │                                                      │  │
│  │  ─ COMMERCIAL ─────────────────────────────────────  │  │
│  │    Clients                                           │  │
│  │    Produits & Services                               │  │
│  │    Proformas                                         │  │
│  │    Factures                                          │  │
│  │    Paiements                                         │  │
│  │    Récurrentes             ← ajout (absent maquette) │  │
│  │                                                      │  │
│  │  ─ ANALYSE ────────────────────────────────────────  │  │
│  │    Rapports                ← ajout (absent maquette) │  │
│  │                                                      │  │
│  │  ─ SYSTÈME ────────────────────────────────────────  │  │
│  │    Notifications  [● 3]    ← badge temps réel        │  │
│  │    Utilisateurs            (admin + commercial only) │  │
│  │    Journaux d'audit        ← ajout (admin only)      │  │
│  │    Paramètres                                        │  │
│  │                                                      │  │
│  │  ──────────────────────────────────────────────────  │  │
│  │  [Avatar] Prénom NOM                                 │  │
│  │           Rôle             [⋮ menu : profil/logout]  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  TOPBAR (hauteur 56px, fond blanc, ombre douce)            │
│  [ Fil d'Ariane : Section > Page ]   [🔍 Recherche] [🔔]  │
│                                                             │
│  CONTENU PRINCIPAL                                         │
│  (padding 24px, fond #f5f7fa)                             │
└────────────────────────────────────────────────────────────┘
```

### Comportement sidebar (améliorations vs maquettes)
- **Collapsible** : bouton toggle pour réduire à 64px (icônes seules) + tooltip au survol
- **Active state** : bordure gauche 3px `#2D7DD2` + fond légèrement éclairé sur l'item actif
- **Notification badge** : pastille rouge animée (pulse) sur l'icône Notifications
- **Permissions visuelles** : items masqués selon le rôle (`employee` ne voit pas Utilisateurs ni Audit)
- **User menu** (bottom) : dropdown avec → Mon profil / Changer mot de passe / Déconnexion
- **Hover** : légère surbrillance `rgba(255,255,255,0.07)` sur items inactifs

---

## 3. Architecture des Dossiers

```
bridge-frontend/
├── public/
│   └── logos/                    # Logo BTS + InvoiceHub
│
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── reset-password/
│   │   │   │   └── page.tsx
│   │   │   └── 2fa/
│   │   │       └── page.tsx      # Étape TOTP après login
│   │   │
│   │   ├── middleware.ts          # Protect routes (vérifie JWT côté serveur Next.js)
│   │   │
│   │   ├── (dashboard)/          # Layout avec sidebar
│   │   │   ├── layout.tsx        # AppShell (sidebar + topbar)
│   │   │   ├── loading.tsx       # Skeleton global fallback
│   │   │   ├── error.tsx         # Error boundary global
│   │   │   ├── page.tsx          # Redirige vers /dashboard
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── clients/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── new/
│   │   │   │       └── page.tsx
│   │   │   ├── products/
│   │   │   │   └── page.tsx
│   │   │   ├── product-categories/
│   │   │   │   └── page.tsx
│   │   │   ├── proformas/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── invoices/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── payments/
│   │   │   │   └── page.tsx
│   │   │   ├── recurring/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── notifications/
│   │   │   │   └── page.tsx
│   │   │   ├── users/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── profile/
│   │   │   │   └── page.tsx              # Mon profil + changement mot de passe
│   │   │   ├── reports/
│   │   │   │   └── page.tsx
│   │   │   ├── audit/
│   │   │   │   └── page.tsx              # Admin only — journaux d'audit
│   │   │   └── settings/
│   │   │       ├── layout.tsx            # Onglets paramètres
│   │   │       ├── page.tsx              # Redirect → /settings/company
│   │   │       ├── company/
│   │   │       │   └── page.tsx
│   │   │       ├── billing/
│   │   │       │   └── page.tsx          # TVA + séquences + offices
│   │   │       ├── security/
│   │   │       │   └── page.tsx          # 2FA + sessions actives
│   │   │       ├── notifications/
│   │   │       │   └── page.tsx          # Templates email + préférences
│   │   │       └── backups/
│   │   │           └── page.tsx
│   │   │
│   │   ├── layout.tsx            # Root layout (providers)
│   │   ├── globals.css           # Tokens CSS + Tailwind base
│   │   └── not-found.tsx         # Page 404 custom
│   │
│   ├── components/               # Composants partagés
│   │   ├── ui/                   # shadcn/ui (auto-généré)
│   │   ├── layout/
│   │   │   ├── AppShell.tsx      # Sidebar + Topbar wrapper
│   │   │   ├── Sidebar.tsx       # Navigation latérale
│   │   │   ├── Topbar.tsx        # Barre du haut
│   │   │   └── PageHeader.tsx    # Titre + actions de page
│   │   ├── data-table/
│   │   │   ├── DataTable.tsx     # Table générique TanStack
│   │   │   ├── DataTablePagination.tsx
│   │   │   ├── DataTableToolbar.tsx
│   │   │   └── DataTableColumnHeader.tsx
│   │   ├── forms/
│   │   │   ├── FormField.tsx     # Wrapper label + input + error
│   │   │   └── CurrencyInput.tsx # Input formaté XAF
│   │   ├── feedback/
│   │   │   ├── StatusBadge.tsx   # Badge coloré par statut
│   │   │   ├── EmptyState.tsx    # Tableau/page vide
│   │   │   ├── LoadingSpinner.tsx
│   │   │   └── ErrorBoundary.tsx
│   │   ├── document/
│   │   │   ├── LineItemsEditor.tsx   # Éditeur lignes produits
│   │   │   ├── TotalsPanel.tsx       # Sous-total / TVA / TTC
│   │   │   └── PdfPreviewModal.tsx   # Modale aperçu PDF
│   │   └── modals/
│   │       ├── ConfirmDialog.tsx
│   │       └── ActionSheet.tsx
│   │
│   ├── features/                 # Logique métier par module
│   │   ├── auth/
│   │   │   ├── api.ts            # login, logout, refresh, 2FA, reset
│   │   │   ├── hooks.ts          # useLogin, useMe
│   │   │   ├── store.ts          # Zustand auth store
│   │   │   └── types.ts
│   │   ├── dashboard/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts
│   │   │   ├── components/
│   │   │   │   ├── KpiCards.tsx
│   │   │   │   ├── RevenueChart.tsx
│   │   │   │   ├── InvoiceStatusDonut.tsx
│   │   │   │   ├── RecentInvoicesTable.tsx
│   │   │   │   └── TopClientsTable.tsx
│   │   │   └── types.ts
│   │   ├── clients/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts
│   │   │   ├── components/
│   │   │   │   ├── ClientForm.tsx
│   │   │   │   ├── ClientSummaryCard.tsx
│   │   │   │   └── ClientInvoiceHistory.tsx
│   │   │   └── types.ts
│   │   ├── products/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts
│   │   │   ├── components/
│   │   │   │   ├── ProductForm.tsx
│   │   │   │   └── CategoryManager.tsx
│   │   │   └── types.ts
│   │   ├── proformas/
│   │   │   ├── api.ts            # CRUD + send/accept/reject/convert/pdf
│   │   │   ├── hooks.ts
│   │   │   ├── components/
│   │   │   │   ├── ProformaForm.tsx      # Création / édition
│   │   │   │   ├── ProformaDetailView.tsx
│   │   │   │   └── ProformaActionsMenu.tsx
│   │   │   └── types.ts
│   │   ├── invoices/
│   │   │   ├── api.ts            # CRUD + issue/cancel/payment/pdf
│   │   │   ├── hooks.ts
│   │   │   ├── components/
│   │   │   │   ├── InvoiceForm.tsx
│   │   │   │   ├── InvoiceDetailView.tsx
│   │   │   │   ├── InvoiceActionsMenu.tsx
│   │   │   │   ├── PaymentModal.tsx
│   │   │   │   └── AcompteInfoBanner.tsx # Lien acompte/solde
│   │   │   └── types.ts
│   │   ├── payments/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts
│   │   │   ├── components/
│   │   │   │   └── PaymentRow.tsx
│   │   │   └── types.ts
│   │   ├── recurring/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts
│   │   │   ├── components/
│   │   │   │   └── RecurringTemplateForm.tsx
│   │   │   └── types.ts
│   │   ├── notifications/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts
│   │   │   ├── socket.ts         # Socket.io listener
│   │   │   ├── store.ts          # Zustand notifications store
│   │   │   ├── components/
│   │   │   │   ├── NotificationBell.tsx  # Badge + dropdown topbar
│   │   │   │   └── NotificationItem.tsx
│   │   │   └── types.ts
│   │   ├── users/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts
│   │   │   ├── components/
│   │   │   │   ├── UserForm.tsx
│   │   │   │   └── RoleBadge.tsx
│   │   │   └── types.ts
│   │   ├── reports/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts
│   │   │   └── components/
│   │   │       ├── ReportFilters.tsx
│   │   │       └── ExportButton.tsx
│   │   ├── settings/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts
│   │   │   └── components/
│   │   │       ├── CompanyForm.tsx
│   │   │       ├── BillingSettings.tsx
│   │   │       ├── SecuritySettings.tsx  # 2FA, sessions
│   │   │       ├── NotifSettings.tsx
│   │   │       └── BackupManager.tsx
│   │   ├── audit/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts
│   │   │   └── components/
│   │   │       └── AuditLogTable.tsx
│   │   ├── tax-rates/
│   │   │   ├── api.ts                # CRUD taux TVA
│   │   │   ├── hooks.ts
│   │   │   └── components/
│   │   │       └── TaxRateForm.tsx   # Intégré dans Settings > Facturation
│   │   ├── email-templates/
│   │   │   ├── api.ts                # GET/PUT templates par type
│   │   │   ├── hooks.ts
│   │   │   └── components/
│   │   │       └── EmailTemplateEditor.tsx  # Éditeur rich-text + variables
│   │   ├── offices/
│   │   │   ├── api.ts                # CRUD bureaux/agences BTS
│   │   │   ├── hooks.ts
│   │   │   └── components/
│   │   │       └── OfficeForm.tsx    # Intégré dans Settings > Facturation
│   │   └── search/
│   │       ├── api.ts                # GET /search?q=...
│   │       ├── hooks.ts              # useGlobalSearch (debounced)
│   │       └── components/
│   │           ├── SearchBar.tsx     # Input dans topbar
│   │           └── SearchResults.tsx # Résultats groupés par entité
│   │
│   ├── lib/
│   │   ├── api-client.ts         # Instance Axios configurée
│   │   ├── query-client.ts       # TanStack Query client
│   │   ├── formatters.ts         # formatXAF(), formatDate(), formatDocNumber()
│   │   ├── constants.ts          # ROUTES, QUERY_KEYS, ROLES
│   │   └── utils.ts              # cn(), debounce(), etc.
│   │
│   ├── hooks/
│   │   ├── useAuth.ts            # Accès auth store + redirects
│   │   ├── usePermission.ts      # can('invoice', 'create')
│   │   ├── useSocket.ts          # Socket.io connection
│   │   ├── useDebounce.ts
│   │   └── useLocalStorage.ts
│   │
│   ├── providers/
│   │   ├── QueryProvider.tsx     # TanStack Query
│   │   ├── SocketProvider.tsx    # Socket.io context
│   │   └── ToastProvider.tsx     # Sonner toasts
│   │
│   └── types/
│       ├── api.ts                # Types génériques réponses API
│       └── index.ts              # Re-exports
│
├── .env.local.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 4. Couche API (Axios)

### `src/lib/api-client.ts`
```typescript
// Instance Axios avec :
// - baseURL = NEXT_PUBLIC_API_URL
// - intercepteur request : injecte Authorization: Bearer <accessToken>
// - intercepteur response :
//     • sur 401 → appel /auth/refresh → retry la requête originale
//     • sur 403 → redirect /login
//     • erreurs métier → throw AppError avec message FR
```

### Convention des hooks TanStack Query
```typescript
// hooks.ts dans chaque feature
export const QUERY_KEYS = {
  list:   (filters?) => ['invoices', 'list', filters],
  detail: (id)       => ['invoices', 'detail', id],
  pdf:    (id)       => ['invoices', 'pdf', id],
};

export function useInvoices(filters) {
  return useQuery({ queryKey: QUERY_KEYS.list(filters), queryFn: () => api.list(filters) });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast.success('Facture créée'); },
  });
}
```

---

## 5. Gestion des Permissions (RBAC)

```typescript
// src/hooks/usePermission.ts
const PERMISSIONS = {
  admin:      { invoice: ['create','read','update','cancel','delete'], client: ['*'], user: ['*'], settings: ['*'] },
  commercial: { invoice: ['create','read','update','cancel'],          client: ['create','read','update'], user: ['read'] },
  employee:   { invoice: ['read'],                                      client: ['read'], user: [] },
};

export function usePermission() {
  const role = useAuthStore(s => s.user?.role);
  return {
    can: (resource: string, action: string) => /* vérifie PERMISSIONS[role][resource] */,
  };
}
```

Usage dans les composants :
```tsx
const { can } = usePermission();
{can('invoice', 'create') && <Button>+ Nouvelle facture</Button>}
```

---

## 6. Composants Clés

### `StatusBadge.tsx`
```tsx
// Mapping statut → couleur Tailwind
const STATUS_CONFIG = {
  draft:           { label: 'Brouillon',          className: 'bg-gray-100 text-gray-600' },
  sent:            { label: 'Envoyée',             className: 'bg-blue-100 text-blue-700' },
  issued:          { label: 'Émise',               className: 'bg-blue-100 text-blue-700' },
  accepted:        { label: 'Acceptée',            className: 'bg-emerald-100 text-emerald-700' },
  rejected:        { label: 'Rejetée',             className: 'bg-rose-100 text-rose-700' },
  paid:            { label: 'Payée',               className: 'bg-green-100 text-green-700' },
  partially_paid:  { label: 'Part. payée',         className: 'bg-amber-100 text-amber-700' },
  overdue:         { label: 'En retard',           className: 'bg-red-100 text-red-700' },
  cancelled:       { label: 'Annulée',             className: 'bg-gray-200 text-gray-500' },
};
```

### `LineItemsEditor.tsx`
Éditeur de lignes produits/services (proformas & factures) :
- Autocomplete produit depuis le catalogue
- Auto-remplissage prix HT, unité, description
- Calcul temps réel : Qt × PU × (1 - remise%) = Total HT
- Panel totaux : Sous-total HT / Remise globale / Total HT / TVA / **Total TTC (XAF)**
- Ajout/suppression/réorganisation de lignes

### `formatXAF(amount: number): string`
```typescript
// "11 200 000 XAF" — espace comme séparateur de milliers, suffix XAF
export function formatXAF(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(n) + ' XAF';
}
```

---

## 7. Temps Réel (Socket.io)

```typescript
// src/features/notifications/socket.ts
// Événements écoutés :
//   'notification:new'      → incrémente badge + affiche toast
//   'invoice:status_change' → invalide cache TanStack Query
//   'payment:received'      → invalide cache + toast

// SocketProvider connecte une fois à l'init avec le JWT,
// expose le socket via Context.
// useSocket() hook pour s'abonner à des événements.
```

---

## 8. Pages détaillées

### Page Login
- Layout split : panneau gauche navy (`#0f2d4a`) avec logo BTS blanc (`logo 2.png`) + tagline + version, panneau droit formulaire
- Formulaire : Email + Mot de passe + bouton "Se connecter"
- Lien "Mot de passe oublié ?"
- Si 2FA activé → redirect vers `/2fa` avec code TOTP (page dédiée, pas de modale)

### Page 2FA (`/2fa`)
- Saisie du code à 6 chiffres (TOTP ou code de secours)
- Lien "Utiliser un code de secours"
- Bouton retour vers login

### Page Tableau de Bord
- **KPI Cards** (4) : CA du mois, Factures émises, Créances en attente, Factures en retard
- **Graphique évolution CA** : Line chart Recharts, toggle Mois/Trimestre/Année
- **Donut statuts factures** : Recharts PieChart avec légende
- **Table Factures Récentes** : 5 dernières, lien "Voir tout →"
- **Table Top 5 Clients par CA** : Classement avec montants XAF

### Page Clients
- Filtre onglets : Tous / Entreprises / Particuliers
- Tableau : Client, Contact, Ville, Total facturé, Reste à payer, Statut, Actions
- Actions : Voir détail, Éditer, Archiver
- Bouton export CSV

### Page Proformas / Factures
- Filtre onglets par statut (Tous / Brouillon / Émise / Payée / En retard...)
- Tableau avec N° document, Type, Client, Échéance, Total TTC, Payé, Statut, Actions
- Badges type : Standard / Acompte / Solde / Avoir / Récurrente

### Page Création Proforma/Facture
- Layout 2 colonnes : gauche (infos générales) + droite (lignes produits)
- Informations : Client (combobox), Date, Validité/Échéance, Notes/Conditions
- Lignes : LineItemsEditor
- Totaux : TotalsPanel en bas droite
- Actions header : Sauvegarder brouillon / Enregistrer & Envoyer

### Page Profil (`/profile`)
- Infos personnelles (nom, email)
- Changement de mot de passe
- Gestion 2FA personnelle (activer/désactiver depuis le profil)
- Sessions actives de l'utilisateur courant

### Page Paramètres
- Onglets : Entreprise / Facturation / Sécurité / Notifications / Sauvegardes
- **Entreprise** : Identité légale + Coordonnées + Branding (logo upload) + Paramètres financiers
- **Facturation** : Taux TVA (CRUD), Séquences documents, Bureaux/agences (offices), Devise
- **Sécurité** : Sessions actives globales (admin), Politique mots de passe, Config 2FA entreprise
- **Notifications** : Templates emails (éditeur + variables disponibles), Préférences par événement, Config escalade rappels
- **Sauvegardes** : Historique + déclenchement manuel + téléchargement

### Page Journaux d'Audit (`/audit`)
- Admin uniquement
- Tableau avec : Date, Utilisateur, Action, Entité, IP, Avant/Après (JSON diff)
- Filtres : date range, utilisateur, type d'action
- Export CSV

---

## 9. Formatage des données métier

```typescript
// Numéros de document : BTS/DC/2026/01/FAC001 → afficher tel quel (font-mono)
// Montants : toujours avec formatXAF() → "1 200 000 XAF"
// Dates : date-fns/locale fr → "14 avr. 2026"
// Types factures :
const INVOICE_TYPE_LABELS = {
  standard:  'Standard',
  acompte:   'Acompte',
  solde:     'Solde',
  avoir:     'Avoir',
  recurring: 'Récurrente',
};
```

---

## 10. Variables d'Environnement

```env
# .env.local.example
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=InvoiceHub
```

---

## 11. Configuration Next.js

```typescript
// next.config.ts
const config = {
  output: 'standalone',        // Build optimisé Docker
  images: {
    domains: ['localhost'],    // Images uploads backend
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_URL}/:path*` }];
    // En prod : proxy via Nginx, pas de rewrite Next.js
  },
};
```

---

## 12. Docker

```dockerfile
# bridge-frontend/docker/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm i -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3001
CMD ["node", "server.js"]
```

```yaml
# Ajout dans docker-compose.yml
frontend:
  build: ./bridge-frontend/docker
  ports:
    - "3001:3001"
  environment:
    - NEXT_PUBLIC_API_URL=http://api:3000/api
    - NEXT_PUBLIC_SOCKET_URL=http://api:3000
  depends_on:
    - api
```

---

## 13. Phases de Développement

### Phase 1 — Setup & Infrastructure
- [ ] Init projet Next.js 15 + TypeScript + Tailwind 4 + shadcn/ui
- [ ] Configurer Axios intercepteurs (auth + refresh automatique)
- [ ] Configurer TanStack Query + Zustand
- [ ] Layout AppShell (Sidebar + Topbar) fidèle aux maquettes
- [ ] Système de tokens CSS couleurs BTS

### Phase 2 — Authentification
- [ ] Page Login (layout split maquette)
- [ ] Flux 2FA TOTP (step 2 après login)
- [ ] Page Reset Password
- [ ] AuthGuard + RequireRole wrapper
- [ ] Persistance session (localStorage token + refresh auto)

### Phase 3 — Tableau de Bord
- [ ] KPI Cards avec skeletons loading
- [ ] Line chart CA (Recharts) avec toggle période
- [ ] Donut statuts factures
- [ ] Tables récentes (factures + top clients)

### Phase 4 — Clients & Produits
- [ ] Page Clients avec DataTable, filtres onglets, export
- [ ] Formulaire Client (création + édition)
- [ ] Page détail client (summary financier + historique)
- [ ] Page Produits & Services + catégories

### Phase 5 — Proformas
- [ ] Liste proformas avec filtres
- [ ] Formulaire création (LineItemsEditor + TotalsPanel)
- [ ] Page détail + cycle de vie (envoyer/accepter/rejeter/convertir)
- [ ] Aperçu et téléchargement PDF

### Phase 6 — Factures & Paiements
- [ ] Liste factures avec filtres type + statut
- [ ] Formulaire création (standard, acompte, solde)
- [ ] Modale enregistrement paiement
- [ ] Logique acompte/solde (AcompteInfoBanner)
- [ ] Annulation → affichage avoir automatique
- [ ] Page Paiements (liste globale)

### Phase 7 — Modules Système
- [ ] Notifications (page liste + bell topbar temps réel)
- [ ] Utilisateurs (CRUD, role badge, admin only)
- [ ] Factures récurrentes (templates + activation)

### Phase 7 — Modules Système (suite)
- [ ] Journaux d'audit (admin only, table + filtres + export)
- [ ] Page Profil (infos perso + 2FA + sessions)

### Phase 8 — Paramètres
- [ ] Onglets Entreprise / Facturation / Sécurité / Notifications / Sauvegardes
- [ ] Upload logo avec preview
- [ ] Gestion 2FA entreprise
- [ ] CRUD Taux de TVA (TaxRateForm)
- [ ] CRUD Bureaux/Agences (OfficeForm)
- [ ] Éditeur templates emails (EmailTemplateEditor + variables)
- [ ] Config escalade rappels retard
- [ ] Gestionnaire sauvegardes

### Phase 9 — Finitions
- [ ] Recherche globale (SearchBar topbar → SearchResults groupés : clients, factures, proformas)
- [ ] Mode responsive (tablette — sidebar collapsible auto)
- [ ] `loading.tsx` / `error.tsx` par route (skeletons propres)
- [ ] Pages 404 / 500 custom
- [ ] Tests E2E Playwright (login, 2FA, créer facture, télécharger PDF)
- [ ] Build Docker + intégration docker-compose

---

## 14. Référence Design — Maquettes BTS

Dossier `maquette_test/` à la racine du projet :

| Fichier | Contenu |
|---|---|
| `page_login.png` | Page de connexion (layout split) |
| `tableau_de_bord1.png` | Dashboard — KPIs + graphiques |
| `tableau_de_bord2.png` | Dashboard — scroll bas (tables) |
| `page_clients.png` | Liste clients |
| `page_create_proforma.png` | Formulaire création proforma |
| `page_proforma.png` | Liste proformas |
| `page_facture.png` | Liste factures |
| `page_produit_services.png` | Produits & Services |
| `page_users.png` | Utilisateurs |
| `page_notification.png` | Notifications |
| `page_parametre.png` | Paramètres — onglet Entreprise |
| `page_parametres_2.png` | Paramètres — autres onglets |
| `LOGOS/invoicehub.png` | Logo InvoiceHub (bleu `#2D7DD2`, police ronde) |
| `LOGOS/logo 2.png` | **Logo BTS blanc** → à utiliser dans la sidebar (fond navy) |
| `LOGOS/logo3.png` | Logo BTS bleu → à utiliser sur fond clair (login, emails) |
| `LOGOS/logo4.png` | Logo BTS gris |
| `LOGOS/logo5.png` | Logo BTS noir |
| `Charte graphique Bridge.pdf` | Charte graphique officielle BTS |

### Utilisation des logos
- **Sidebar** (fond navy `#0f2d4a`) → `logo 2.png` (blanc)
- **Page Login** panneau gauche (fond navy) → `logo 2.png` (blanc)
- **Topbar**, emails, PDFs (fond blanc) → `logo3.png` (bleu)
- **Favicon** → icône seule extraite du logo BTS

> **Note** : Les maquettes sont une **base d'inspiration** — l'implémentation finale
> peut et doit améliorer le design (sidebar collapsible, animations, UX plus soignée).
> Consulter `Charte graphique Bridge.pdf` pour les règles typographiques officielles.
