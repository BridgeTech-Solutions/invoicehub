# Module Parametres — Design Spec & Implementation

> **Ref. design** : Stripe Dashboard · Vercel Project Settings · Linear App · Notion Settings  
> **Charte graphique BTS** : Sora (display) · DM Sans (body) · JetBrains Mono (mono) · Primary `#2D7DD2` · Sidebar `#0c2340` · Background `#f0f4f9`  
> **Standard** : SYSCOHADA · XAF · Douala, Cameroun

---

## 1. Pourquoi restructurer ?

### Problemes identifies dans la version originale

| Probleme | Impact |
|----------|--------|
| `workflows/` et `workflow-rules/` absents du `SettingsTabs.tsx` — pages inaccessibles | UX bloquant |
| Page `Entreprise` surchargee (identite + coordonnees + branding + finance) | Cognitive overload |
| `Facturation` mal nommee — contient TVA + bureaux + sequences | Confusion utilisateur |
| Tabs horizontaux cassent sur mobile | Scalabilite |

### Inspiration best-in-class

- **Stripe** : Sidebar fixe, sections groupees par domaine, sticky header
- **Vercel** : Sidebar icones + labels, danger zone bg `#fef2f2`
- **Linear** : Navigation section/sous-section, badges inline, toggle fluides
- **Notion** : Sidebar scrollable, groupes collapsibles

---

## 2. Architecture de navigation (REELLE)

### Comment fonctionne la nav Parametres

La navigation des Parametres **n'est pas une sidebar separee**. Elle utilise le systeme `OverlaySubNav` deja en place :

1. Bouton "Parametres" dans le footer de la sidebar principale → `setOverlayPanel('settings')`
2. `OverlaySubNav` slide depuis la gauche (220px, z-index 30), par-dessus la sidebar navy
3. La config des liens est dans `src/components/layout/overlay-panels.ts` → cle `settings`

```
Sidebar navy (0c2340)   OverlaySubNav (220px)    Contenu settings
+-----------------+    +-----------------+    +---------------------+
| ...             |    | Parametres  X   |    |                     |
| ...             |    | --------------- |    |  Section content    |
| ...             |    | ENTREPRISE      |    |                     |
|                 |    |  Informations   |    |                     |
| Parametres  <---+--->|  Branding & Doc |    |                     |
+-----------------+    |  Finance & TVA  |    +---------------------+
                       | COMPTE & SECU   |
                       |  Securite       |
                       |  Notifications  |
                       |  Sauvegardes    |
                       | AUTOMATISATION  |
                       |  Workflows      |
                       |  Regles workflow|
                       | DEVELOPPEUR     |
                       |  Cles API       |
                       |  Webhooks       |
                       |  IP Whitelist   |
                       |  Champs perso   |
                       |  Exports        |
                       +-----------------+
```

### Structure de fichiers

```
src/app/(dashboard)/settings/
├── layout.tsx                    <- wrapper minimal (juste <>{children}</>)
├── page.tsx                      <- redirect → /settings/company
│
├── company/page.tsx              <- Identite legale + Coordonnees
├── branding/page.tsx             <- Logo, cachet, signature, PDF en-tete/pied
├── billing/page.tsx              <- Params financiers + taux TVA + bureaux + sequences
├── security/page.tsx             <- Sessions, 2FA, historique connexions
├── notifications/page.tsx        <- Events, rappels, email templates
├── workflows/page.tsx            <- Workflows d'approbation
├── workflow-rules/page.tsx       <- Regles workflow
└── backups/page.tsx              <- Sauvegardes
```

Chaque sous-page a son propre `loading.tsx` et `error.tsx`.

---

## 3. Layout global du module

```
+----------------------------------------------------------------------+
|  Sidebar navy + OverlaySubNav Parametres (navigation deja geree)     |
|                                                                      |
|  PAGE CONTENT (max-width: ~900px)                                    |
|  +------------------------------------------------------------+      |
|  | PageHeader                                                 |      |
|  | Titre (22px Sora 700)    [Actions globales si besoin]      |      |
|  | Description (13px text-3)                                  |      |
|  +------------------------------------------------------------+      |
|                                                                      |
|  +------------------------------------------------------------+      |
|  | Section Card                                               |      |
|  | Title + Description header         [Save button]          |      |
|  | ---------------------------------------------------------- |      |
|  | Label          Input / Value                               |      |
|  +------------------------------------------------------------+      |
|                                                                      |
|  +------------------------------------------------------------+      |
|  | Danger Zone (si applicable) — bg #fef2f2 border #fca5a5    |      |
|  +------------------------------------------------------------+      |
+----------------------------------------------------------------------+
```

### Pattern Section Card

- Fond : `var(--surface-1)` (blanc)
- Border : `1px solid var(--border)`
- Border-radius : `12px`
- Padding : `24px`
- Title : `14px, font-weight: 700, var(--font-display)`
- Desc : `12.5px, var(--text-3)`
- Separateur header : `border-bottom: 1px solid var(--border)`, `margin-bottom: 16px`

---

## 4. Page 1 — Entreprise (`/settings/company`)

**Contenu : 2 sections**

### 4.1 Identite legale

Champs : raison sociale, forme juridique, NIU, RCCM, **code entreprise** (prefixe SYSCOHADA).

- Code entreprise : uppercase auto, preview live `BTS/DC/2026/01/FAC001`
- NIU : placeholder `M052116098443F`

### 4.2 Coordonnees

Champs : adresse, ville, pays, boite postale, telephone, email, site web.

---

## 5. Page 2 — Branding (`/settings/branding`)

**Contenu : 3 sections**

- **Logo** : PNG/SVG, max 2 MB, preview immediat, bouton Supprimer si asset present
- **En-tete & Pied de page PDF** : images 800×120px / 800×60px + `footerSafeZonePx` (marge securite)
- **Cachet & Signature** : 200×200px / 200×80px, note "non retroactif sur documents existants"

`AssetType` : `'logo' | 'stamp' | 'signature' | 'header' | 'footer'`

---

## 6. Page 3 — Finance & TVA (`/settings/billing`)

**Contenu : 4 sections**

### 6.1 Parametres financiers globaux

Champs : devise par defaut (XAF/EUR/USD), taux TVA par defaut (19,25 %), validite proformas (jours), echeance factures (jours).

Save bar apparait seulement si dirty.

### 6.2 Taux de TVA

Table CRUD inline avec : nom, code, taux %, statut actif/inactif, badge "Par defaut".

- Inline edit : clic crayon → row editable
- Suppression : `ConfirmDeleteModal`
- Taux par defaut : non supprimable

### 6.3 Bureaux & Agences

Table CRUD inline : code bureau (max 10 chars, uppercase), nom, ville, principal/agence.

- Les codes bureaux sont utilises dans la numerotation SYSCOHADA : `BTS/DC/2026/01/FAC001`
- Jamais de suppression physique (historique SYSCOHADA)

### 6.4 Sequences de numerotation

Read-only — format SYSCOHADA par bureau × type document (FAC, PFM, ACP, AVO).

---

## 7. Page 4 — Securite (`/settings/security`)

**Contenu : 3 sections**

- **Politiques** : expiration session, tentatives max, 2FA obligatoire
- **Sessions actives** : table avec revocation individuelle et globale, row "→ Vous" surlignee
- **Historique connexions** : 10 dernieres, icone succes/echec, badge IP inhabituelle

---

## 8. Page 5 — Notifications (`/settings/notifications`)

**Contenu : 3 sections**

- **Preferences** : 17 evenements × 2 canaux (in-app, email), toggles
- **Rappels & Escalade** : actif/inactif, jours avant echeance, niveaux L1→L4 CRUD inline
- **Templates email** : select template + editeur textarea (JetBrains Mono) + apercu HTML sandboxe

---

## 9. Page 6 — Automatisation (`/settings/workflows` + `/settings/workflow-rules`)

Deux pages distinctes liees dans l'OverlaySubNav sous la section AUTOMATISATION.

### 9.1 Workflows (`/settings/workflows`)

Cards avec statut actif/inactif, menu contextuel (activer, desactiver, dupliquer, supprimer).

### 9.2 Regles workflow (`/settings/workflow-rules`)

Cards avec filtre par module, conditions builder (si... alors...).

Les deux pages ont une subnav interne (tabs underline) pour naviguer entre elles.

---

## 10. Page 7 — Sauvegardes (`/settings/backups`)

**Contenu :**

- Banner informatif (les PDFs ne sont pas inclus)
- Table : fichier, statut (Pret/En cours), taille, duree, actions (telecharger, supprimer)
- Bouton "Creer une sauvegarde" avec toast optimiste
- **Danger Zone** : restauration via support uniquement (bg `#fef2f2`, border `#fca5a5`)

---

## 11. Tokens de design — Rappel charte BTS

```css
--primary:        #2D7DD2;
--primary-hover:  #2468b5;
--sidebar-bg:     #0c2340;
--page-bg:        #f0f4f9;
--surface-1:      #ffffff;
--surface-2:      #f8fafc;
--border:         #e2e8f0;
--text-1:         #0f172a;
--text-2:         #334155;
--text-3:         #64748b;
--danger:         #dc2626;
--danger-bg:      #fef2f2;
--warning:        #d97706;
--warning-bg:     #fffbeb;
--success:        #16a34a;

--font-display:   'Sora', sans-serif;
--font-body:      'DM Sans', sans-serif;
--font-mono:      'JetBrains Mono', monospace;

--settings-content-max: 760px;
--card-padding:         24px;
--card-radius:          12px;
--section-gap:          20px;
```

---

## 12. Patterns UX transversaux

### Formulaires
- Save button : disabled + spinner pendant mutation, re-enabled sur erreur
- Toast success : `"Parametres enregistres"` (3s, top-right)
- Validation : en temps reel sur blur, pas a la frappe
- Champs requis : `*` rouge, `aria-required`

### Tables CRUD inline
- Add : drawer lateral (480–560px)
- Delete : toujours `ConfirmDeleteModal` avec nom de l'entite
- Empty state : message + CTA

### Drawers
- Largeur : 480px (standard) · 560px (complexes) · 600px (previews)
- Animation : `translateX(100%) → translateX(0)`, `0.25s ease`
- Backdrop : `rgba(0,0,0,0.4)` blur `2px`
- Fermeture : ESC · clic backdrop · bouton X
- Footer sticky : actions a droite

### Chargement
- Page : `loading.tsx` skeleton qui reproduit la structure
- Bouton : spinner inline + disabled
- TanStack Query : `staleTime: 5 * 60 * 1000`

### Accessibilite
- Focus ring : `outline: 2px solid var(--primary)`, `outline-offset: 2px`
- Switches : `role="switch"`, `aria-checked`
- Modales : `role="dialog"`, `aria-modal`, focus trap

---

## 13. Checklist pré-livraison

### Navigation
- [x] OverlaySubNav remplace SettingsTabs — `settings/layout.tsx` est `<>{children}</>`
- [x] `workflows` et `workflow-rules` accessibles sous "AUTOMATISATION" dans overlay-panels.ts
- [x] `page.tsx` racine `/settings` redirige vers `/settings/company`
- [x] `SettingsTabs.tsx` supprime (code mort)

### Pages
- [x] `/settings/company` — identite legale + coordonnees (companyCode dans identite legale)
- [x] `/settings/branding` — logo, en-tete/pied PDF, cachet/signature
- [x] `/settings/billing` — params financiers + TVA + bureaux + sequences
- [x] `/settings/security` — sessions, 2FA, historique
- [x] `/settings/notifications` — evenements, rappels, templates
- [x] `/settings/workflows` — workflows d'approbation
- [x] `/settings/workflow-rules` — regles workflow
- [x] `/settings/backups` — sauvegardes
- [x] `/settings/api-keys` — clés API (modal rawKey one-time display)
- [x] `/settings/webhooks` — webhooks (CRUD + sélection événements)
- [x] `/settings/ip-whitelist` — liste blanche IP (CRUD)
- [x] `/settings/custom-fields` — champs personnalisés (tabs par entité)
- [x] `/settings/exports` — exports de données (polling auto, blob download)

### Code
- [x] `loading.tsx` + `error.tsx` pour chaque route
- [x] constants.ts ne contient que les routes avec des pages reelles
- [x] TanStack Query v5 pour tous les fetches
- [x] Types `CompanySettings`, `AssetType` dans `src/features/settings/types.ts`
- [x] Mutations avec `invalidateQueries` post-success (`qc.setQueryData` + `qc.invalidateQueries`)
- [x] Toast success/error sur toutes les mutations (sonner)
- [x] Focus trap dans les modales et drawers (ConfirmDeleteModal : auto-focus + Escape)
