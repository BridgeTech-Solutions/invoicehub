# Plan d'implémentation — Éditeur WYSIWYG de Documents BTS

> Analyse basée sur la lecture complète du code existant :
> `bridge-backend/src/lib/pdf.ts`, `InvoiceForm.tsx`, `ProformaForm.tsx`,
> `LineItemsEditor.tsx`, `TotalsPanel.tsx`, `document-math.ts`

---

## 1. État des lieux — Ce qui existe

### 1.1 Génération PDF (backend)

```
buildDocumentHtml(params: DocumentHtmlParams): string
      ↓
generatePdf(html: string): Promise<Buffer>   ← Puppeteer headless
      ↓
pdf-lib : footer inséré en fond de chaque page
```

La fonction `buildDocumentHtml()` dans `src/lib/pdf.ts` construit un **HTML par concaténation de strings**. Elle gère 4 types de documents :

| Type | Layout | Spécificités |
|---|---|---|
| `Proforma` | titre centré + table méta + cachet | `validUntil`, conditions, cachet BTS |
| `Facture` standard / Avoir | titre + N° centrés + table client pleine largeur | `dueDate`, table paiement |
| `Facture Acompte` | titre+N° à droite + table client 60% | lignes totaux `acompteHt`, `acompteTax` |
| `Facture Solde` | identique Acompte | lignes totaux `soldeHt`, `soldeTax` |

**Constantes visuelles BTS (à reproduire fidèlement) :**
```
BLUE   = '#2196F3'   ← headers de tableaux, labels
TAN    = '#C8B87A'   ← lignes de totaux
BORDER = '#d4d4d4'   ← bordures tableaux
Police = Arial/sans-serif, taille 11px dans les tables
```

**Assets :** header, footer (images PNG/JPEG en base64), cachet (proforma uniquement)
- Lus depuis `COMPANY_ASSETS_DIR` (ou `assets/company/`)
- Cachés en mémoire après le premier accès

**Colonnes du tableau de lignes (logique dynamique) :**
```
Mode service pur     → 2 cols  : Désignation | PT
Proforma sans remise → 4 cols  : Désignation | PU | Qté | PT
Proforma avec remise → 5 cols  : Désignation | PU | Qté | Remise | PT
Facture sans remise  → 5 cols  : Ref | Désignation | PU | Qté | PT
Facture avec remise  → 6 cols  : Ref | Désignation | PU | Qté | Remise | PT
```

### 1.2 Formulaires frontend

**Architecture commune aux deux formulaires :**
```
ProformaForm / InvoiceForm
├── FormState (useState)
│   ├── clientId, issueDate, validityDays/dueDate, subject, notes
│   ├── paymentConditions, deliveryDelay, warranty
│   ├── globalDiscountType, globalDiscountValue
│   └── lines: FormLine[]
│
├── LEFT column (300px)
│   ├── Informations générales (client, dates)
│   ├── QuickFillBanner (comportement paiement client)
│   └── Conditions & Notes
│
└── RIGHT column (flex: 1)
    ├── LineItemsEditor (composant partagé)
    └── TotalsPanel (remise globale + totaux)
```

**LineItemsEditor — ce qui est déjà implémenté :**
- `ProductCombo` : autocomplete avec portal (évite overflow), recherche par nom/référence, création rapide
- `ContentEditableDesc` : description riche HTML (gras, listes…) directement utilisée par Puppeteer
- `PriceChangeAlert` : alerte si le prix catalogue a changé depuis la dernière facture client
- Drag & drop pour réordonner les lignes (via `draggable` + `onDragOver/onDrop`)
- Recalcul automatique à chaque modification numérique (`computeLineValues`)
- Mode service (`hideDetails`) : masque Ref/Qté/PU, affiche directement le montant
- **Ce qui manque : navigation Tab/Entrée entre cellules**

**InvoiceForm — spécificités :**
- `TypeSelector` : Standard / Acompte / Solde
- `ComputeWarnings` : dry-run debounced (détecte doublons, solde impayé, montant inhabituel)
- Pré-remplissage automatique depuis l'acompte parent (`applyAcomptePrefill`)
- Calcul `totalEncaisseSolde` et `totalEngageAcomptes` pour les affichages d'aide

---

## 2. Pourquoi le vrai WYSIWYG est faisable

### Le problème initial (mal posé)

> "Le PDF est généré server-side, le formulaire est côté client — ils sont découplés"

C'est vrai **aujourd'hui**. Mais la séparation n'est pas architecturale, elle est juste historique.
La fonction `buildDocumentHtml()` retourne une `string`. Il suffit de **la remplacer par un composant React**.

### La solution : inverser la dépendance

```
AUJOURD'HUI
  Frontend  : FormState → formulaire 2 colonnes
  Backend   : params → buildDocumentHtml() (string) → Puppeteer

APRÈS
  Shared    : DocumentTemplate React (frontend + backend SSR)
  Frontend  : DocumentTemplate editable=true  → formulaire WYSIWYG
  Backend   : ReactDOMServer.renderToStaticMarkup(<DocumentTemplate editable=false />) → Puppeteer
```

**Un seul composant. Deux usages.**

---

## 3. Architecture cible

### 3.1 Nouveau package partagé (ou dossier)

```
bridge-frontend/src/components/document/
  DocumentTemplate.tsx          ← composant principal (NOUVEAU)
  DocumentTemplate.types.ts     ← interfaces DocumentData, DocumentMode
  DocumentTemplate.styles.ts    ← constantes CSS (BLUE, TAN, BORDER…)
  LineItemsEditor.tsx           ← existant, à améliorer (Tab/Entrée)
  TotalsPanel.tsx               ← existant, inchangé
  QuickCreateProductModal.tsx   ← existant, inchangé
```

```
bridge-backend/src/lib/
  pdf.ts                        ← buildDocumentHtml() remplacé par SSR React
  document-renderer.ts          ← NOUVEAU : ReactDOMServer.renderToStaticMarkup()
```

### 3.2 Interface de données unifiée

```typescript
// DocumentTemplate.types.ts
export interface DocumentData {
  // Méta
  type:    'proforma' | 'invoice' | 'invoice-acompte' | 'invoice-solde' | 'avoir'
  number?: string                    // null en mode création (attribué à la sauvegarde)
  issueDate:  string
  dueDate?:   string
  validUntil?: string

  // Client
  client: {
    id?:         string
    name:        string
    street?:     string
    bp?:         string
    phone?:      string
    email?:      string
    taxNumber?:  string
    rccm?:       string
    bankAccount?: string
  }

  // Contenu
  subject?:           string
  lines:              FormLine[]
  globalDiscountType:  DiscountType
  globalDiscountValue: number

  // Conditions (proforma)
  deliveryDelay?:     string
  warranty?:          string
  paymentConditions?: string
  notes?:             string

  // Totaux calculés (fournis, pas recalculés dans le template)
  totals: {
    subtotalHt:              number
    totalTax:                number
    totalTtc:                number
    subtotalBeforeDiscountHt?: number
    globalDiscountAmount?:   number
    globalDiscountLabel?:    string
    // Acompte
    acomptePercentage?: number
    acompteHt?:         number
    acompteTax?:        number
    // Solde
    soldeHt?:  number
    soldeTax?: number
  }

  // Assets (base64, optionnel — fallback filesystem côté backend)
  assets?: {
    headerB64?: string
    footerB64?: string
    sealB64?:   string
  }
}

export type DocumentMode = 'edit' | 'preview' | 'print'
```

### 3.3 Composant DocumentTemplate

```typescript
// DocumentTemplate.tsx
interface DocumentTemplateProps {
  data:     DocumentData
  mode:     DocumentMode
  onChange?: (data: DocumentData) => void   // undefined en mode preview/print
}

export function DocumentTemplate({ data, mode, onChange }: DocumentTemplateProps) {
  const isEditable = mode === 'edit'

  return (
    <div className="document-a4" style={A4_STYLE}>
      <DocumentHeader assets={data.assets} />

      <div className="document-body" style={BODY_STYLE}>
        <TitleSection   data={data} mode={mode} onChange={onChange} />
        <ClientBlock    data={data} mode={mode} onChange={onChange} />
        <LinesTable     data={data} mode={mode} onChange={onChange} />
        <BottomSection  data={data} mode={mode} onChange={onChange} />
        <NotesSection   data={data} mode={mode} onChange={onChange} />
      </div>

      <DocumentFooter assets={data.assets} />
    </div>
  )
}
```

---

## 4. Composants internes à créer

### 4.1 TitleSection

Gère les 4 layouts (proforma / facture / acompte+solde) :

```typescript
function TitleSection({ data, mode, onChange }) {
  if (data.type === 'proforma') {
    return (
      <div style={{ textAlign: 'center', margin: '18px 0 16px' }}>
        <h1 style={{ color: BLUE, textDecoration: 'underline', ... }}>PROFORMA</h1>
        <MetaTable data={data} mode={mode} onChange={onChange} />
      </div>
    )
  }
  if (data.type === 'invoice-acompte' || data.type === 'invoice-solde') {
    return (
      <div style={{ textAlign: 'right', ... }}>
        <h1>FACTURE {data.type === 'invoice-acompte' ? 'ACOMPTE' : 'SOLDE'}</h1>
        <InlineField label="N° Facture" value={data.number ?? 'Attribué à la sauvegarde'} readonly />
        <InlineField label="Date" value={data.issueDate} field="issueDate" mode={mode} onChange={onChange} />
        <InlineField label="Échéance" value={data.dueDate} field="dueDate" mode={mode} onChange={onChange} />
      </div>
    )
  }
  // Facture standard / Avoir
  return (
    <div style={{ textAlign: 'center', ... }}>
      <h1>{data.type === 'avoir' ? 'AVOIR' : 'FACTURE'}</h1>
      <InlineField label="N° Facture" ... />
      <InlineField label="Date" ... />
      <InlineField label="Échéance" ... />
    </div>
  )
}
```

### 4.2 InlineField — la brique de base du WYSIWYG

C'est le composant clé. En mode `edit`, un champ qui ressemble à du texte statique mais qui devient un input au focus :

```typescript
function InlineField({ label, value, field, mode, onChange, type = 'text' }) {
  if (mode !== 'edit') {
    return <span style={STATIC_TEXT_STYLE}>{value || '—'}</span>
  }

  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange?.({ ...data, [field]: e.target.value })}
      style={{
        // Invisible au repos — ressemble à du texte
        background:  'transparent',
        border:      'none',
        borderBottom: '1px dashed transparent',
        outline:     'none',
        fontSize:    'inherit',
        color:       'inherit',
        fontFamily:  'inherit',
        width:       '100%',
        // S'active visuellement au focus
        // (géré via :focus CSS ou onFocus/onBlur)
      }}
      onFocus={(e) => { e.target.style.borderBottomColor = BLUE; e.target.style.background = 'rgba(33,150,243,0.04)' }}
      onBlur={(e)  => { e.target.style.borderBottomColor = 'transparent'; e.target.style.background = 'transparent' }}
    />
  )
}
```

### 4.3 ClientBlock

```typescript
function ClientBlock({ data, mode, onChange }) {
  if (mode === 'edit') {
    return (
      <div style={CLIENT_BLOCK_STYLE}>
        <span style={{ color: BLUE, fontWeight: 'bold', fontSize: 11 }}>FACTURER À :</span>
        {/* Recherche client avec autocomplete — remplace le select actuel */}
        <ClientSearch
          value={data.client.id}
          displayName={data.client.name}
          onSelect={(client) => onChange?.({ ...data, client })}
          style={{ border: 'none', borderBottom: `1px dashed ${BLUE}`, ... }}
        />
        {/* Les autres champs client s'affichent une fois le client sélectionné */}
        {data.client.name && (
          <div style={{ fontSize: 11, marginTop: 4, color: '#333' }}>
            {data.client.street && <div>{data.client.street}</div>}
            {data.client.bp     && <div>BP {data.client.bp}</div>}
            {data.client.phone  && <div>Tél : {data.client.phone}</div>}
          </div>
        )}
      </div>
    )
  }
  // Mode preview/print : identique au template HTML actuel
  return <ClientBlockStatic data={data} />
}
```

### 4.4 LinesTable — grille éditable

La partie la plus importante. Le tableau des lignes EN MODE EDIT est une **vraie grille avec navigation clavier** :

```typescript
function LinesTable({ data, mode, onChange }) {
  if (mode !== 'edit') {
    // Rendu statique identique au template Puppeteer
    return <LinesTableStatic lines={data.lines} type={data.type} />
  }

  // Mode édition : LineItemsEditor amélioré (voir section 5)
  return (
    <div style={{ marginBottom: 18 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <LinesTableHeader type={data.type} lines={data.lines} />
        <tbody>
          {data.lines.map((line, i) => (
            <LineRow
              key={line.id}
              line={line}
              index={i}
              // Navigation Tab/Entrée (voir section 5)
              onTab={(direction) => focusCell(i + direction, 0)}
              onEnterAtEnd={() => addLine()}
              onChange={(updated) => updateLine(i, updated)}
              onRemove={() => removeLine(i)}
            />
          ))}
        </tbody>
        <TotalsRows totals={data.totals} nbCols={nbCols} />
      </table>

      <button onClick={addLine} style={ADD_LINE_BTN_STYLE}>
        + Ajouter une ligne
      </button>
    </div>
  )
}
```

---

## 5. Navigation clavier (Tab/Entrée) dans les lignes

C'est la modification la plus visible pour l'utilisateur. À faire dans `LineItemsEditor` / `LineRow`.

### Ordre de tabulation dans une ligne

```
Désignation → Qté → Prix HT → TVA% → [Remise] → (Entrée = nouvelle ligne)
```

### Implémentation

```typescript
// Dans LineRow, chaque cellule reçoit un ref et des handlers
const cellRefs = useRef<(HTMLInputElement | null)[]>([])

function focusCell(lineIndex: number, cellIndex: number) {
  // Trouver le bon input dans la bonne ligne
  const lineEl = tableRef.current?.rows[lineIndex]
  const inputs = lineEl?.querySelectorAll('input, select')
  ;(inputs?.[cellIndex] as HTMLInputElement)?.focus()
}

// Sur chaque input de la ligne :
onKeyDown={(e) => {
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    const isLastCell = cellIndex === totalCells - 1
    if (isLastCell) {
      // Dernière cellule de la ligne → passer à la ligne suivante
      const isLastLine = lineIndex === lines.length - 1
      if (isLastLine) {
        // Dernière ligne → créer une nouvelle ligne
        onChange(addLine(lines))
        // Focus sur la première cellule de la nouvelle ligne (via useEffect)
      } else {
        focusCell(lineIndex + 1, 0)
      }
    } else {
      focusCell(lineIndex, cellIndex + 1)
    }
  }
  if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault()
    if (cellIndex === 0 && lineIndex > 0) {
      focusCell(lineIndex - 1, totalCells - 1)
    } else if (cellIndex > 0) {
      focusCell(lineIndex, cellIndex - 1)
    }
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    // Enter sur n'importe quelle cellule → nouvelle ligne en dessous
    onChange(insertLineAfter(lines, lineIndex))
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    // Sur le handle drag ou la cellule N° → supprimer la ligne (avec confirmation)
    if (isHandleCell && lines.length > 1) {
      e.preventDefault()
      onChange(removeLine(lines, lineIndex))
    }
  }
}}
```

---

## 6. Adaptation backend : ReactDOMServer

Plutôt que de maintenir deux templates (HTML string ET React), le backend utilisera le composant React pour générer le HTML passé à Puppeteer.

### 6.1 Dépendances à ajouter (bridge-backend)

```bash
pnpm add react react-dom
pnpm add -D @types/react @types/react-dom
```

### 6.2 Nouveau fichier `document-renderer.ts`

```typescript
// bridge-backend/src/lib/document-renderer.ts
import { createElement }          from 'react'
import { renderToStaticMarkup }   from 'react-dom/server'
import { DocumentTemplate }       from '../../../bridge-frontend/src/components/document/DocumentTemplate'
// OU : copier le composant dans un dossier shared/ partagé entre les deux apps

export function buildDocumentHtml(params: DocumentData): string {
  const element = createElement(DocumentTemplate, {
    data:  params,
    mode:  'print',
  })
  const body = renderToStaticMarkup(element)

  // Wrapper HTML complet avec le CSS print
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  .document-a4 { width: 210mm; padding: 0 15mm; }
  @media print { .document-a4 { width: 100%; } }
</style>
</head>
<body>
  ${body}
</body>
</html>`
}
```

### 6.3 Option alternative : package `shared`

Si on ne veut pas que le backend dépende du frontend, créer un package partagé :

```
bridge-shared/
  src/
    document/
      DocumentTemplate.tsx
      DocumentTemplate.types.ts
      DocumentTemplate.styles.ts
  package.json   ← "@bts/shared"
  tsconfig.json
```

Les deux apps importent depuis `@bts/shared`. C'est la solution la plus propre mais elle nécessite un monorepo (pnpm workspaces).

---

## 7. Page de création avec WYSIWYG

### 7.1 Nouveau layout de la page

```typescript
// app/(dashboard)/invoices/new/page.tsx — nouveau layout
export default function NewInvoicePage() {
  const [data, setData]           = useState<DocumentData>(initDocumentData())
  const [previewMode, setPreview] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minHeight: '100vh' }}>
      {/* Barre d'actions (flottante en haut) */}
      <DocumentActionBar
        data={data}
        onPreviewToggle={() => setPreview(p => !p)}
        previewMode={previewMode}
      />

      {/* Zone principale */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: previewMode ? '1fr 1fr' : '1fr',
        gap: 0,
        flex: 1,
      }}>
        {/* Éditeur WYSIWYG — toujours visible */}
        <div style={{ background: '#e8e8e8', padding: '32px 24px', overflowY: 'auto' }}>
          {/* Ombre style "document posé sur un bureau" */}
          <div style={{
            maxWidth: 794, margin: '0 auto',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            background: 'white',
          }}>
            <DocumentTemplate
              data={data}
              mode="edit"
              onChange={setData}
            />
          </div>
        </div>

        {/* Panel d'aide contextuel (QuickFill, avertissements) */}
        {!previewMode && (
          <aside style={{ width: 280, padding: '24px 20px', borderLeft: '1px solid var(--border)', overflowY: 'auto' }}>
            <QuickFillPanel   clientId={data.client.id} onApply={...} />
            <ComputeWarnings  warnings={warnings} />
            <DocumentTypeSelector value={data.type} onChange={...} />
          </aside>
        )}

        {/* Preview mode : 2 colonnes — éditeur à gauche, aperçu iframe à droite */}
        {previewMode && (
          <div style={{ borderLeft: '1px solid var(--border)', overflowY: 'auto' }}>
            <DocumentTemplate data={data} mode="preview" />
          </div>
        )}
      </div>
    </div>
  )
}
```

### 7.2 DocumentActionBar

```typescript
function DocumentActionBar({ data, onPreviewToggle, previewMode }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 24px', gap: 12,
    }}>
      {/* Gauche : breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href={ROUTES.INVOICES}>← Factures</Link>
        <span style={{ color: 'var(--text-3)' }}>Nouvelle facture</span>
        {data.number && <code style={{ ...BADGE }}>{data.number}</code>}
      </div>

      {/* Centre : raccourcis clavier visibles */}
      <div style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--text-3)' }}>
        <Kbd>Tab</Kbd> <span>cellule suivante</span>
        <Kbd>Entrée</Kbd> <span>nouvelle ligne</span>
        <Kbd>Ctrl+S</Kbd> <span>sauvegarder</span>
      </div>

      {/* Droite : actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onPreviewToggle}>
          {previewMode ? 'Masquer aperçu' : 'Voir aperçu'}
        </button>
        <button onClick={saveDraft}>Brouillon</button>
        <button onClick={issueDocument} style={{ background: 'var(--primary)', color: '#fff' }}>
          Émettre →
        </button>
      </div>
    </div>
  )
}
```

---

## 8. Gestion des modes

| Mode | Rendu | Usage |
|---|---|---|
| `'edit'` | Inputs invisibles qui s'activent au focus | Page de création/édition |
| `'preview'` | Rendu statique en HTML, dans un div scrollable | Panel de droite en split-view |
| `'print'` | Identique à `preview` mais avec CSS `@media print` | Passé à Puppeteer via ReactDOMServer |

---

## 9. Correspondance champs form → template PDF

Ce tableau garantit qu'aucun champ n'est perdu lors de la migration :

| Champ FormState actuel | Champ DocumentData | Rendu dans le PDF |
|---|---|---|
| `clientId` | `client.id + client.name + ...` | Bloc client, table méta |
| `issueDate` | `issueDate` | Table méta / titre |
| `dueDate` | `dueDate` | Titre (factures) |
| `validityDays` → `validUntil` | `validUntil` | Table méta proforma |
| `subject` | `subject` | Ligne "Service" (proforma) |
| `lines[]` | `lines[]` | Tableau des lignes |
| `globalDiscountType/Value` | `totals.globalDiscountAmount` | Ligne REMISE totaux |
| `paymentConditions` | `paymentConditions` | Table conditions proforma / Table paiement facture |
| `deliveryDelay` | `deliveryDelay` | Table conditions proforma |
| `warranty` | `warranty` | Table conditions proforma |
| `notes` | `notes` | Section notes |
| `acomptePercentage` | `totals.acomptePercentage` | Lignes totaux acompte |
| `parentInvoiceId` | Utilisé pour calculer `totals.soldeHt` | Lignes totaux solde |

---

## 10. Plan d'exécution par phases

### Phase 1 — Navigation Tab/Entrée dans LineItemsEditor (1 jour)
> **Impact immédiat, risque zéro. Ne touche pas à la génération PDF.**

- [ ] Ajouter `data-cell-index` et `data-line-index` aux inputs
- [ ] Handler `onKeyDown` global sur le `<table>` (event delegation)
- [ ] Tab → cellule suivante, Shift+Tab → cellule précédente
- [ ] Tab sur dernière cellule de la dernière ligne → nouvelle ligne + focus
- [ ] Entrée → nouvelle ligne en dessous + focus
- [ ] Suppr sur la cellule handle drag → supprimer la ligne

### Phase 2 — Composant DocumentTemplate (2-3 jours)
> **Créer le composant React. Ne pas encore toucher au backend.**

- [ ] `DocumentTemplate.types.ts` — interfaces DocumentData, DocumentMode
- [ ] `DocumentTemplate.styles.ts` — constantes BLUE, TAN, BORDER, styles inline
- [ ] `DocumentTemplate.tsx` — composant principal + sous-composants
- [ ] `InlineField.tsx` — brique de base éditable
- [ ] `ClientSearch.tsx` — remplace le `<select>` par une recherche inline
- [ ] `LinesTableStatic.tsx` — rendu print/preview identique au template actuel
- [ ] Tests visuels : vérifier que `mode='preview'` correspond exactement au PDF généré

### Phase 3 — Intégration dans les pages (1 jour)
> **Remplacer InvoiceForm/ProformaForm par le nouveau layout WYSIWYG**

- [ ] `invoices/new/page.tsx` — nouveau layout avec `DocumentTemplate` + `DocumentActionBar`
- [ ] `proformas/new/page.tsx` — idem
- [ ] Panel droit `QuickFillPanel` (extraire de QuickFillBanner)
- [ ] Brancher les mutations `createMutation`, `issueMutation` existantes sur le nouveau formulaire
- [ ] Ctrl+S → sauvegarde brouillon

### Phase 4 — Migration backend vers ReactDOMServer (1-2 jours)
> **Éliminer le template HTML string — utiliser le composant React**

- [ ] Installer `react` + `react-dom` dans bridge-backend
- [ ] Créer `document-renderer.ts` avec `renderToStaticMarkup()`
- [ ] Remplacer `buildDocumentHtml()` dans pdf.ts par le nouveau renderer
- [ ] Vérifier que le rendu Puppeteer est identique (tests visuels PDF)
- [ ] Supprimer l'ancienne fonction `buildDocumentHtml()` (string template)

### Phase 5 — Polish (0.5 jour)
- [ ] Barre de raccourcis clavier visible dans la `DocumentActionBar`
- [ ] Indicateur de sauvegarde automatique ("Sauvegardé il y a 2 min")
- [ ] Animation subtile sur les cellules au focus (background bleuté)
- [ ] Message "Aucun client sélectionné" visuel dans le document (pas en dehors)

---

## 11. Points de vigilance

### 11.1 Fontes — risque de désynchronisation PDF/aperçu

Puppeteer utilise les fontes système du serveur (Linux dans Docker). Le browser de l'utilisateur a ses propres fontes. Les différences peuvent provoquer des débordements de texte ou des sauts de page inattendus.

**Solution :** embed une fonte web (ex: `Noto Sans`) en base64 dans le CSS du template pour que Puppeteer et le browser utilisent exactement la même fonte.

```css
@font-face {
  font-family: 'DocFont';
  src: url('data:font/woff2;base64,...') format('woff2');
}
* { font-family: 'DocFont', Arial, sans-serif; }
```

### 11.2 Sauts de page

Le template actuel utilise `break-inside: avoid` sur le bloc des totaux. En mode preview React (dans un `div`), il n'y a pas de pagination. L'utilisateur ne verra pas les sauts de page.

**Solution :** ne pas afficher la pagination dans l'éditeur — afficher un message "Aperçu paginé disponible via le bouton PDF". Ou implémenter une simulation des sauts de page via `height: 297mm` sur des blocs.

### 11.3 Images header/footer (assets base64)

En mode `edit`/`preview`, les images sont chargées via une route API :
```
GET /api/assets/header  → retourne l'image en base64
GET /api/assets/footer
GET /api/assets/seal
```

En mode `print` (Puppeteer), elles sont lues directement depuis le filesystem (comportement actuel inchangé).

### 11.4 InvoiceForm — logique complexe à conserver

`InvoiceForm.tsx` contient une logique métier importante qui doit être préservée :
- Compute dry-run (debounced 600ms) → détection doublons / montant inhabituel
- Auto-pré-remplissage depuis l'acompte parent (lignes + conditions)
- Calcul `totalEncaisseSolde` / `totalEngageAcomptes`
- `TypeSelector` (Standard / Acompte / Solde)

Ces logiques **ne sont pas dans le template** — elles restent dans la page de création, dans un hook `useDocumentEditor(initialData)` qui gère le state et les effets.

```typescript
// hooks/useDocumentEditor.ts
export function useDocumentEditor(initialData: Partial<DocumentData>) {
  const [data, setData]         = useState<DocumentData>(...)
  const [warnings, setWarnings] = useState<ComputeWarning[]>([])

  // Compute dry-run debounced
  useEffect(() => { /* debounce 600ms */ }, [data.lines, data.clientId])

  // Auto-prefill depuis acompte parent
  useEffect(() => { /* si type=solde et parentInvoiceId */ }, [data.parentInvoiceId])

  return { data, setData, warnings }
}
```

---

## 12. Résumé des fichiers à créer / modifier

### Nouveaux fichiers

| Fichier | Description |
|---|---|
| `components/document/DocumentTemplate.tsx` | Composant principal WYSIWYG |
| `components/document/DocumentTemplate.types.ts` | Interfaces DocumentData, DocumentMode |
| `components/document/DocumentTemplate.styles.ts` | Constantes visuelles BTS |
| `components/document/InlineField.tsx` | Champ éditable invisible au repos |
| `components/document/ClientSearch.tsx` | Recherche client inline (remplace `<select>`) |
| `components/document/LinesTableStatic.tsx` | Rendu statique des lignes (print/preview) |
| `components/document/DocumentActionBar.tsx` | Barre sticky avec actions + raccourcis |
| `hooks/useDocumentEditor.ts` | State + logique métier (compute, prefill) |
| `backend/src/lib/document-renderer.ts` | ReactDOMServer wrapper |

### Fichiers modifiés

| Fichier | Modification |
|---|---|
| `components/document/LineItemsEditor.tsx` | + navigation Tab/Entrée (Phase 1) |
| `app/(dashboard)/invoices/new/page.tsx` | Remplace InvoiceForm par layout WYSIWYG |
| `app/(dashboard)/invoices/[id]/page.tsx` | Remplace InvoiceForm en mode édition |
| `app/(dashboard)/proformas/new/page.tsx` | Remplace ProformaForm |
| `app/(dashboard)/proformas/[id]/page.tsx` | Remplace ProformaForm en mode édition |
| `backend/src/lib/pdf.ts` | Remplace buildDocumentHtml() par document-renderer |

### Fichiers supprimés (après Phase 4)

| Fichier | Raison |
|---|---|
| `features/invoices/components/InvoiceForm.tsx` | Remplacé par DocumentTemplate + useDocumentEditor |
| `features/proformas/components/ProformaForm.tsx` | Idem |

---

*Document généré le 2026-04-11 — BTS InvoiceHub v2.0*
