# Design — Module Utilisateurs & Rôles

> **Statut** : Spécifications à implémenter  
> **Périmètre** : `bridge-frontend` — pages `/users` et `/roles` + features associées  
> **Charte graphique** : Sora (display) · DM Sans (body) · JetBrains Mono · Primary `#2D7DD2` · Sidebar `#0c2340`

---

## Contexte & Inspiration

### Références de référence analysées
| Logiciel | Ce qu'on retient |
|---|---|
| **Linear** | Cards rôles avec compteur membres, permissions checkboxes groupées par section |
| **Vercel Dashboard** | KPI strip horizontal, table dense avec avatars circulaires, badges statut dotted |
| **GitHub (Org Settings)** | Matrice permissions en grille module × action, toggle "Tout accorder" par ligne |
| **Notion** | Drawer latéral pour création/édition (pas de modal centré), transitions 200ms |
| **Retool / Clerk** | Permissions groupées par domaine métier, barre de progression "couverture" |

### Règles de design — charte existante à respecter
- **Composants réutilisables** : `PageHeader`, `ActionMenu`, `RichEmptyState`, `AdjustStockDrawer` (pattern drawer), `.card`, `animate-pulse`
- **CSS variables uniquement** : `var(--primary)`, `var(--surface)`, `var(--border)`, `var(--text-1/2/3)`, `var(--radius-*)`, `var(--shadow-*)`
- **Fonts** : `var(--font-display)` (Sora) pour titres/labels, `var(--font-body)` (DM Sans) pour texte courant, `var(--font-mono)` (JetBrains) pour IDs/refs
- **Tiroir latéral** (drawer) pour création/édition — pas de modale centrée (cohérence avec bank, products, stock)
- **Minimum 44px** sur tout élément interactif (boutons, lignes cliquables)
- **Transitions** : `150–300ms`, propriété `background` ou `opacity` (jamais `width`/`height`)
- **Skeleton pulse** sur tous les états de chargement
- `ActionMenu` pour les actions contextuelles de chaque ligne/card

---

## Module 1 — Utilisateurs

### Page 1.1 — `/users` · Liste des utilisateurs

**Fichier** : `src/app/(dashboard)/users/page.tsx`

#### Vue d'ensemble
Page principale d'administration des comptes. Accessible uniquement aux rôles ayant `users:read`. Les actions d'écriture (créer, modifier, suspendre) requièrent `users:manage`.

---

#### Zone 1 — PageHeader
```
┌─────────────────────────────────────────────────────────────────┐
│  Utilisateurs                          [+ Créer un compte]      │
│  12 comptes enregistrés                                         │
└─────────────────────────────────────────────────────────────────┘
```
- Composant `PageHeader` existant
- Bouton "+ Créer un compte" : visible admin uniquement, ouvre le **Drawer de création**
- Sous-titre : `{total} compte{s}` avec `aria-live="polite"`

---

#### Zone 2 — Bande KPI (4 métriques)

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  👤 12       │ │  ✅ 9        │ │  ⛔ 2        │ │  ⏳ 1        │
│  Total       │ │  Actifs      │ │  Suspendus   │ │  En attente  │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```
- 4 cards `className="card"` en `display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px`
- Icônes Lucide : `Users` / `UserCheck` / `UserX` / `Clock`
- Chiffre en `fontSize: 22, fontWeight: 800, fontFamily: var(--font-display)`
- Label en `fontSize: 11.5, color: var(--text-3)`
- Couleur des icônes :  
  - Total → `var(--primary)`  
  - Actifs → `#10b981`  
  - Suspendus → `#ef4444`  
  - En attente → `#f59e0b`
- Les métriques se calculent depuis `data` (count par statut) ou via appel dédié
- **Skeleton** : 4 blocs pulsants pendant le chargement

---

#### Zone 3 — Barre de filtres

```
┌────────────────────────────────────────────────────────────┐
│  🔍 [Rechercher par nom, email…]  [Tous les rôles ▾]       │
│                                   [Tous les statuts ▾]     │
└────────────────────────────────────────────────────────────┘
```
- Conteneur `.card` avec `padding: 14px 18px`
- Champ recherche : `flex: 1 1 240px`, icône `Search` absolute-left, debounce 300ms
- Sélect **Rôle** : peuplé depuis `useRoles()`, option "Tous les rôles" par défaut
- Sélect **Statut** : options fixes `active` / `suspended` / `pending_activation`
- Bouton **Effacer** visible seulement si un filtre actif (`X` Lucide, `color: var(--text-3)`)
- Chaque changement : reset page à 1

---

#### Zone 4 — Tableau des utilisateurs

Colonnes :
| # | Colonne | Largeur | Contenu |
|---|---|---|---|
| 1 | **Utilisateur** | flex | Avatar + Nom + Email + badge "Vous" |
| 2 | **Rôle** | 130px | `RoleBadge` coloré |
| 3 | **Statut** | 110px | `UserStatusBadge` avec dot animé |
| 4 | **2FA** | 60px | `ShieldCheck` vert si activé, `ShieldOff` gris sinon |
| 5 | **Dernière connexion** | 140px | `formatDate()` ou "—" |
| 6 | **Actions** | 40px | `ActionMenu` |

**Avatar** :
- Photo si `avatarUrl`, sinon initiales sur fond coloré déterministe (hash de l'ID)
- `width: 36, height: 36, borderRadius: '50%'`
- Anneau de couleur optionnel correspondant au rôle (`box-shadow: 0 0 0 2px {roleColor}30`)

**Ligne cliquable** :
- `role="button"`, `tabIndex={0}`, `cursor: pointer`
- `onClick` → `router.push(ROUTES.USERS + '/' + user.id)`
- Hover : `background: var(--surface)`
- Transition : `150ms`

**`ActionMenu`** (admin uniquement) :
- Modifier → ouvre Drawer édition
- Réinitialiser le MDP → ouvre modale ResetPassword
- Suspendre / Réactiver → selon statut actuel, modale de confirmation
- Séparateur avant action destructive

**Pagination** :
- Composant existant (ChevronLeft/Right + numéros de page)
- Affichée seulement si `totalPages > 1`
- `aria-label="Pagination des utilisateurs"`

**État vide** :
- `RichEmptyState` avec icône `Users`, titre "Aucun utilisateur trouvé"
- Si filtres actifs : message "Aucun résultat pour ces filtres" + bouton "Effacer les filtres"

---

#### Zone 5 — Drawer de création/édition (latéral droit)

```
╔══════════════════════════════╗
║  [←]  Créer un compte        ║
╠══════════════════════════════╣
║  Prénom *         Nom *       ║
║  [___________]   [__________]║
║                               ║
║  Email *                      ║
║  [________________________]  ║
║                               ║
║  Téléphone                   ║
║  [________________________]  ║
║                               ║
║  Rôle *                      ║
║  [Sélectionner un rôle ▾]    ║
║                               ║
║  [Annuler]   [Créer le compte]║
╚══════════════════════════════╝
```
- Pattern identique à `AdjustStockDrawer` / `BankAccountDrawer`
- Largeur : `420px`, position fixed droite, overlay sombre avec `backdropFilter: blur(4px)`
- Animation slide-in : `transform: translateX(100%)` → `translateX(0)` en 280ms `ease-out`
- En mode **édition** : email désactivé (non modifiable), label "Modifier l'utilisateur"
- Validation inline (onBlur) : messages sous chaque champ en rouge `role="alert"`
- Bouton Enregistrer : `background: var(--primary)`, `boxShadow: 0 4px 12px rgba(45,125,210,0.3)`
- `aria-busy` + spinner `Loader2` pendant mutation

---

### Page 1.2 — `/users/[id]` · Profil utilisateur

**Fichier** : `src/app/(dashboard)/users/[id]/page.tsx`

#### Vue d'ensemble
Page de détail d'un utilisateur. Accessible à l'admin pour tout utilisateur, à l'utilisateur courant pour son propre profil.

---

#### Zone 1 — Navigation
```
← Retour aux utilisateurs     Utilisateurs / Jean-Pierre Kamga
```
- Bouton retour textuel (pas de `<Link>`, `useRouter().back()`)
- **Fil d'Ariane** (breadcrumb) en desktop : `Utilisateurs > Prénom Nom`
  - `aria-label="Fil d'Ariane"`, `aria-current="page"` sur le dernier élément

---

#### Zone 2 — Hero Card

```
┌──────────────────────────────────────────────────────────────────┐
│  [Avatar 72px]  Jean-Pierre Kamga          [Commercial] [Actif] │
│                 jean@bts.cm                                      │
│                 +237 6XX XXX XXX                                 │
│                                                                  │
│  [Modifier]  [Réinitialiser MDP]  [Suspendre]                   │
└──────────────────────────────────────────────────────────────────┘
```
- Avatar : `72px`, fond coloré déterministe, border `3px solid {roleColor}30`
- Nom : `fontSize: 22, fontWeight: 800, var(--font-display)`
- Email : `var(--font-mono)`, `color: var(--text-3)`
- Badges rôle + statut alignés horizontalement après le nom
- Boutons d'action (admin uniquement, ou soi-même pour "Modifier") :
  - **Modifier** : neutre `var(--surface)`
  - **Réinitialiser MDP** : amber `rgba(217,119,6,0.06)` / border amber
  - **Suspendre** : rouge `rgba(239,68,68,0.05)` / border rouge
  - **Réactiver** : vert `rgba(16,185,129,0.06)` / border vert
  - **Supprimer** : masqué si l'utilisateur a une activité (ou admin uniquement)

---

#### Zone 3 — Onglets de sections (tabs)

```
[Informations]  [Sécurité]  [Activité]  [Préférences*]
```
- Onglets inline (`display: flex; gap: 0; borderBottom: 1px solid var(--border)`)
- Onglet actif : `borderBottom: 2px solid var(--primary)`, `color: var(--primary)`, `fontWeight: 700`
- Onglet inactif : `color: var(--text-3)`, hover `color: var(--text-1)`
- `*` Onglet "Préférences" visible uniquement si `isSelf` (profil personnel)
- Transition 150ms

**Onglet Informations** :
- Email, Téléphone, Rôle (badge), Dernière connexion (`<time>`), Membre depuis (`<time>`)
- Pattern `InfoRow` existant (icône + label + valeur)

**Onglet Sécurité** :
- Double authentification (`ShieldCheck`/`ShieldOff`)
- Changement de MDP requis (`KeyRound`)
- Sessions actives (si disponible via API future)

**Onglet Activité** :
- Timeline verticale des 30 derniers événements
- Chaque entrée : dot coloré + label action + entityType + date
- Skeleton animé pendant chargement
- `ACTION_LABELS` pour libellés français

**Onglet Préférences** (soi-même uniquement) :
- Langue (FR/EN)
- Fuseau horaire
- Thème (Clair / Sombre / Système)
- Bouton "Enregistrer les préférences"
- Mutation sur `PUT /users/me`

---

#### Modales (réutilisées) :
- `EditModal` → drawer (refacto vers pattern drawer)
- `ResetPasswordModal` → modale centré (ok, action sensible/rare)
- `ConfirmModal` → modale centré (suspend / réactiver)

---

## Module 2 — Rôles *(entièrement à créer)*

> Les rôles définissent les permissions d'accès dans InvoiceHub. Il existe des **rôles système** (non supprimables) et des **rôles personnalisés** (créés par un admin).

### Nouveaux fichiers à créer

```
bridge-frontend/src/
├── features/roles/
│   ├── types.ts          ← types TypeScript
│   ├── api.ts            ← appels HTTP
│   └── hooks.ts          ← hooks TanStack Query
│
├── app/(dashboard)/roles/
│   ├── page.tsx          ← liste des rôles
│   ├── loading.tsx       ← skeleton
│   ├── error.tsx         ← error boundary
│   └── [id]/
│       ├── page.tsx      ← détail + permissions
│       └── loading.tsx
```

---

### Page 2.1 — `/roles` · Liste des rôles

**Fichier** : `src/app/(dashboard)/roles/page.tsx`

#### Vue d'ensemble
Affiche tous les rôles de l'organisation sous forme de **cards** (pas de tableau). Chaque card donne une vue rapide du périmètre du rôle et de ses membres.

---

#### Zone 1 — PageHeader

```
┌─────────────────────────────────────────────────────────────────┐
│  Rôles & Permissions                   [+ Créer un rôle]        │
│  5 rôles configurés                                             │
└─────────────────────────────────────────────────────────────────┘
```
- Bouton "+ Créer un rôle" visible admin (`roles:manage`) uniquement
- Ouvre le **Drawer de création** (pas de navigation)

---

#### Zone 2 — Grille de cards

Layout : `display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px`

**Structure d'une RoleCard** :

```
┌──────────────────────────────────────────────┐
│  [icône Shield]  Administrateur   [🔒Système]│  ← en-tête
│                  Accès complet à tout        │
├──────────────────────────────────────────────┤
│  👥 3 utilisateurs                           │  ← membres
│  [Av] [Av] [Av] +0 autre                    │
├──────────────────────────────────────────────┤
│  Couverture des permissions                  │  ← barre progression
│  ████████████░░░░░  52 / 58 permissions      │
├──────────────────────────────────────────────┤
│  clients:read  invoices:*  payments:read     │  ← aperçu perms
│  + 49 autres…                                │
└──────────────────────────────────────────────┘
              [Voir & modifier →]               ← actions bas
```

**Détail design de la RoleCard :**

**En-tête**
- Icône `Shield` (Lucide) dans un carré `40×40` couleur déterministe (hash sur `role.name`)
- Nom (`displayName`) : `fontSize: 15, fontWeight: 700, var(--font-display)`
- Description courte : `fontSize: 12.5, color: var(--text-3), fontStyle: italic`
- Badge **Système** : `Lock` + "Système", fond `rgba(100,116,139,0.08)`, border slate, si `isSystem: true`
- Menu `ActionMenu` en `position: absolute; top: 12; right: 12` :
  - Modifier → Drawer édition *(masqué si `isSystem`)*
  - Supprimer → Modale confirmation *(masqué si `isSystem` ou `_count.users > 0`)*

**Section membres**
- Compteur : `{n} utilisateur{s}` — `Users` (Lucide), `fontSize: 12.5, color: var(--text-3)`
- Pile d'avatars (`display: flex; marginLeft: -6px` par avatar) : 3 premiers
- Si 0 utilisateur : "Aucun membre assigné" en italique

**Barre de couverture**
- `progress = role.permissions.length / ALL_PERMISSIONS.length * 100`
- `height: 4px, borderRadius: 99, background: var(--border)`
- Fill : `background: var(--primary)` avec `transition: width 600ms ease-out`
- Label : `{n} / {total} permissions`
- Si `role.permissions.includes('*')` → barre 100% + badge "Super admin" orange

**Aperçu permissions**
- Max 4 badges inline : `fontSize: 10.5, fontFamily: var(--font-mono), padding: 2px 6px, borderRadius: 4, background: var(--surface-2), border: 1px solid var(--border), color: var(--text-2)`
- Si plus : "+{n} autres…" en gris
- Prioriser les permissions avec `*` et les plus importantes (celles finissant par `:*`)

**Bas de card**
- `borderTop: 1px solid var(--border)`
- Lien "Voir & modifier →" : `color: var(--primary), fontSize: 13, fontWeight: 600`
- Navigue vers `/roles/{id}`

**État hover de la card**
- `boxShadow: var(--shadow-md)`, `transform: translateY(-2px)`, `transition: 180ms`

---

#### Zone 3 — Drawer de création d'un rôle

```
╔══════════════════════════════╗
║  ←  Créer un rôle            ║
╠══════════════════════════════╣
║  Nom technique *             ║
║  [commercial]                ║
║  Utilisé en interne (slug)   ║
║                               ║
║  Nom affiché *               ║
║  [Commercial]                ║
║                               ║
║  Description                 ║
║  [________________________]  ║
║                               ║
║  [Annuler]   [Créer le rôle] ║
╚══════════════════════════════╝
```
- Champ **Nom technique** : `lowercase`, `slugify` côté frontend (remplace espaces par `-`, retire accents), `var(--font-mono)`
- Champ **Nom affiché** : texte libre
- Champ **Description** : textarea optionnel
- Après création → naviguer vers `/roles/{newId}` pour configurer les permissions

---

#### Zone 4 — État vide

- `RichEmptyState` avec icône `ShieldOff`, titre "Aucun rôle", description "Créez votre premier rôle pour définir les accès"
- Bouton "Créer un rôle" (admin uniquement)

---

### Page 2.2 — `/roles/[id]` · Détail du rôle + Matrice de permissions

**Fichier** : `src/app/(dashboard)/roles/[id]/page.tsx`

#### Vue d'ensemble
Page centrale du module rôles. Permet de visualiser et modifier l'ensemble des permissions d'un rôle via une **matrice interactive**, et de gérer les membres.

---

#### Zone 1 — Navigation
```
← Retour aux rôles        Rôles / Administrateur
```

---

#### Zone 2 — Hero Card du rôle

```
┌──────────────────────────────────────────────────────────────────┐
│  [Shield 56px]  Administrateur          [🔒 Système]             │
│                 Accès complet à toutes les fonctionnalités       │
│                 52 permissions · 3 membres                       │
│                                                                  │
│  [Modifier]  [Supprimer]                                         │
└──────────────────────────────────────────────────────────────────┘
```
- Icône Shield dans carré coloré `56×56`
- Boutons contextuels (masqués si `isSystem`) :
  - **Modifier** : ouvre Drawer édition (nom, displayName, description)
  - **Supprimer** : modale de confirmation (bloqué si `_count.users > 0`)
- Barre de couverture (même composant que dans la card)

---

#### Zone 3 — Matrice de permissions *(pièce maîtresse)*

**Layout général** :
```
┌────────────────────────────────────────────────────────────────────┐
│  Permissions                              [Enregistrer les modifications]
├─────────────────┬──────┬────────┬──────┬──────┬─────────┬─────────┤
│  Module         │ Lire │ Créer  │ Màj  │ Suppr│ Spécial │ Tout *  │
├─────────────────┼──────┼────────┼──────┼──────┼─────────┼─────────┤
│ ▼ Clients       │  ☑   │   ☑    │  ☑   │  ☐   │    —    │   ☐    │
│ ▼ Factures      │  ☑   │   ☑    │  ☑   │  ☐   │ Annuler │   ☐    │
│ ▼ Proformas     │  ☑   │   ☑    │  ☑   │  ☐   │    —    │   ☐    │
│ ▼ Paiements     │  ☑   │   ☑    │  —   │  ☑   │    —    │   —    │
│ ▼ Produits      │  ☑   │   ☐    │  ☐   │  ☐   │    —    │   ☐    │
│ ▼ Stock         │  ☑   │   ☑    │  —   │  —   │ Ajuster │   —    │
│ ▼ Banque        │  ☑   │   ☑    │  ☑   │  —   │ Import/ │   ☐    │
│                 │      │        │      │      │Rapproch.│        │
│ ▼ Comptabilité  │  ☑   │   ☑    │  —   │  —   │Valid/Cl │   ☐    │
│ ▼ Fournisseurs  │  ☑   │   ☐    │  ☐   │  ☐   │    —    │   ☐    │
│ ▼ Achats        │  ☑   │   ☐    │  ☐   │  ☐   │Approuv. │   —    │
│ ▼ Dépenses      │  ☑   │   ☐    │  ☐   │  ☐   │Approuv. │   —    │
│ ▼ Utilisateurs  │  ☑   │   —    │  —   │  —   │ Gérer   │   —    │
│ ▼ Rôles         │  ☑   │   —    │  —   │  —   │ Gérer   │   —    │
│ ▼ Rapports      │  ☑   │   —    │  —   │  —   │ Export  │   —    │
│ ▼ Paramètres    │  ☑   │   —    │  ☑   │  —   │    —    │   —    │
│ ▼ Autres        │  ...                                            │
├─────────────────┴──────┴────────┴──────┴──────┴─────────┴─────────┤
│  🔑 Super administrateur (*)  ☐  Accès complet à tout             │
└────────────────────────────────────────────────────────────────────┘
```

**Design de la matrice :**

- Conteneur `.card` avec `padding: 0, overflow: hidden`
- En-tête sticky : fond `var(--surface)`, `position: sticky; top: 0; zIndex: 10`
- Colonnes fixes : chaque action standard a une colonne
- **Groupement par module** (section pliable) :
  - En-tête de section : `background: var(--surface-2)`, `fontSize: 11, fontWeight: 700, textTransform: uppercase, letterSpacing: 0.08em, color: var(--text-3)`
  - Icône de module à gauche (ex: `Users` pour Utilisateurs, `Receipt` pour Factures...)
  - Toggle "Tout" à droite de la ligne d'en-tête → coche/décoche toutes les permissions du module
  - Section collapsible avec `ChevronDown` / `ChevronRight` (état mémorisé)

- **Cellule checkbox** :
  - `width: 44px, height: 44px` (touch target)
  - Checkbox custom : carré `18×18`, `borderRadius: 4`, `border: 1.5px solid var(--border)`
  - Coché : `background: var(--primary)`, checkmark SVG blanc, `boxShadow: 0 0 0 3px var(--primary-light)`
  - Hover non-coché : `border-color: var(--primary)`
  - `—` si la permission n'existe pas pour ce module
  - Désactivé (rôle système) : `opacity: 0.5, cursor: not-allowed`
  - Transition `150ms`

- **Ligne Super administrateur** :
  - `background: linear-gradient(90deg, rgba(217,119,6,0.04), transparent)`
  - `border: 1.5px solid rgba(217,119,6,0.2)` (amber)
  - Checkbox spéciale taille `22×22`, couleur `#d97706`
  - Cocher cette case → toutes les autres cases cochées visuellement + grisées
  - Label explicatif : "Accorde l'accès complet à toutes les fonctionnalités présentes et futures"

- **Bouton "Enregistrer"** :
  - `position: sticky; bottom: 0` dans le conteneur scrollable
  - Masqué si rôle système (`isSystem`)
  - `background: var(--primary)`, icône `Save`, spinner pendant mutation
  - Visible uniquement si des modifications ont eu lieu (`isDirty`)
  - Désactivé et grisé tant que `!isDirty`

**Logique des permissions par module** :

```typescript
const PERMISSION_GROUPS: Record<string, { label: string; icon: LucideIcon; perms: string[] }> = {
  clients:     { label: 'Clients',        icon: Users,       perms: ['clients:read','clients:create','clients:update','clients:delete','clients:*'] },
  invoices:    { label: 'Factures',       icon: Receipt,     perms: ['invoices:read','invoices:create','invoices:update','invoices:delete','invoices:cancel','invoices:*'] },
  proformas:   { label: 'Proformas',      icon: FileText,    perms: ['proformas:read','proformas:create','proformas:update','proformas:delete','proformas:*'] },
  payments:    { label: 'Paiements',      icon: CreditCard,  perms: ['payments:read','payments:create','payments:delete'] },
  products:    { label: 'Produits',       icon: Package,     perms: ['products:read','products:create','products:update','products:delete','products:*'] },
  stock:       { label: 'Stock',          icon: Warehouse,   perms: ['stock:read','stock:create','stock:adjust'] },
  bank:        { label: 'Banque',         icon: Landmark,    perms: ['bank:read','bank:create','bank:update','bank:reconcile','bank:manage','bank:import-parse','bank:import-confirm','bank:auto-match','bank:rules'] },
  accounting:  { label: 'Comptabilité',   icon: Calculator,  perms: ['accounting:read','accounting:create','accounting:validate','accounting:close','accounting:export'] },
  suppliers:   { label: 'Fournisseurs',   icon: Truck,       perms: ['suppliers:read','suppliers:create','suppliers:update','suppliers:delete','suppliers:*'] },
  purchases:   { label: 'Achats',         icon: ShoppingCart,perms: ['purchases:read','purchases:create','purchases:update','purchases:approve','purchases:delete'] },
  expenses:    { label: 'Dépenses',       icon: Wallet,      perms: ['expenses:read','expenses:create','expenses:update','expenses:approve','expenses:delete'] },
  users:       { label: 'Utilisateurs',   icon: UserCog,     perms: ['users:read','users:manage'] },
  roles:       { label: 'Rôles',          icon: Shield,      perms: ['roles:read','roles:manage'] },
  reports:     { label: 'Rapports',       icon: BarChart3,   perms: ['reports:read','reports:export'] },
  settings:    { label: 'Paramètres',     icon: Settings,    perms: ['settings:read','settings:update'] },
  audit:       { label: 'Audit',          icon: ScrollText,  perms: ['audit:read'] },
  dashboard:   { label: 'Tableau de bord',icon: LayoutDashboard, perms: ['dashboard:read'] },
  other:       { label: 'Autres',         icon: MoreHorizontal, perms: ['notifications:read','search:read','backups:read','backups:manage','approvals:admin','approvals:approve','approvals:view','approvals:view_own'] },
}
```

---

#### Zone 4 — Section Membres

```
┌──────────────────────────────────────────────────────────────┐
│  👥 Membres (3)                                              │
├──────────────────────────────────────────────────────────────┤
│  [Av] Jean-Pierre Kamga      jean@bts.cm      [Changer rôle]│
│  [Av] Marie Ngono            marie@bts.cm     [Changer rôle]│
│  [Av] Paul Ekwe              paul@bts.cm      [Changer rôle]│
└──────────────────────────────────────────────────────────────┘
```
- Liste des users ayant ce rôle (depuis `role.users` dans `findById`)
- Max 20 affichés (limité par l'API)
- Chaque ligne : avatar + nom + email + bouton "Changer de rôle" (ouvre sélecteur de rôle inline)
- "Changer de rôle" → `PUT /users/{userId}` avec `{ role: newRoleName }`
- Si 0 membres : message "Aucun utilisateur n'a ce rôle pour l'instant"

---

#### Drawer d'édition du rôle

Même structure que le Drawer de création mais pré-rempli :
- Nom technique : lecture seule (non modifiable après création)
- Nom affiché : modifiable
- Description : modifiable
- Appel : `PATCH /roles/{id}`

---

## Résumé des fichiers à créer / modifier

### À créer (nouveaux)
| Fichier | Description |
|---|---|
| `features/roles/types.ts` | `RoleEntry`, `Permission`, `PermissionGroup`, `CreateRolePayload`, `UpdateRolePayload` |
| `features/roles/api.ts` | `rolesApi.list()`, `.get(id)`, `.create()`, `.update()`, `.delete()`, `.listPermissions()` |
| `features/roles/hooks.ts` | `useRoles`, `useRole(id)`, `useCreateRole`, `useUpdateRole`, `useDeleteRole`, `usePermissions` |
| `app/(dashboard)/roles/page.tsx` | Liste des rôles (cards + drawer création) |
| `app/(dashboard)/roles/loading.tsx` | Skeleton grille de cards |
| `app/(dashboard)/roles/error.tsx` | Error boundary |
| `app/(dashboard)/roles/[id]/page.tsx` | Détail + matrice permissions + membres |
| `app/(dashboard)/roles/[id]/loading.tsx` | Skeleton page détail |
| `features/roles/components/RoleCard.tsx` | Composant card réutilisable |
| `features/roles/components/PermissionsMatrix.tsx` | Matrice interactive de permissions |
| `features/roles/components/RoleDrawer.tsx` | Drawer création/édition |

### À modifier (refactoring)
| Fichier | Modification |
|---|---|
| `app/(dashboard)/users/page.tsx` | Ajouter bande KPI, remplacer modal par drawer, ajouter colonne 2FA |
| `app/(dashboard)/users/[id]/page.tsx` | Ajouter onglets (tabs), drawer au lieu de modal edit, section Préférences |
| `features/users/api.ts` | Déplacer `rolesApi` vers `features/roles/api.ts`, garder import compat |
| `lib/constants.ts` | Ajouter `ROUTES.ROLES`, `ROUTES.ROLE_DETAIL` |

---

## Checklist UX (ui-ux-pro-max)

- [ ] Toutes les cibles interactives ≥ 44×44px
- [ ] `cursor: pointer` sur chaque élément cliquable
- [ ] Focus ring visible (`outline: 2px solid var(--primary)`)
- [ ] Transitions 150–300ms sur `background`, `opacity`, `transform`
- [ ] `aria-label` sur toutes les icônes seules (ActionMenu, Avatar...)
- [ ] `role="alert"` sur les messages d'erreur de formulaire
- [ ] `aria-busy` pendant les mutations
- [ ] Skeleton animé sur tous les états de chargement
- [ ] `aria-live="polite"` sur les compteurs dynamiques
- [ ] Validation onBlur (pas seulement onSubmit)
- [ ] Breadcrumb + `aria-current="page"` sur les pages de détail
- [ ] `@media (prefers-reduced-motion: reduce)` respecté pour les animations de drawer
- [ ] Contraste texte ≥ 4.5:1 (tous les labels sur fond clair vérifié)
- [ ] Aucun emoji utilisé comme icône (Lucide uniquement)

---

## Ordre d'implémentation recommandé

1. `features/roles/types.ts` + `api.ts` + `hooks.ts`
2. `features/roles/components/RoleDrawer.tsx`
3. `features/roles/components/PermissionsMatrix.tsx`
4. `features/roles/components/RoleCard.tsx`
5. `app/(dashboard)/roles/page.tsx` + `loading.tsx` + `error.tsx`
6. `app/(dashboard)/roles/[id]/page.tsx` + `loading.tsx`
7. Refactoring `users/page.tsx` (KPI strip + drawer + colonne 2FA)
8. Refactoring `users/[id]/page.tsx` (onglets + section préférences)
