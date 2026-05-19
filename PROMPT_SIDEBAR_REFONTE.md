# PROMPT — Refonte de la navigation sidebar (BRIDGE / InvoiceHub v2.0)

## Règle absolue — À lire avant toute modification

**Avant de toucher à n'importe quel fichier existant, tu dois :**
1. Lire le fichier en entier pour comprendre sa logique actuelle
2. Identifier tous les endroits où ta modification peut avoir un impact indirect
3. Ne jamais supprimer ou réécrire une logique existante qui fonctionne — étendre, pas remplacer
4. Vérifier les imports existants avant d'en ajouter de nouveaux
5. Confirmer que le build TypeScript (`pnpm tsc --noEmit`) passe EXIT 0 après chaque phase

Cette règle s'applique en particulier à : `Sidebar.tsx`, `sidebar.ts` (store), `constants.ts`, tout composant layout existant.

---

## Contexte du projet

**InvoiceHub v2.0** — Plateforme de gestion financière enterprise pour BTS (Douala, Cameroun).
- **Frontend** : Next.js 15 (App Router) + TypeScript + Tailwind + TanStack Query v5 + Zustand
- **Sidebar store** : `bridge-frontend/src/store/sidebar.ts` — Zustand avec persist (`collapsed` persisté, `mobileOpen` non persisté)
- **Sidebar composant** : `bridge-frontend/src/components/layout/Sidebar.tsx` — 726 lignes, structure `NAV: NavSection[]`, rendu complet desktop + mobile overlay
- **Routes** : `bridge-frontend/src/lib/constants.ts` — objet `ROUTES` typé `as const`
- **CSS tokens** : `--primary: #2D7DD2`, `--sidebar-bg: #0c2340`, `--sidebar-w: 240px`, `--sidebar-w-collapsed: 64px`, `--topbar-h`
- **Fonts** : `--font-display: 'Sora'`, `--font-body: 'DM Sans'`

---

## Problème à résoudre

La sidebar actuelle a 4 sections plates (`Ventes & Facturation`, `Tiers & Stocks`, `Gestion & Reporting`, `Système`). Avec les 30+ modules backend existants et les modules à venir (workflow approbation, Outlook), la navigation devient ingérable.

Certains modules ont trop de sous-routes pour être mis en sidebar classique — ils doivent utiliser un **panel overlay** (comme les Paramètres) :
- **Banque** : 6 sous-sections (comptes, import CSV, transactions, rapprochements, règles de matching)
- **Comptabilité** : 7 sous-sections (plan comptable, périodes fiscales, journaux, écritures, lettrage, états financiers, déclarations TVA)
- **Rôles & Permissions** : section admin dédiée (rôles CRUD, permissions disponibles)
- **Paramètres** : déjà prévu en overlay (settings company + settings-advanced avec 6 sous-systèmes)

---

## Architecture de la solution

### Pattern overlay (panel secondaire)

Le panel overlay apparaît **par-dessus le contenu** de la page (pas de décalage de la mise en page). Il est `position: fixed`, ancré à droite de la sidebar principale, avec `z-index` au-dessus du contenu.

```
┌──────────────────┬──────────────────────┬──────────────────────────────┐
│                  │                      │                              │
│  Sidebar         │  Panel overlay       │  Contenu de la page          │
│  principale      │  (position: fixed)   │  (non décalé, en dessous)    │
│  (fixed)         │  z-index: 30         │                              │
│                  │  width: 220px        │                              │
│                  │  animation slide-in  │                              │
└──────────────────┴──────────────────────┴──────────────────────────────┘
```

**Déclenchement** : Les items avec `overlay: 'bank'` etc. sont des `<button>` (pas des `<Link>`). Cliquer dessus appelle `setOverlayPanel('bank')`. Cliquer en dehors du panel ou appuyer sur ESC ferme le panel.

**État actif** : Un item sidebar avec `overlay` est considéré actif si `pathname.startsWith(item.href)` — le panel s'auto-ouvre dans ce cas au montage.

---

## 1. MISE À JOUR DE `constants.ts`

### Fichier : `bridge-frontend/src/lib/constants.ts`

**Lire le fichier en entier avant modification.** Ajouter les routes manquantes dans l'objet `ROUTES` existant (ne pas modifier les routes existantes) :

```typescript
// ── Tiers ──────────────────────────────────────────────────────
SUPPLIERS:           '/suppliers',

// ── Achats ─────────────────────────────────────────────────────
PURCHASE_ORDERS:     '/purchase-orders',
SUPPLIER_INVOICES:   '/supplier-invoices',
EXPENSES:            '/expenses',
EXPENSE_CATEGORIES:  '/expenses/categories',
EXPENSE_BUDGETS:     '/expenses/budgets',

// ── Stocks & Produits ───────────────────────────────────────────
STOCK:               '/stock',
STOCK_MOVEMENTS:     '/stock/movements',
STOCK_LEVELS:        '/stock/levels',
STOCK_ALERTS:        '/stock/alerts',

// ── Finances — Banque ───────────────────────────────────────────
BANK:                        '/bank',
BANK_ACCOUNTS:               '/bank/accounts',
BANK_IMPORT:                 '/bank/import',
BANK_TRANSACTIONS:           '/bank/transactions',
BANK_RECONCILIATIONS:        '/bank/reconciliations',
BANK_MATCHING_RULES:         '/bank/matching-rules',

// ── Finances — Comptabilité ─────────────────────────────────────
ACCOUNTING:                  '/accounting',
ACCOUNTING_CHART:            '/accounting/chart',
ACCOUNTING_PERIODS:          '/accounting/periods',
ACCOUNTING_JOURNALS:         '/accounting/journals',
ACCOUNTING_ENTRIES:          '/accounting/entries',
ACCOUNTING_REPORTS:          '/accounting/reports',
ACCOUNTING_TAX:              '/accounting/tax-declarations',
ACCOUNTING_LETTERING:        '/accounting/lettering',

// ── Administration ──────────────────────────────────────────────
ROLES:               '/roles',
ROLES_PERMISSIONS:   '/roles/permissions',
APPROVALS:           '/approvals',

// ── Paramètres avancés ──────────────────────────────────────────
SETTINGS_OFFICES:        '/settings/offices',
SETTINGS_TAX_RATES:      '/settings/tax-rates',
SETTINGS_EMAIL_TEMPLATES: '/settings/email-templates',
SETTINGS_WEBHOOKS:       '/settings/webhooks',
SETTINGS_API_KEYS:       '/settings/api-keys',
SETTINGS_CUSTOM_FIELDS:  '/settings/custom-fields',
SETTINGS_WORKFLOW_RULES: '/settings/workflow-rules',
SETTINGS_IP_WHITELIST:   '/settings/ip-whitelist',
SETTINGS_EXPORTS:        '/settings/exports',
SETTINGS_OUTLOOK:        '/settings/outlook',
```

---

## 2. MISE À JOUR DU STORE ZUSTAND

### Fichier : `bridge-frontend/src/store/sidebar.ts`

**Lire le fichier en entier avant modification.** Le store actuel a : `collapsed`, `mobileOpen`, setters et `toggle`. Ajouter `overlayPanel` pour gérer l'état du panel overlay actif (non persisté).

```typescript
interface SidebarStore {
  collapsed:       boolean
  mobileOpen:      boolean
  overlayPanel:    string | null   // 'bank' | 'accounting' | 'roles' | 'settings' | null
  setCollapsed:    (v: boolean) => void
  setMobileOpen:   (v: boolean) => void
  setOverlayPanel: (panel: string | null) => void
  toggle:          () => void
  toggleMobile:    () => void
}

// Dans le create :
overlayPanel:    null,
setOverlayPanel: (panel) => set({ overlayPanel: panel }),

// Dans partialize (persist) : NE PAS persister overlayPanel — il se remet à null au refresh
partialize: (s) => ({ collapsed: s.collapsed }),
```

---

## 3. NOUVEAU COMPOSANT `OverlaySubNav.tsx`

### Fichier : `bridge-frontend/src/components/layout/OverlaySubNav.tsx` (nouveau)

Ce composant est le panel secondaire qui s'affiche par-dessus le contenu pour Banque, Comptabilité, Rôles et Paramètres. Lire `Sidebar.tsx` en entier pour respecter exactement les mêmes tokens CSS et patterns d'accessibilité.

**Props :**
```typescript
interface OverlaySubNavProps {
  panelId:   string              // 'bank' | 'accounting' | 'roles' | 'settings'
  onClose:   () => void
}
```

**Structure du composant :**

```tsx
// Backdrop (ferme le panel au clic en dehors)
<div
  className="fixed inset-0 z-20"
  onClick={onClose}
  aria-hidden="true"
/>

// Panel
<nav
  aria-label={panel.title}
  style={{
    position:   'fixed',
    top:        0,
    left:       `var(${collapsed ? '--sidebar-w-collapsed' : '--sidebar-w'})`,
    height:     '100vh',
    width:      220,
    background: 'var(--surface)',    // blanc
    borderRight: '1px solid var(--border)',
    boxShadow:  '4px 0 24px rgba(0,0,0,0.08)',
    zIndex:     30,
    display:    'flex',
    flexDirection: 'column',
    transform:  'translateX(0)',
    animation:  'slideInLeft 0.25s cubic-bezier(0.4,0,0.2,1)',
    overflowY:  'auto',
  }}
>
  {/* Header du panel */}
  <div style={{
    padding:      '16px 16px 12px',
    borderBottom: '1px solid var(--border)',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'space-between',
    height:       'var(--topbar-h)',
    flexShrink:   0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <PanelIcon size={16} style={{ color: 'var(--primary)' }} aria-hidden="true" />
      <span style={{
        fontSize:   14, fontWeight: 700,
        fontFamily: 'var(--font-display)',
        color:      'var(--text-1)',
      }}>
        {panel.title}
      </span>
    </div>
    <button
      onClick={onClose}
      aria-label="Fermer le panneau"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
    >
      <X size={16} style={{ color: 'var(--text-3)' }} />
    </button>
  </div>

  {/* Sections avec items */}
  <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
    {panel.sections.map((section) => (
      <div key={section.title}>
        <p style={{
          padding:       '8px 16px 4px',
          fontSize:      10.5, fontWeight: 700,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          color:         'var(--text-3)',
          fontFamily:    'var(--font-display)',
          margin:        0,
        }}>
          {section.title}
        </p>
        {section.items
          .filter(item => !item.roles || item.roles.includes(user?.role ?? ''))
          .map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:         10,
                  padding:     '7px 16px',
                  fontSize:    13,
                  fontFamily:  'var(--font-body)',
                  fontWeight:  active ? 600 : 400,
                  color:       active ? 'var(--primary)' : 'var(--text-2)',
                  background:  active ? 'var(--primary-light)' : 'transparent',
                  textDecoration: 'none',
                  borderRadius:   6,
                  margin:      '1px 8px',
                  transition:  'background 0.12s, color 0.12s',
                }}
              >
                <item.icon size={14} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true"
                  style={{ color: active ? 'var(--primary)' : 'var(--text-3)', flexShrink: 0 }} />
                {item.label}
              </Link>
            )
          })}
        <div style={{ height: 1, background: 'var(--border)', margin: '6px 16px' }} />
      </div>
    ))}
  </div>
</nav>
```

**Animation CSS à ajouter dans le fichier global `globals.css` :**
```css
@keyframes slideInLeft {
  from { transform: translateX(-100%); opacity: 0; }
  to   { transform: translateX(0);     opacity: 1; }
}
```

**Fermeture ESC :**
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [onClose])
```

---

## 4. CONFIGURATION DES PANELS OVERLAY

Définir la configuration des 4 panels dans un fichier séparé pour garder `Sidebar.tsx` lisible.

### Fichier : `bridge-frontend/src/components/layout/overlay-panels.ts` (nouveau)

```typescript
import {
  Landmark, BookOpen, ShieldCheck, Settings,
  CreditCard, Upload, ArrowLeftRight, GitMerge, Zap,
  List, Calendar, PenLine, Link2, BarChart3, Download, FileCheck,
  Shield, Key,
  Building2, MapPin, Percent, Mail, Lock, BellRing, HardDrive,
  Cloud, Webhook, Sliders, GitBranch,
} from 'lucide-react'
import { ROUTES } from '@/lib/constants'

interface OverlayItem {
  label: string
  href:  string
  icon:  React.ElementType
  roles?: string[]
}

interface OverlaySection {
  title: string
  items: OverlayItem[]
}

export interface OverlayPanel {
  id:       string
  title:    string
  icon:     React.ElementType
  sections: OverlaySection[]
}

export const OVERLAY_PANELS: Record<string, OverlayPanel> = {

  bank: {
    id: 'bank', title: 'Banque', icon: Landmark,
    sections: [
      {
        title: 'COMPTES',
        items: [
          { label: 'Mes comptes bancaires', href: ROUTES.BANK_ACCOUNTS,   icon: CreditCard },
        ],
      },
      {
        title: 'IMPORT',
        items: [
          { label: 'Importer un relevé',  href: ROUTES.BANK_IMPORT,       icon: Upload },
        ],
      },
      {
        title: 'TRANSACTIONS',
        items: [
          { label: 'Transactions',        href: ROUTES.BANK_TRANSACTIONS,  icon: ArrowLeftRight },
        ],
      },
      {
        title: 'RAPPROCHEMENT',
        items: [
          { label: 'Rapprochements',      href: ROUTES.BANK_RECONCILIATIONS, icon: GitMerge },
          { label: 'Règles de matching',  href: ROUTES.BANK_MATCHING_RULES,  icon: Zap },
        ],
      },
    ],
  },

  accounting: {
    id: 'accounting', title: 'Comptabilité', icon: BookOpen,
    sections: [
      {
        title: 'RÉFÉRENTIEL',
        items: [
          { label: 'Plan comptable',    href: ROUTES.ACCOUNTING_CHART,   icon: List },
          { label: 'Périodes fiscales', href: ROUTES.ACCOUNTING_PERIODS, icon: Calendar },
        ],
      },
      {
        title: 'SAISIE',
        items: [
          { label: 'Journaux',  href: ROUTES.ACCOUNTING_JOURNALS, icon: BookOpen },
          { label: 'Écritures', href: ROUTES.ACCOUNTING_ENTRIES,  icon: PenLine },
        ],
      },
      {
        title: 'CLÔTURE',
        items: [
          { label: 'Lettrage', href: ROUTES.ACCOUNTING_LETTERING, icon: Link2 },
        ],
      },
      {
        title: 'ÉTATS FINANCIERS',
        items: [
          { label: 'Balance & Grand livre', href: ROUTES.ACCOUNTING_REPORTS, icon: BarChart3 },
          { label: 'Export Sage',           href: `${ROUTES.ACCOUNTING_REPORTS}/sage`, icon: Download },
        ],
      },
      {
        title: 'FISCAL',
        items: [
          { label: 'Déclarations TVA', href: ROUTES.ACCOUNTING_TAX, icon: FileCheck },
        ],
      },
    ],
  },

  roles: {
    id: 'roles', title: 'Rôles & Permissions', icon: ShieldCheck,
    sections: [
      {
        title: 'ACCÈS & DROITS',
        items: [
          { label: 'Gestion des rôles',      href: ROUTES.ROLES,            icon: Shield },
          { label: 'Permissions disponibles', href: ROUTES.ROLES_PERMISSIONS, icon: Key },
        ],
      },
    ],
  },

  settings: {
    id: 'settings', title: 'Paramètres', icon: Settings,
    sections: [
      {
        title: 'ENTREPRISE',
        items: [
          { label: 'Informations générales', href: ROUTES.SETTINGS_COMPANY,        icon: Building2, roles: ['admin'] },
          { label: 'Bureaux',                href: ROUTES.SETTINGS_OFFICES,        icon: MapPin,    roles: ['admin'] },
          { label: 'Taux de TVA',            href: ROUTES.SETTINGS_TAX_RATES,      icon: Percent,   roles: ['admin'] },
        ],
      },
      {
        title: 'DOCUMENTS',
        items: [
          { label: 'Templates email', href: ROUTES.SETTINGS_EMAIL_TEMPLATES, icon: Mail, roles: ['admin'] },
        ],
      },
      {
        title: 'COMPTE & SÉCURITÉ',
        items: [
          { label: 'Sécurité',      href: ROUTES.SETTINGS_SECURITY,       icon: Lock },
          { label: 'Notifications', href: ROUTES.SETTINGS_NOTIFICATIONS,   icon: BellRing },
          { label: 'Sauvegardes',   href: ROUTES.SETTINGS_BACKUPS,         icon: HardDrive, roles: ['admin'] },
        ],
      },
      {
        title: 'INTÉGRATIONS',
        items: [
          { label: 'Microsoft Outlook', href: ROUTES.SETTINGS_OUTLOOK,  icon: Mail },
          { label: 'OneDrive',          href: ROUTES.SETTINGS_BACKUPS,  icon: Cloud },
        ],
      },
      {
        title: 'AVANCÉ',
        items: [
          { label: 'Webhooks',         href: ROUTES.SETTINGS_WEBHOOKS,       icon: Webhook,    roles: ['admin'] },
          { label: 'Clés API',         href: ROUTES.SETTINGS_API_KEYS,       icon: Key,        roles: ['admin'] },
          { label: 'Champs perso.',    href: ROUTES.SETTINGS_CUSTOM_FIELDS,  icon: Sliders,    roles: ['admin'] },
          { label: 'Règles workflow',  href: ROUTES.SETTINGS_WORKFLOW_RULES, icon: GitBranch,  roles: ['admin'] },
          { label: 'Whitelist IP',     href: ROUTES.SETTINGS_IP_WHITELIST,   icon: Shield,     roles: ['admin'] },
          { label: 'Exports',          href: ROUTES.SETTINGS_EXPORTS,        icon: Download,   roles: ['admin'] },
        ],
      },
    ],
  },
}
```

---

## 5. MISE À JOUR DE `Sidebar.tsx`

### Fichier : `bridge-frontend/src/components/layout/Sidebar.tsx`

**Lire le fichier en entier (726 lignes) avant modification.** Ne rien supprimer de la logique existante (mobile overlay, user menu, focus trap, keyboard nav, aria, collapse button). Seules deux choses changent :
1. La constante `NAV` et les types
2. Le rendu des items avec `overlay`

#### A. Étendre les types

```typescript
interface NavItem {
  label:     string
  href:      string
  icon:      React.ElementType
  bell?:     boolean
  roles?:    string[]
  children?: SubItem[]
  external?: boolean
  overlay?:  string   // ← NOUVEAU : 'bank' | 'accounting' | 'roles' | 'settings'
}
```

#### B. Nouvelle constante `NAV`

Remplacer entièrement la constante `NAV` existante par :

```typescript
const NAV: NavSection[] = [
  {
    title: 'TIERS',
    items: [
      { label: 'Clients',      href: ROUTES.CLIENTS,    icon: Users },
      { label: 'Fournisseurs', href: ROUTES.SUPPLIERS,  icon: Building2 },
    ],
  },
  {
    title: 'VENTES',
    items: [
      {
        label: 'Proformas', href: ROUTES.PROFORMAS, icon: FileText,
        children: [{ label: 'Nouveau proforma', href: '/proformas/new', icon: Plus }],
      },
      {
        label: 'Factures', href: ROUTES.INVOICES, icon: Receipt,
        children: [{ label: 'Nouvelle facture', href: '/invoices/new', icon: Plus }],
      },
      { label: 'Paiements',   href: ROUTES.PAYMENTS,  icon: CreditCard },
      { label: 'Récurrentes', href: ROUTES.RECURRING, icon: RefreshCw },
    ],
  },
  {
    title: 'ACHATS',
    items: [
      { label: 'Bons de commande',      href: ROUTES.PURCHASE_ORDERS,   icon: ShoppingCart },
      { label: 'Factures fournisseurs', href: ROUTES.SUPPLIER_INVOICES, icon: FileInput },
      {
        label: 'Dépenses & Frais', href: ROUTES.EXPENSES, icon: Wallet,
        children: [
          { label: 'Notes de frais', href: ROUTES.EXPENSES,           icon: ReceiptText },
          { label: 'Catégories',     href: ROUTES.EXPENSE_CATEGORIES, icon: Tag },
          { label: 'Budgets',        href: ROUTES.EXPENSE_BUDGETS,    icon: PieChart },
        ],
      },
    ],
  },
  {
    title: 'STOCKS & PRODUITS',
    items: [
      {
        label: 'Produits', href: ROUTES.PRODUCTS, icon: Package,
        children: [
          { label: 'Catégories', href: ROUTES.PRODUCT_CATEGORIES, icon: Tag },
        ],
      },
      {
        label: 'Stock', href: ROUTES.STOCK, icon: Warehouse,
        children: [
          { label: 'Mouvements', href: ROUTES.STOCK_MOVEMENTS, icon: ArrowLeftRight },
          { label: 'Niveaux',    href: ROUTES.STOCK_LEVELS,    icon: BarChart2 },
          { label: 'Alertes',    href: ROUTES.STOCK_ALERTS,    icon: AlertTriangle },
        ],
      },
    ],
  },
  {
    title: 'FINANCES',
    items: [
      { label: 'Rapports',     href: ROUTES.REPORTS,     icon: BarChart3 },
      { label: 'Banque',       href: ROUTES.BANK,        icon: Landmark,  overlay: 'bank' },
      { label: 'Comptabilité', href: ROUTES.ACCOUNTING,  icon: BookCheck, overlay: 'accounting' },
    ],
  },
  {
    title: 'ADMINISTRATION',
    items: [
      { label: 'Utilisateurs',        href: ROUTES.USERS,          icon: UserCog,     roles: ['admin'] },
      { label: 'Rôles & Permissions', href: ROUTES.ROLES,          icon: ShieldCheck, overlay: 'roles', roles: ['admin'] },
      { label: 'Approbations',        href: ROUTES.APPROVALS,      icon: CheckSquare, roles: ['admin'] },
      { label: 'Notifications',       href: ROUTES.NOTIFICATIONS,  icon: Bell, bell: true },
      { label: "Journal d'audit",     href: ROUTES.AUDIT,          icon: ClipboardList, roles: ['admin'] },
    ],
  },
]

// Items du footer sidebar (hors sections NAV)
const FOOTER_NAV = [
  { label: 'BTS Assistant', href: ROUTES.ASSISTANT, icon: Sparkles },
  { label: 'Guide',         href: ROUTES.GUIDE,     icon: BookOpen, external: true },
]
// Le bouton Paramètres est rendu séparément dans le footer car il déclenche l'overlay 'settings'
```

#### C. Imports Lucide à ajouter

Les icônes existantes restent. Ajouter celles manquantes :
```typescript
import {
  // existantes : LayoutDashboard, Users, Package, FileText, Receipt, CreditCard,
  // RefreshCw, BarChart3, Bell, UserCog, ClipboardList, Settings,
  // PanelLeftClose, PanelLeftOpen, LogOut, User, KeyRound, ChevronUp,
  // ChevronDown, Plus, Tag, Building2, ShieldCheck, BellRing, HardDrive, Sparkles, BookOpen
  //
  // NOUVELLES :
  ShoppingCart, FileInput, Wallet, ReceiptText, PieChart,
  Warehouse, ArrowLeftRight, BarChart2, AlertTriangle,
  Landmark, BookCheck, CheckSquare,
} from 'lucide-react'
```

#### D. Logique de rendu pour les items `overlay`

Dans la boucle de rendu des items NAV, quand `item.overlay` est défini, rendre un `<button>` au lieu d'un `<Link>` :

```typescript
// Dans le rendu :
const isOverlayItem = !!item.overlay
const isOverlayActive = item.overlay ? overlayPanel === item.overlay : false
const isPathActive = isActive(item.href)
const itemActive = isPathActive || isOverlayActive

// Si overlay : <button onClick={() => setOverlayPanel(item.overlay!)}> au lieu de <Link>
// Les styles restent identiques (active state, hover, icône, label)
// aria-expanded={isOverlayActive} sur le bouton
```

#### E. Auto-ouverture de l'overlay selon le pathname

```typescript
// Dans le useEffect sur pathname :
useEffect(() => {
  for (const section of NAV) {
    for (const item of section.items) {
      if (item.overlay && pathname.startsWith(item.href)) {
        setOverlayPanel(item.overlay)
        return
      }
    }
  }
  // Ne pas fermer l'overlay si le pathname change vers une sous-route du panel actif
}, [pathname])
```

#### F. Footer avec bouton Paramètres

Remplacer l'item Paramètres dans la section Système par un bouton footer dédié :

```tsx
{/* Footer nav (avant la zone utilisateur) */}
<div style={{ padding: '4px 8px', borderTop: '1px solid var(--sidebar-border)' }}>
  {FOOTER_NAV.map(item => (
    <Link key={item.href} href={item.href} ...>{/* même style que les nav items */}</Link>
  ))}
  {/* Bouton Paramètres → overlay */}
  <button
    onClick={() => setOverlayPanel(overlayPanel === 'settings' ? null : 'settings')}
    aria-expanded={overlayPanel === 'settings'}
    style={{ /* même style qu'un nav item actif si overlayPanel === 'settings' */ }}
  >
    <Settings size={15} aria-hidden="true" />
    {!collapsed && <span>Paramètres</span>}
  </button>
</div>
```

#### G. Rendu du panel overlay

À la fin du composant `Sidebar`, avant le `return`, importer et rendre `OverlaySubNav` :

```tsx
import { OverlaySubNav } from './OverlaySubNav'

// Dans le return, après le sidebar desktop et mobile :
{overlayPanel && (
  <OverlaySubNav
    panelId={overlayPanel}
    onClose={() => setOverlayPanel(null)}
  />
)}
```

---

## 6. ICÔNES — Vérification de disponibilité Lucide

Avant d'utiliser une icône, vérifier qu'elle existe dans `lucide-react`. Alternatives si une icône n'existe pas :
- `Warehouse` → si absent, utiliser `Box`
- `BookCheck` → si absent, utiliser `BookOpen`
- `FileInput` → si absent, utiliser `FileDown`
- `ReceiptText` → si absent, utiliser `Receipt`
- `CheckSquare` → si absent, utiliser `CheckCircle`

Tester avec : `import { IconName } from 'lucide-react'` et vérifier que le build passe.

---

## 7. ORDRE D'IMPLÉMENTATION

### Phase 1 — Store et constantes (30 min)
1. Lire `constants.ts` → ajouter les nouvelles ROUTES
2. Lire `sidebar.ts` → ajouter `overlayPanel` + `setOverlayPanel`
3. `pnpm tsc --noEmit` → EXIT 0

### Phase 2 — Configuration overlay (30 min)
4. Créer `overlay-panels.ts` avec la config des 4 panels
5. Vérifier que toutes les icônes importées existent dans lucide-react

### Phase 3 — Composant OverlaySubNav (1h)
6. Créer `OverlaySubNav.tsx`
7. Tester visuellement : ouvrir/fermer, ESC, clic backdrop, active states
8. Vérifier le positionnement quand sidebar collapsed vs expanded

### Phase 4 — Mise à jour Sidebar.tsx (1h)
9. Lire `Sidebar.tsx` en entier
10. Mettre à jour les types NavItem
11. Remplacer la constante NAV
12. Ajouter les imports Lucide manquants
13. Adapter le rendu des items overlay (button vs Link)
14. Ajouter le footer nav + bouton Paramètres
15. Brancher OverlaySubNav dans le return
16. `pnpm tsc --noEmit` → EXIT 0

### Phase 5 — Vérification finale (30 min)
17. `pnpm build` → EXIT 0
18. Vérifier visuellement :
    - Toutes les sections s'affichent
    - Collapsed mode : icônes seulement, séparateurs de sections visibles
    - Mobile : overlay fonctionne
    - Panel overlay : Banque, Comptabilité, Rôles, Paramètres
    - Auto-expand sur rechargement de page selon pathname
    - ESC ferme le panel overlay
    - Clic en dehors du panel overlay ferme le panel

---

## 8. DESIGN — Tokens et règles visuelles

### Sidebar principale (existante, ne pas modifier)
```
background:  var(--sidebar-bg)   → #0c2340 (navy)
text:        var(--sidebar-text) → rgba(255,255,255,0.7)
active bg:   var(--sidebar-active-bg)
active text: var(--sidebar-active-text)
border:      var(--sidebar-border) → rgba(255,255,255,0.08)
width:       var(--sidebar-w) → 240px / var(--sidebar-w-collapsed) → 64px
```

### Panel overlay (nouveau)
```
background:  #ffffff (var(--surface))
border-right: 1px solid var(--border)   → #e2e8f0
box-shadow:  4px 0 24px rgba(0,0,0,0.08)
width:       220px
z-index:     30
position:    fixed
top:         0
left:        var(--sidebar-w) ou var(--sidebar-w-collapsed) selon l'état

Section headers:
  font-size:     10.5px
  font-weight:   700
  letter-spacing: 0.07em
  text-transform: uppercase
  color:         var(--text-3)   → #5a7a96
  font-family:   var(--font-display)

Items actifs:
  color:      var(--primary)       → #2D7DD2
  background: var(--primary-light) → rgba(45,125,210,0.08)
  font-weight: 600

Items inactifs:
  color:      var(--text-2) → #3d5166
  font-weight: 400
```

### Séparateurs entre grandes sections NAV
Les sections TIERS / VENTES / ACHATS / etc. doivent avoir une séparation visuelle plus marquée entre elles pour que la distinction soit immédiate. Utiliser :
```
height: 1px
background: rgba(255,255,255,0.08)
margin: 8px 12px
```
Le header de section (texte uppercase) avec le trait bleu vertical à gauche reste tel quel.

---

## 9. POINTS D'ATTENTION

1. **Ne pas casser le mobile overlay** : Le sidebar mobile (`mobileOpen`) est indépendant du panel overlay. Les deux peuvent coexister sans conflit de z-index (mobile: z-50, panel overlay: z-30).

2. **Collapsed sidebar** : En mode collapsed, les items overlay sont des boutons icône seulement. Le panel overlay s'ancre à `left: var(--sidebar-w-collapsed)` (64px). Tester ce cas.

3. **Rôles & filtrage** : Les items avec `roles: ['admin']` restent filtrés avec `!item.roles || item.roles.includes(user?.role ?? '')` — même logique qu'actuellement.

4. **`isActive` pour les items overlay** : Un item overlay est "actif" si `overlayPanel === item.overlay` OU si `pathname.startsWith(item.href)`. Ne pas utiliser uniquement `pathname` car l'utilisateur peut ouvrir le panel sans naviguer.

5. **Approbations** : La route `/approvals` n'est pas encore implémentée côté frontend. Mettre l'item avec `roles: ['admin']` mais la page peut être un placeholder `En cours de développement`.

6. **`pnpm tsc --noEmit` après chaque phase** — ne jamais passer à la phase suivante si TypeScript échoue.

---

Ce prompt est complet et auto-suffisant. Il couvre tous les modules trouvés dans le backend (30 modules analysés) et tient compte de l'architecture existante de la sidebar.

---

## 10. REFONTE DE LA TOPBAR

### Fichier : `bridge-frontend/src/components/layout/Topbar.tsx`

**Lire le fichier en entier (428 lignes) avant modification.** La topbar actuelle contient : hamburger mobile, breadcrumb, search, notifications bell. Elle fonctionne bien. Les changements sont :

1. **Mettre à jour `LABELS`** avec tous les nouveaux segments de routes
2. **Ajouter un bouton `+` Créer rapide** avec dropdown
3. **Ajouter l'avatar utilisateur** à droite (migré depuis la sidebar)
4. **Retirer le user menu de la sidebar** (`Sidebar.tsx`) une fois le menu migré dans la topbar

#### A. Mise à jour de `LABELS` (breadcrumb)

Ajouter dans l'objet `LABELS` existant :

```typescript
const LABELS: Record<string, string> = {
  // ── existants ────────────────────────────────────────────────
  dashboard:     'Tableau de bord',
  clients:       'Clients',
  products:      'Produits & Services',
  proformas:     'Proformas',
  invoices:      'Factures',
  payments:      'Paiements',
  recurring:     'Récurrentes',
  reports:       'Rapports',
  notifications: 'Notifications',
  users:         'Utilisateurs',
  audit:         "Journaux d'audit",
  profile:       'Mon profil',
  settings:      'Paramètres',
  company:       'Entreprise',
  billing:       'Facturation',
  security:      'Sécurité',
  backups:       'Sauvegardes',
  new:           'Nouveau',

  // ── nouveaux ─────────────────────────────────────────────────
  suppliers:            'Fournisseurs',
  'purchase-orders':    'Bons de commande',
  'supplier-invoices':  'Factures fournisseurs',
  expenses:             'Dépenses & Frais',
  categories:           'Catégories',
  budgets:              'Budgets',
  stock:                'Stock',
  movements:            'Mouvements',
  levels:               'Niveaux de stock',
  alerts:               'Alertes',
  bank:                 'Banque',
  accounts:             'Comptes bancaires',
  import:               'Import relevé',
  transactions:         'Transactions',
  reconciliations:      'Rapprochements',
  'matching-rules':     'Règles de matching',
  accounting:           'Comptabilité',
  chart:                'Plan comptable',
  periods:              'Périodes fiscales',
  journals:             'Journaux',
  entries:              'Écritures',
  lettering:            'Lettrage',
  'tax-declarations':   'Déclarations TVA',
  roles:                'Rôles & Permissions',
  permissions:          'Permissions',
  approvals:            'Approbations',
  assistant:            'BTS Assistant',
  guide:                'Guide',
  offices:              'Bureaux',
  'tax-rates':          'Taux de TVA',
  'email-templates':    'Templates email',
  webhooks:             'Webhooks',
  'api-keys':           "Clés API",
  'custom-fields':      'Champs personnalisés',
  'workflow-rules':     'Règles workflow',
  'ip-whitelist':       'Whitelist IP',
  exports:              'Exports',
  outlook:              'Microsoft Outlook',
  sage:                 'Export Sage',
}
```

#### B. Bouton `+` Créer rapide

Ajouter entre la barre de recherche et la cloche de notification. Le dropdown s'ouvre vers le bas, liste les actions de création les plus fréquentes.

```tsx
// State à ajouter dans Topbar()
const [createOpen, setCreateOpen] = useState(false)
const createRef = useRef<HTMLDivElement>(null)

// Fermeture clic extérieur — même pattern que la recherche
useEffect(() => {
  function handler(e: MouseEvent) {
    if (createRef.current && !createRef.current.contains(e.target as Node)) {
      setCreateOpen(false)
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [])

// Liste des actions rapides
const CREATE_ACTIONS = [
  { label: 'Nouvelle facture',        href: '/invoices/new',        icon: Receipt,       color: '#10b981' },
  { label: 'Nouveau proforma',        href: '/proformas/new',       icon: FileText,      color: '#3b82f6' },
  { label: 'Bon de commande',         href: '/purchase-orders/new', icon: ShoppingCart,  color: '#8b5cf6' },
  { label: 'Nouvelle dépense',        href: '/expenses/new',        icon: Wallet,        color: '#f59e0b' },
  { label: 'Nouveau client',          href: '/clients/new',         icon: Users,         color: '#6366f1' },
  { label: 'Nouveau fournisseur',     href: '/suppliers/new',       icon: Building2,     color: '#64748b' },
]

// JSX du bouton + dropdown
<div ref={createRef} style={{ position: 'relative', flexShrink: 0 }}>
  <button
    type="button"
    onClick={() => setCreateOpen((o) => !o)}
    aria-label="Créer un élément"
    aria-expanded={createOpen}
    aria-haspopup="menu"
    style={{
      display:        'flex',
      alignItems:     'center',
      gap:            6,
      height:         36,
      padding:        '0 14px',
      background:     'var(--primary)',
      color:          '#fff',
      border:         'none',
      borderRadius:   'var(--radius-md)',
      cursor:         'pointer',
      fontSize:       13,
      fontWeight:     600,
      fontFamily:     'var(--font-display)',
      flexShrink:     0,
      boxShadow:      '0 2px 8px rgba(45,125,210,0.35)',
      transition:     'background 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = '#1a65c0'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(45,125,210,0.5)' }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(45,125,210,0.35)' }}
  >
    <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
    <span className="hidden sm:inline">Créer</span>
  </button>

  {createOpen && (
    <div
      role="menu"
      style={{
        position:     'absolute',
        top:          'calc(100% + 8px)',
        right:        0,
        background:   'var(--surface)',
        border:       '1.5px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    '0 16px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
        zIndex:       100,
        minWidth:     220,
        overflow:     'hidden',
        padding:      '6px',
      }}
    >
      <p style={{
        fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--font-display)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        color: 'var(--text-3)', padding: '6px 10px 4px', margin: 0,
      }}>
        Créer rapidement
      </p>
      {CREATE_ACTIONS.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          role="menuitem"
          onClick={() => setCreateOpen(false)}
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            10,
            padding:        '8px 10px',
            borderRadius:   8,
            color:          'var(--text-1)',
            textDecoration: 'none',
            fontSize:       13,
            fontFamily:     'var(--font-body)',
            fontWeight:     500,
            transition:     'background 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <span style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: action.color + '18',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <action.icon size={13} style={{ color: action.color }} aria-hidden="true" />
          </span>
          {action.label}
        </Link>
      ))}
    </div>
  )}
</div>
```

#### C. Avatar utilisateur dans la topbar (migration depuis la sidebar)

Ajouter l'avatar à l'extrême droite de la topbar. Il ouvre un dropdown identique à celui actuellement en bas de la sidebar. Une fois implémenté ici, **supprimer la zone utilisateur de `Sidebar.tsx`** (la section avec `userTriggerRef`, `userMenuRef`, le menu profil/déconnexion) pour éviter la duplication.

```tsx
// Imports à ajouter dans Topbar.tsx
import { useAuthStore } from '@/features/auth/store'
import { useLogout } from '@/features/auth/hooks'
import { useMe } from '@/features/users/hooks'
import { User, KeyRound, LogOut, ChevronDown } from 'lucide-react'

// Dans Topbar() — state et refs
const user         = useAuthStore((s) => s.user)
const { data: me } = useMe()
const logoutMut    = useLogout()
const [userOpen, setUserOpen] = useState(false)
const userRef      = useRef<HTMLDivElement>(null)
const displayName  = user ? `${user.firstName} ${user.lastName}` : '—'
const initials     = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '?'

// Fermeture clic extérieur
useEffect(() => {
  function handler(e: MouseEvent) {
    if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false)
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [])

// JSX — après la cloche de notification
<div ref={userRef} style={{ position: 'relative', flexShrink: 0 }}>
  <button
    type="button"
    onClick={() => setUserOpen((o) => !o)}
    aria-label={`Menu utilisateur — ${displayName}`}
    aria-expanded={userOpen}
    aria-haspopup="menu"
    style={{
      display:        'flex',
      alignItems:     'center',
      gap:            8,
      height:         36,
      padding:        '0 10px 0 6px',
      background:     userOpen ? 'var(--surface-2)' : 'transparent',
      border:         '1.5px solid',
      borderColor:    userOpen ? 'var(--border)' : 'transparent',
      borderRadius:   'var(--radius-md)',
      cursor:         'pointer',
      transition:     'background 0.15s, border-color 0.15s',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
    onMouseLeave={(e) => { if (!userOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' } }}
  >
    {/* Avatar */}
    <span
      role="img"
      aria-label={`Avatar de ${displayName}`}
      style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, var(--primary) 0%, #1a5fa8 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-display)',
        color: '#fff', overflow: 'hidden',
      }}
    >
      {me?.avatarUrl
        ? <img src={me.avatarUrl} alt="" aria-hidden="true" style={{ width: 28, height: 28, objectFit: 'cover' }} />
        : <span aria-hidden="true">{initials}</span>
      }
    </span>

    {/* Nom + rôle — masqué sur mobile */}
    <span className="hidden md:flex" style={{ flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' }}>
        {displayName}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
        {user?.role ?? ''}
      </span>
    </span>

    <ChevronDown
      size={13}
      aria-hidden="true"
      className="hidden md:block"
      style={{ color: 'var(--text-3)', transition: 'transform 0.2s', transform: userOpen ? 'rotate(180deg)' : 'none' }}
    />
  </button>

  {/* Dropdown menu */}
  {userOpen && (
    <div
      role="menu"
      aria-label={`Menu de ${displayName}`}
      style={{
        position:     'absolute',
        top:          'calc(100% + 8px)',
        right:        0,
        background:   'var(--surface)',
        border:       '1.5px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    '0 16px 40px rgba(0,0,0,0.12)',
        zIndex:       100,
        minWidth:     200,
        overflow:     'hidden',
        padding:      '6px',
      }}
    >
      {/* Info utilisateur */}
      <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
          {displayName}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-3)' }}>
          {user?.email ?? ''}
        </p>
      </div>

      {[
        { icon: User,     label: 'Mon profil',           href: ROUTES.PROFILE },
        { icon: KeyRound, label: 'Changer mot de passe', href: `${ROUTES.PROFILE}#password` },
      ].map((item) => (
        <Link
          key={item.href}
          href={item.href}
          role="menuitem"
          onClick={() => setUserOpen(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 8,
            color: 'var(--text-1)', textDecoration: 'none',
            fontSize: 13, fontFamily: 'var(--font-body)',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <item.icon size={14} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
          {item.label}
        </Link>
      ))}

      <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />

      <button
        role="menuitem"
        onClick={() => { logoutMut.mutate(); setUserOpen(false) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '8px 10px', borderRadius: 8,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: '#ef4444', fontSize: 13, fontFamily: 'var(--font-body)',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <LogOut size={14} strokeWidth={1.8} aria-hidden="true" />
        Déconnexion
      </button>
    </div>
  )}
</div>
```

#### D. Layout final de la topbar

```
[☰ mobile] [Breadcrumb... flex-1] [🔍 Search] [+ Créer] [🔔] [Avatar ▾]
```

Sur mobile (`< sm`) : hamburger visible, nom/rôle masqué dans l'avatar, label "Créer" masqué (icône `+` seulement).

#### E. Ce qu'il faut supprimer de `Sidebar.tsx`

Une fois l'avatar migré dans la topbar, retirer de `Sidebar.tsx` :
- Le `ref={userTriggerRef}` et tout le bloc `<button>` zone utilisateur
- Le `ref={userMenuRef}` et le menu dropdown utilisateur
- Les imports `useLogout`, `useMe` (si plus utilisés dans la sidebar)
- Les refs `userTriggerRef`, `userMenuRef`
- Le state `userMenuOpen`
- Les handlers `handleMenuKeyDown`, `closeUserMenu`
- Dans `handleGlobalKeyDown` : retirer la branche `if (userMenuOpen)` (plus nécessaire)

**Attention** : garder `useAuthStore` dans `Sidebar.tsx` — il est toujours utilisé pour filtrer les items par rôle (`user?.role`).

---

## 11. ORDRE D'IMPLÉMENTATION COMPLET (sidebar + topbar)

### Phase 1 — Fondations (30 min)
1. Lire `constants.ts` → ajouter les nouvelles ROUTES
2. Lire `sidebar.ts` → ajouter `overlayPanel` + `setOverlayPanel`
3. `pnpm tsc --noEmit` → EXIT 0

### Phase 2 — Config overlay (20 min)
4. Créer `overlay-panels.ts` avec les 4 panels (bank, accounting, roles, settings)
5. Vérifier disponibilité de chaque icône Lucide

### Phase 3 — OverlaySubNav (45 min)
6. Créer `OverlaySubNav.tsx`
7. Ajouter `@keyframes slideInLeft` dans `globals.css`

### Phase 4 — Sidebar refonte (1h)
8. Lire `Sidebar.tsx` en entier
9. Mettre à jour types + constante NAV + footer nav
10. Adapter rendu items overlay (button vs Link)
11. Brancher `OverlaySubNav` dans le return
12. Retirer la zone utilisateur (user menu) de la sidebar
13. `pnpm tsc --noEmit` → EXIT 0

### Phase 5 — Topbar refonte (45 min)
14. Lire `Topbar.tsx` en entier
15. Mettre à jour `LABELS` avec les nouveaux segments
16. Ajouter le bouton `+` Créer rapide
17. Ajouter l'avatar utilisateur avec dropdown
18. `pnpm tsc --noEmit` → EXIT 0

### Phase 6 — Vérification finale (30 min)
19. `pnpm build` → EXIT 0
20. Vérifier visuellement :
    - Topbar : breadcrumb correct sur chaque route, `+` dropdown, avatar dropdown
    - Sidebar : toutes les sections, collapsed mode
    - Panels overlay : Banque, Comptabilité, Rôles, Paramètres
    - Mobile : hamburger, overlay sidebar
    - ESC ferme les panels overlay ET les dropdowns topbar

---

## 12. DESIGN — RÈGLES VISUELLES FINALES

### Topbar
```
height:      var(--topbar-h)
background:  var(--topbar-bg)       → blanc ou #fafafa
box-shadow:  var(--topbar-shadow)   → 0 1px 3px rgba(0,0,0,0.06)
position:    sticky, top: 0, z-index: 20

Bouton [+ Créer] :
  background: var(--primary) → #2D7DD2
  color: #fff
  border-radius: var(--radius-md) → 10px
  height: 36px
  padding: 0 14px
  box-shadow: 0 2px 8px rgba(45,125,210,0.35)
  hover: background #1a65c0, shadow plus marquée

Avatar button :
  border: 1.5px solid transparent
  hover/open: border var(--border), background var(--surface-2)
  borderRadius: var(--radius-md)

Dropdowns (Créer + Avatar) :
  background: var(--surface)
  border: 1.5px solid var(--border)
  border-radius: var(--radius-lg) → 14px
  box-shadow: 0 16px 40px rgba(0,0,0,0.12)
  z-index: 100
  items hover: background var(--surface-2)
  items border-radius: 8px
  padding items: 8px 10px
  icône items : dans un carré 28×28, border-radius 7px, fond couleur+18 (alpha)
```

### Sidebar (rappel)
```
Sections grandes (TIERS, VENTES, ACHATS...) :
  Séparateur entre sections : height 1px, rgba(255,255,255,0.08), margin 8px 12px
  Header section : uppercase, 11px, Sora 700, rgba(120,170,210,0.85)
  Trait vertical coloré à gauche du header : 3px, rgba(45,125,210,0.5)

Items avec overlay :
  Même style qu'un Link actif quand overlayPanel === item.overlay
  Cursor: pointer, pas de underline
```

### Panel overlay
```
background:   #ffffff
border-right: 1px solid var(--border)
box-shadow:   4px 0 24px rgba(0,0,0,0.08)
width:        220px
z-index:      30
animation:    slideInLeft 0.25s cubic-bezier(0.4,0,0.2,1)

Header panel :
  height: var(--topbar-h)
  border-bottom: 1px solid var(--border)
  icône + titre (Sora 700, 14px, var(--text-1))
  bouton × fermer à droite

Section headers :
  10.5px, Sora 700, uppercase, letter-spacing 0.07em, var(--text-3)
  padding: 8px 16px 4px

Items :
  padding: 7px 16px, margin: 1px 8px, border-radius 6px
  active: color var(--primary), background var(--primary-light) rgba(45,125,210,0.08), fontWeight 600
  inactif: color var(--text-2), fontWeight 400
  hover: background var(--surface-2)
  icône: 14px, active→var(--primary), inactif→var(--text-3)
```
