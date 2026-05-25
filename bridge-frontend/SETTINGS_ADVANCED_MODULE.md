# Module Settings Avancé — Spec d'implémentation

> **Backend** : `invoicehub-api/` (NestJS) — base URL `NEXT_PUBLIC_API_URL`  
> **Frontend** : `bridge-frontend/` (Next.js 15 App Router)  
> **Charte BTS** : Sora (display) · DM Sans (body) · JetBrains Mono (mono)  
> **Couleurs** : Primary `#2D7DD2` · Sidebar `#0c2340` · Bg `#f0f4f9`

---

## 0. Rappel architecture frontend (patterns obligatoires)

### Structure d'une feature

```
src/features/settings-advanced/
├── types.ts      ← interfaces TypeScript (un type par entité)
├── api.ts        ← fonctions apiClient (axios, pas de logique UI)
└── hooks.ts      ← TanStack Query v5 (useQuery + useMutation + toast)
```

### Conventions inviolables

| Règle | Exemple |
|-------|---------|
| `apiClient` depuis `@/lib/api-client` | `import apiClient from '@/lib/api-client'` |
| Toast via `sonner` | `toast.success('...')` / `toast.error('...')` |
| Invalidation post-mutation | `qc.invalidateQueries({ queryKey: KEY })` |
| staleTime min 60 000 ms | `staleTime: 60_000` |
| Icônes Lucide uniquement | jamais d'emoji comme icône |
| CSS vars BTS | `var(--primary)`, `var(--border)`, `var(--text-1)`, etc. |
| Inline styles + className `card` | même pattern que billing/page.tsx |
| `aria-label` sur boutons icônes | `aria-label="Révoquer la clé"` |
| `min-height: 44px` touch target | sur tous les boutons |
| `cursor: pointer` | sur tous les éléments cliquables |

### Wrapper de page type (modèle à reproduire)

```tsx
'use client'
import { useState, useId } from 'react'
import { SomeIcon, Loader2, Plus, Trash2 } from 'lucide-react'
import { useXxx, useCreateXxx, useDeleteXxx } from '@/features/settings-advanced/hooks'

export default function XxxPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Page header */}
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
          Titre
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
          Description
        </p>
      </div>
      {/* Sections */}
      <Section />
    </div>
  )
}
```

---

## 1. Analyse — Ce qui manque

### 1.1 Features manquantes

| Feature | Dossier | Statut |
|---------|---------|--------|
| `settings-advanced` (api-keys, webhooks, custom-fields, ip-whitelist, exports) | `src/features/settings-advanced/` | ❌ À créer |

> `features/workflow-rules/` existe déjà ✓

### 1.2 Pages manquantes

| Page | Route | Backend endpoint |
|------|-------|-----------------|
| Clés API | `/settings/api-keys` | `GET/POST/DELETE /api-keys` |
| Webhooks | `/settings/webhooks` | `GET/POST/PUT/DELETE /webhooks` |
| IP Whitelist | `/settings/ip-whitelist` | `GET/POST/DELETE /ip-whitelist` |
| Champs personnalisés | `/settings/custom-fields` | `GET/POST/DELETE /custom-fields` |
| Exports | `/settings/exports` | `GET/POST /exports` + `GET /exports/:id/download` |

### 1.3 Navigation manquante

Dans `overlay-panels.ts`, section `settings` → ajouter section **DÉVELOPPEUR** avec les 5 nouvelles pages.

### 1.4 Constants manquantes

Dans `src/lib/constants.ts` → remettre les 5 routes supprimées par erreur.

---

## 2. API Reference complète (invoicehub-api NestJS)

### 2.1 Clés API — `@Controller('api-keys')` `@Permission('api-keys:manage')`

```
GET    /api-keys          → ApiKey[] (sans keyHash, sans rawKey)
POST   /api-keys          → { data: ApiKey & { rawKey: string }, warning: string }
                             ⚠ rawKey affiché UNE SEULE FOIS — jamais réaffiché
DELETE /api-keys/:id      → { message: 'Clé révoquée' }
```

**Payload POST** :
```json
{ "name": "Mon intégration", "permissions": ["invoices:read"], "expiresAt": null, "ipWhitelist": [] }
```

**ApiKey retournée (GET)** :
```ts
{ id, name, keyPrefix: "bts_live_ab", permissions[], expiresAt, lastUsedAt, createdAt, isActive }
```

### 2.2 Webhooks — `@Controller('webhooks')` `@Permission('webhooks:manage')`

```
GET    /webhooks          → Webhook[] avec _count.deliveries
GET    /webhooks/:id      → Webhook + deliveries[] (20 dernières)
POST   /webhooks          → Webhook (201)
PUT    /webhooks/:id      → Webhook
DELETE /webhooks/:id      → { message: 'Webhook supprimé' }
```

**Payload POST/PUT** :
```json
{
  "name": "Notification ERP",
  "url": "https://mon-erp.com/hook",
  "events": ["invoice.issued", "payment.created"],
  "secret": "mon_secret_webhook",
  "headers": { "X-Custom": "valeur" },
  "isActive": true,
  "retryCount": 3
}
```

**Événements disponibles** (exemples) :
- `invoice.issued`, `invoice.paid`, `invoice.overdue`, `invoice.cancelled`
- `proforma.sent`, `proforma.accepted`, `proforma.rejected`
- `payment.created`
- `client.created`

### 2.3 Champs personnalisés — `@Controller('custom-fields')`

```
GET    /custom-fields?entityType=invoice   → CustomField[]
POST   /custom-fields                       → CustomField (201)
DELETE /custom-fields/:id                   → { message }  (soft: isActive=false)
GET    /custom-fields/values/:type/:id      → CustomFieldValue[]
POST   /custom-fields/values/:type/:id      → upsert valeur
```

**entityType** : `client | supplier | invoice | proforma | product | expense`

**Payload POST** :
```json
{
  "entityType": "invoice",
  "fieldName": "numero_bon_commande",
  "label": "N° Bon de commande",
  "fieldType": "text",
  "isRequired": false,
  "defaultValue": null,
  "displayOrder": 0
}
```

**fieldType** : `text | number | date | boolean | select | json`  
**fieldName** : regex `/^[a-z_]+$/` (slug minuscules + underscores)

### 2.4 Règles workflow — `@Controller('workflow-rules')`

```
GET    /workflow-rules?entityType=invoice  → WorkflowRule[]
POST   /workflow-rules                      → WorkflowRule (201)
POST   /workflow-rules/:id/toggle           → WorkflowRule (toggle isActive)
DELETE /workflow-rules/:id                  → { message }
```

> Note : `/settings/workflow-rules` page déjà implémentée — utilise `features/workflow-rules/`

### 2.5 IP Whitelist — `@Controller('ip-whitelist')` `@Permission('settings:manage')`

```
GET    /ip-whitelist      → IpWhitelist[]
POST   /ip-whitelist      → IpWhitelist (201)
DELETE /ip-whitelist/:id  → { message: 'IP supprimée' }
```

**Payload POST** :
```json
{ "ipAddress": "41.202.219.1", "description": "Bureau principal Akwa", "isActive": true }
```

### 2.6 Export Jobs — `@Controller('exports')` (authenticate seulement)

```
GET    /exports           → ExportJob[] (50 derniers de l'utilisateur)
GET    /exports/:id       → ExportJob
POST   /exports           → ExportJob (202 Accepted — async)
GET    /exports/:id/download → fichier binaire (Content-Disposition: attachment)
```

**Payload POST** :
```json
{
  "entityType": "invoices",
  "format": "excel",
  "filters": { "dateFrom": "2026-01-01", "dateTo": "2026-05-31" }
}
```

**entityType** : `invoices | clients | products | payments | expenses | accounting_entries`  
**format** : `csv | excel | pdf | sage_csv | ciel_csv`  
**status job** : `pending | processing | completed | failed`  
**expiresAt** : +24h après création (lien de téléchargement expire)

---

## 3. Types TypeScript

```
src/features/settings-advanced/types.ts
```

```ts
// ── Clés API ──────────────────────────────────────────
export interface ApiKey {
  id:          string
  name:        string
  keyPrefix:   string           // ex: "bts_live_ab"
  permissions: string[]
  expiresAt:   string | null
  lastUsedAt:  string | null
  createdAt:   string
  isActive:    boolean
}

export interface CreateApiKeyPayload {
  name:        string
  permissions: string[]
  expiresAt?:  string | null
  ipWhitelist?: string[]
}

// ── Webhooks ───────────────────────────────────────────
export interface WebhookDelivery {
  id:         string
  status:     'success' | 'failed'
  statusCode: number | null
  duration:   number | null
  createdAt:  string
}

export interface Webhook {
  id:           string
  name:         string
  url:          string
  events:       string[]
  secret:       string | null
  headers:      Record<string, string>
  isActive:     boolean
  retryCount:   number
  createdAt:    string
  updatedAt:    string
  _count?:      { deliveries: number }
  deliveries?:  WebhookDelivery[]
}

export interface CreateWebhookPayload {
  name:        string
  url:         string
  events:      string[]
  secret?:     string | null
  headers?:    Record<string, string>
  isActive?:   boolean
  retryCount?: number
}

export type UpdateWebhookPayload = Partial<CreateWebhookPayload>

// ── Champs personnalisés ──────────────────────────────
export type CustomFieldEntityType = 'client' | 'supplier' | 'invoice' | 'proforma' | 'product' | 'expense'
export type CustomFieldType       = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'json'

export interface CustomField {
  id:           string
  entityType:   CustomFieldEntityType
  name:         string           // slug ex: numero_bon_commande
  label:        string
  fieldType:    CustomFieldType
  options:      string[] | null
  isRequired:   boolean
  defaultValue: string | null
  sortOrder:    number
  isActive:     boolean
  createdAt:    string
}

export interface CreateCustomFieldPayload {
  entityType:    CustomFieldEntityType
  fieldName:     string
  label:         string
  fieldType:     CustomFieldType
  options?:      string[] | null
  isRequired?:   boolean
  defaultValue?: string | null
  displayOrder?: number
}

// ── IP Whitelist ───────────────────────────────────────
export interface IpWhitelistEntry {
  id:          string
  ipAddress:   string
  label:       string | null
  description: string | null
  isActive:    boolean
  createdAt:   string
  createdById: string | null
}

export interface CreateIpWhitelistPayload {
  ipAddress:    string
  description?: string | null
  isActive?:    boolean
}

// ── Export Jobs ────────────────────────────────────────
export type ExportEntityType = 'invoices' | 'clients' | 'products' | 'payments' | 'expenses' | 'accounting_entries'
export type ExportFormat     = 'csv' | 'excel' | 'pdf' | 'sage_csv' | 'ciel_csv'
export type ExportStatus     = 'pending' | 'processing' | 'completed' | 'failed'

export interface ExportJob {
  id:          string
  module:      ExportEntityType
  format:      ExportFormat
  filters:     Record<string, unknown>
  status:      ExportStatus
  filePath:    string | null
  errorMsg:    string | null
  expiresAt:   string
  createdAt:   string
  createdById: string
}

export interface CreateExportPayload {
  entityType: ExportEntityType
  format:     ExportFormat
  filters?:   Record<string, unknown>
}
```

---

## 4. API layer

```
src/features/settings-advanced/api.ts
```

```ts
import apiClient from '@/lib/api-client'
import type {
  ApiKey, CreateApiKeyPayload,
  Webhook, CreateWebhookPayload, UpdateWebhookPayload,
  CustomField, CreateCustomFieldPayload, CustomFieldEntityType,
  IpWhitelistEntry, CreateIpWhitelistPayload,
  ExportJob, CreateExportPayload,
} from './types'

// ── Clés API ──────────────────────────────────────────────────
export const apiKeysApi = {
  list: async (): Promise<ApiKey[]> => {
    const { data } = await apiClient.get<ApiKey[]>('/api-keys')
    return data
  },
  create: async (payload: CreateApiKeyPayload): Promise<{ data: ApiKey & { rawKey: string }; warning: string }> => {
    const { data } = await apiClient.post('/api-keys', payload)
    return data
  },
  revoke: async (id: string): Promise<void> => {
    await apiClient.delete(`/api-keys/${id}`)
  },
}

// ── Webhooks ──────────────────────────────────────────────────
export const webhooksApi = {
  list:   async (): Promise<Webhook[]>          => (await apiClient.get<Webhook[]>('/webhooks')).data,
  getOne: async (id: string): Promise<Webhook>  => (await apiClient.get<Webhook>(`/webhooks/${id}`)).data,
  create: async (p: CreateWebhookPayload): Promise<Webhook> =>
    (await apiClient.post<Webhook>('/webhooks', p)).data,
  update: async (id: string, p: UpdateWebhookPayload): Promise<Webhook> =>
    (await apiClient.put<Webhook>(`/webhooks/${id}`, p)).data,
  delete: async (id: string): Promise<void> => { await apiClient.delete(`/webhooks/${id}`) },
}

// ── Champs personnalisés ──────────────────────────────────────
export const customFieldsApi = {
  list:   async (entityType?: CustomFieldEntityType): Promise<CustomField[]> => {
    const { data } = await apiClient.get<CustomField[]>('/custom-fields', {
      params: entityType ? { entityType } : {},
    })
    return data
  },
  create: async (p: CreateCustomFieldPayload): Promise<CustomField> =>
    (await apiClient.post<CustomField>('/custom-fields', p)).data,
  delete: async (id: string): Promise<void> => { await apiClient.delete(`/custom-fields/${id}`) },
}

// ── IP Whitelist ──────────────────────────────────────────────
export const ipWhitelistApi = {
  list:   async (): Promise<IpWhitelistEntry[]> => (await apiClient.get<IpWhitelistEntry[]>('/ip-whitelist')).data,
  add:    async (p: CreateIpWhitelistPayload): Promise<IpWhitelistEntry> =>
    (await apiClient.post<IpWhitelistEntry>('/ip-whitelist', p)).data,
  remove: async (id: string): Promise<void> => { await apiClient.delete(`/ip-whitelist/${id}`) },
}

// ── Export Jobs ───────────────────────────────────────────────
export const exportsApi = {
  list:     async (): Promise<ExportJob[]> => (await apiClient.get<ExportJob[]>('/exports')).data,
  getOne:   async (id: string): Promise<ExportJob> => (await apiClient.get<ExportJob>(`/exports/${id}`)).data,
  create:   async (p: CreateExportPayload): Promise<ExportJob> =>
    (await apiClient.post<ExportJob>('/exports', p)).data,
  downloadUrl: (id: string): string =>
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api'}/exports/${id}/download`,
}
```

---

## 5. Hooks TanStack Query v5

```
src/features/settings-advanced/hooks.ts
```

Pattern standard : `useQuery` + `staleTime` + `useMutation` + `toast` + `invalidateQueries`.

### 5.1 API Keys hooks

```ts
const API_KEYS_KEY = ['api-keys'] as const

export function useApiKeys() {
  return useQuery({ queryKey: API_KEYS_KEY, queryFn: apiKeysApi.list, staleTime: 60_000 })
}
export function useCreateApiKey() {
  // NE PAS invalider immédiatement — afficher le rawKey d'abord dans un modal
  // Invalider seulement après que l'utilisateur ferme le modal de confirmation
  return useMutation({
    mutationFn: apiKeysApi.create,
    onError: () => toast.error('Erreur lors de la création de la clé API'),
  })
}
export function useRevokeApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: apiKeysApi.revoke,
    onSuccess: () => { qc.invalidateQueries({ queryKey: API_KEYS_KEY }); toast.success('Clé révoquée') },
    onError: () => toast.error('Impossible de révoquer cette clé'),
  })
}
```

### 5.2 Webhooks hooks

```ts
const WEBHOOKS_KEY = ['webhooks'] as const

export function useWebhooks() {
  return useQuery({ queryKey: WEBHOOKS_KEY, queryFn: webhooksApi.list, staleTime: 60_000 })
}
export function useWebhook(id: string) {
  return useQuery({ queryKey: [...WEBHOOKS_KEY, id], queryFn: () => webhooksApi.getOne(id), staleTime: 30_000 })
}
export function useCreateWebhook() { /* invalidate + toast.success('Webhook créé') */ }
export function useUpdateWebhook() { /* invalidate + toast.success('Webhook mis à jour') */ }
export function useDeleteWebhook() { /* invalidate + toast.success('Webhook supprimé') */ }
```

### 5.3 Custom Fields hooks

```ts
const CF_KEY = ['custom-fields'] as const

export function useCustomFields(entityType?: CustomFieldEntityType) {
  return useQuery({
    queryKey: [...CF_KEY, entityType],
    queryFn:  () => customFieldsApi.list(entityType),
    staleTime: 120_000,
  })
}
export function useCreateCustomField() { /* invalidate CF_KEY + toast */ }
export function useDeleteCustomField() { /* invalidate CF_KEY + toast */ }
```

### 5.4 IP Whitelist hooks

```ts
const IP_KEY = ['ip-whitelist'] as const
export function useIpWhitelist() { return useQuery({ queryKey: IP_KEY, queryFn: ipWhitelistApi.list, staleTime: 60_000 }) }
export function useAddIp() { /* invalidate + toast.success('IP ajoutée') */ }
export function useRemoveIp() { /* invalidate + toast.success('IP supprimée') */ }
```

### 5.5 Exports hooks

```ts
const EXPORTS_KEY = ['exports'] as const

export function useExports() {
  return useQuery({ queryKey: EXPORTS_KEY, queryFn: exportsApi.list, staleTime: 10_000 })
}
export function useCreateExport() {
  // onSuccess: invalider EXPORTS_KEY + toast 'Export lancé'
  // Le job sera en status 'pending', polling via refetchInterval
}
// Polling auto tant qu'il y a des jobs pending/processing
export function useExportsWithPolling() {
  return useQuery({
    queryKey: EXPORTS_KEY,
    queryFn:  exportsApi.list,
    staleTime: 0,
    refetchInterval: (query) => {
      const jobs = query.state.data as ExportJob[] | undefined
      const hasPending = jobs?.some(j => j.status === 'pending' || j.status === 'processing')
      return hasPending ? 5_000 : false  // poll toutes les 5s si job actif
    },
  })
}
```

---

## 6. Design specs par page

### Palette de couleurs spéciales pour les pages developer/security

```css
/* Status badges */
--badge-active:   background rgba(16,185,129,0.1),  color #10b981
--badge-inactive: background rgba(107,114,128,0.1), color #6b7280
--badge-pending:  background rgba(245,158,11,0.07), color #f59e0b
--badge-failed:   background rgba(239,68,68,0.07),  color #ef4444

/* Code/key display */
--code-bg: rgba(15, 23, 42, 0.04)
--code-border: rgba(45, 125, 210, 0.15)

/* Danger zone */
--danger-bg:     #fef2f2
--danger-border: #fca5a5
```

---

### 6.1 Page Clés API (`/settings/api-keys`)

**Objectif** : Gérer les clés API pour l'intégration de systèmes tiers à l'API InvoiceHub.

**UX critique** : La `rawKey` n'est retournée qu'une seule fois à la création — elle doit être affichée dans une modal avec bouton "Copier" et warning prominent. L'utilisateur doit confirmer avoir copié avant de fermer.

```
+------------------------------------------------------------+
| Clés API                              [+ Nouvelle clé]     |
| Accès programmatique à l'API InvoiceHub                    |
+------------------------------------------------------------+
| ⚠ Info banner — permission api-keys:manage requise         |
+------------------------------------------------------------+
| Nom               Préfixe         Permissions  Expire       |
| -----------       -----------     -----------  ----------   |
| Mon intégration   bts_live_ab...  2 perms      31/12/2026   |
|                   [Copier]        [chips]      [Révoquer]   |
|                                                             |
| Intégration ERP   bts_live_cd...  Toutes       Jamais       |
|                   [Copier]                     [Révoquer]   |
+------------------------------------------------------------+

Modal création :
+--------------------------------+
| Nouvelle clé API               |
| Nom *  [_________________]     |
| Permissions [multi-select]     |
|   □ invoices:read              |
|   □ invoices:write             |
|   □ clients:read               |
|   □ ...                        |
| Expiration [date ou Jamais]    |
|              [Annuler][Créer] |
+--------------------------------+

Modal révélation clé (après création) :
+------------------------------------------+
| ⚠ Copiez cette clé maintenant            |
| Elle ne sera JAMAIS réaffichée           |
|                                          |
| ┌──────────────────────────────────────┐ |
| │ bts_live_abc123def456...             │ |
| └──────────────────────────────────────┘ |
|                          [Copier la clé] |
|                                          |
| □ J'ai copié ma clé en lieu sûr         |
|                       [Fermer] (disabled)|
+------------------------------------------+
```

**Composants** : `ApiKeyRow`, `CreateApiKeyDrawer` (480px), `ApiKeyRevealModal`  
**Permission** : `admin` only (roles: ['admin'])

---

### 6.2 Page Webhooks (`/settings/webhooks`)

**Objectif** : Configurer les endpoints qui reçoivent les événements InvoiceHub en temps réel.

```
+------------------------------------------------------------+
| Webhooks                              [+ Nouveau webhook]   |
| Notifiez vos systèmes des événements InvoiceHub            |
+------------------------------------------------------------+
| ● Mon ERP                                    [✏] [⋮]      |
|   https://erp.example.com/webhooks/invoicehub              |
|   Events: invoice.issued · payment.created  42 livraisons  |
|   Actif · Retry: 3 · Clé secrète: ••••                    |
+------------------------------------------------------------+
| ○ Intégration Slack                          [✏] [⋮]      |
|   https://hooks.slack.com/services/xxx                     |
|   Events: invoice.overdue                    8 livraisons   |
|   Inactif                                                   |
+------------------------------------------------------------+

Drawer création/édition (560px) :
- Nom
- URL *
- Événements (checkboxes groupées par catégorie)
  [ ] FACTURATION: invoice.issued / invoice.paid / invoice.overdue / invoice.cancelled
  [ ] PROFORMAS: proforma.sent / proforma.accepted / proforma.rejected
  [ ] PAIEMENTS: payment.created
  [ ] CLIENTS: client.created
- Clé secrète (input password)
- Headers personnalisés (paires clé/valeur)
- Nombre de retries [0-5]
- Actif/Inactif toggle
```

**Composants** : `WebhookCard`, `WebhookDrawer` (560px), `WebhookDeliveryHistory` (dans le drawer ou page dédiée)  
**Permission** : `admin` only

---

### 6.3 Page IP Whitelist (`/settings/ip-whitelist`)

**Objectif** : Restreindre l'accès à l'API aux adresses IP autorisées.

```
+------------------------------------------------------------+
| Liste blanche IP                    [+ Ajouter une IP]     |
| Restreint l'accès API aux IP listées                       |
+------------------------------------------------------------+
| ⚠ Attention — Si vous activez le filtrage IP sans ajouter  |
|   votre propre IP, vous serez bloqué.                      |
|   IP actuelle détectée : 41.202.219.x                      |
+------------------------------------------------------------+
| Statut  IP Address         Description          Actions    |
| ------  ----------------   ------------------   --------   |
| ● Actif  41.202.219.1      Bureau principal Akwa  [🗑]     |
| ● Actif  192.168.1.0/24    Réseau interne BTS     [🗑]     |
| ○ Inact. 196.203.40.1      Ancien bureau (archivé) [🗑]    |
+------------------------------------------------------------+

Formulaire inline (sous le header) :
[ IP Address * ]  [ Description ]  [Actif ✓]  [+ Ajouter]
```

**Composants** : `IpWhitelistTable`, `AddIpForm` (inline)  
**Permission** : `admin` only  
**Note sécurité** : détecter l'IP courante du client (depuis la réponse API ou header) et la proposer

---

### 6.4 Page Champs personnalisés (`/settings/custom-fields`)

**Objectif** : Ajouter des champs métier supplémentaires sur les entités (factures, clients, etc.).

```
+------------------------------------------------------------+
| Champs personnalisés                                       |
| Étendez les formulaires avec vos propres champs métier    |
+------------------------------------------------------------+

Tabs horizontaux : [Factures] [Clients] [Fournisseurs] [Proformas] [Produits] [Dépenses]

+------------------------------------------------------------+
| Champs pour les Factures               [+ Nouveau champ]   |
+------------------------------------+------+------+---------+
| Label              | Nom slug     | Type | Req. | Actions |
+------------------------------------+------+------+---------+
| N° Bon commande    | num_bon_cmd  | text |  ✓   |  [🗑]  |
| Service demandeur  | service      | text |       |  [🗑]  |
| Date livraison     | date_livr.   | date |       |  [🗑]  |
+------------------------------------+------+------+---------+
| [Empty state si aucun champ]                               |
+------------------------------------------------------------+

Drawer création (480px) :
- Type d'entité (pré-sélectionné selon tab actif)
- Label *
- Nom slug * (auto-généré depuis label, editable, /^[a-z_]+$/)
- Type de champ [select: Texte | Nombre | Date | Oui/Non | Liste | JSON]
- Options (si type = select) — liste de tags ajoutables
- Requis toggle
- Valeur par défaut
- Ordre d'affichage
```

**Composants** : `CustomFieldsTabs`, `CustomFieldsTable`, `CreateCustomFieldDrawer` (480px)  
**Permission** : `settings:manage` (admin)

---

### 6.5 Page Exports (`/settings/exports`)

**Objectif** : Exporter des données en CSV/Excel/PDF/Sage/Ciel pour comptabilité externe.

```
+------------------------------------------------------------+
| Exports de données                                         |
| Exportez vos données vers Excel, CSV, Sage, ou Ciel Compta|
+------------------------------------------------------------+

Formulaire de création (card) :
+------------------------------------------------------------+
| Nouvel export                                              |
| Données       [Factures ▾]          Format  [Excel ▾]     |
| Période       [Du ____] au [____]   (facultatif)          |
|                                          [Lancer l'export] |
+------------------------------------------------------------+

Historique :
+----------+----------+------------+--------+-----------+----------+
| Date     | Données  | Format     | Statut | Taille    | Actions  |
+----------+----------+------------+--------+-----------+----------+
| 23/05    | Factures | Excel      | ✓ Prêt | 1,2 MB    | [↓] [⋮] |
| 22/05    | Clients  | CSV        | ✓ Prêt | 45 KB     | [↓] [⋮] |
| 22/05    | Factures | Sage CSV   | ⟳ En c.| —         |          |
| 21/05    | Paiemts  | PDF        | ✗ Erreur| —        | [↺]      |
+----------+----------+------------+--------+-----------+----------+

Formats :
- csv      → Données brutes universelles
- excel    → Microsoft Excel (.xlsx)
- pdf      → Document PDF imprimable
- sage_csv → Import Sage Compta
- ciel_csv → Import Ciel Compta
```

**Composants** : `CreateExportForm`, `ExportJobsTable`, `ExportStatusBadge`  
**Polling** : `refetchInterval: 5000` tant que status `pending | processing`  
**Download** : `window.open(exportsApi.downloadUrl(id))` — le token JWT doit être passé en query param ou via un endpoint dédié

> **Attention téléchargement** : `axios.get(..., { responseType: 'blob' })` puis créer un URL object temporaire — ne pas utiliser `window.open` direct (le token JWT ne sera pas envoyé).

---

## 7. Navigation — `overlay-panels.ts`

Ajouter une section **DÉVELOPPEUR** dans la clé `settings` :

```ts
{
  title: 'DÉVELOPPEUR',
  items: [
    { label: 'Clés API',            href: ROUTES.SETTINGS_API_KEYS,      icon: KeyRound,   roles: ['admin'] },
    { label: 'Webhooks',            href: ROUTES.SETTINGS_WEBHOOKS,      icon: Webhook,    roles: ['admin'] },
    { label: 'IP Whitelist',        href: ROUTES.SETTINGS_IP_WHITELIST,  icon: Shield,     roles: ['admin'] },
    { label: 'Champs personnalisés',href: ROUTES.SETTINGS_CUSTOM_FIELDS, icon: Sliders,    roles: ['admin'] },
    { label: 'Exports',             href: ROUTES.SETTINGS_EXPORTS,       icon: Download,   roles: ['admin'] },
  ],
},
```

Icônes Lucide à importer : `KeyRound`, `Webhook`, `Shield` (ou `ShieldCheck`), `Sliders`, `Download`

---

## 8. Constants à remettre

Dans `src/lib/constants.ts`, dans le bloc `SETTINGS_*` :

```ts
// ── Paramètres avancés ─────────────────────────────────────────
SETTINGS_API_KEYS:      '/settings/api-keys',
SETTINGS_WEBHOOKS:      '/settings/webhooks',
SETTINGS_IP_WHITELIST:  '/settings/ip-whitelist',
SETTINGS_CUSTOM_FIELDS: '/settings/custom-fields',
SETTINGS_EXPORTS:       '/settings/exports',
```

---

## 9. Loading skeletons (loading.tsx)

Chaque page doit avoir son `loading.tsx` qui reproduit la structure. Pattern :

```tsx
export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header skeleton */}
      <div style={{ height: 28, width: 200, background: 'var(--border)', borderRadius: 6 }} className="animate-pulse" />
      {/* Card skeleton */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ height: 40, background: 'var(--surface)', borderBottom: '2px solid var(--border)', marginBottom: 12 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 48, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 8 }} className="animate-pulse" />
        ))}
      </div>
    </div>
  )
}
```

Adapter les hauteurs selon la structure réelle de chaque page.

---

## 10. Error pages (error.tsx)

Pattern identique aux autres pages settings :

```tsx
'use client'
import { TriangleAlert } from 'lucide-react'
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12 }}>
      <TriangleAlert size={40} style={{ color: '#dc2626' }} />
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Erreur de chargement</p>
      <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{error.message}</p>
      <button onClick={reset} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
        Réessayer
      </button>
    </div>
  )
}
```

---

## 11. Plan d'implémentation — étapes ordonnées

### Étape 1 — Fondations (feature layer + constants + nav) ✅
- [x] `src/lib/constants.ts` — remettre les 5 routes SETTINGS_*
- [x] `src/features/settings-advanced/types.ts` — tous les types
- [x] `src/features/settings-advanced/api.ts` — toutes les fonctions API
- [x] `src/features/settings-advanced/hooks.ts` — tous les hooks
- [x] `src/components/layout/overlay-panels.ts` — ajouter section DÉVELOPPEUR

### Étape 2 — Page Exports (`/settings/exports`) ✅
- [x] `src/app/(dashboard)/settings/exports/page.tsx`
- [x] `src/app/(dashboard)/settings/exports/loading.tsx`
- [x] `src/app/(dashboard)/settings/exports/error.tsx`

### Étape 3 — Page Clés API (`/settings/api-keys`) ✅
- [x] `src/app/(dashboard)/settings/api-keys/page.tsx`
- [x] `src/app/(dashboard)/settings/api-keys/loading.tsx`
- [x] `src/app/(dashboard)/settings/api-keys/error.tsx`

### Étape 4 — Page Webhooks (`/settings/webhooks`) ✅
- [x] `src/app/(dashboard)/settings/webhooks/page.tsx`
- [x] `src/app/(dashboard)/settings/webhooks/loading.tsx`
- [x] `src/app/(dashboard)/settings/webhooks/error.tsx`

### Étape 5 — Page IP Whitelist (`/settings/ip-whitelist`) ✅
- [x] `src/app/(dashboard)/settings/ip-whitelist/page.tsx`
- [x] `src/app/(dashboard)/settings/ip-whitelist/loading.tsx`
- [x] `src/app/(dashboard)/settings/ip-whitelist/error.tsx`

### Étape 6 — Page Champs personnalisés (`/settings/custom-fields`) ✅
- [x] `src/app/(dashboard)/settings/custom-fields/page.tsx`
- [x] `src/app/(dashboard)/settings/custom-fields/loading.tsx`
- [x] `src/app/(dashboard)/settings/custom-fields/error.tsx`

---

## 12. Checklist UX globale

- [ ] Tous les boutons icônes ont `aria-label`
- [ ] Touch targets `min-height: 44px` sur tous les boutons
- [ ] `cursor: pointer` sur tous les éléments cliquables
- [ ] Focus rings visibles (`outline: 2px solid var(--primary)`)
- [ ] Modales : `role="dialog"`, `aria-modal`, focus trap, `Escape` pour fermer
- [ ] Loading states : skeleton ou spinner selon contexte
- [ ] Error states : message clair + bouton retry
- [ ] Empty states : message + CTA sur toutes les tables vides
- [ ] Toasts : success (vert) + error (rouge) sur toutes les mutations
- [ ] Confirmations avant suppression (`ConfirmDeleteModal` pattern de billing/page.tsx)
- [ ] rawKey affiché UNE SEULE FOIS avec copy button + confirmation checkbox
- [ ] Polling exports : refetchInterval 5000ms tant que pending/processing
- [ ] Download export : via axios blob, pas window.open (JWT header requis)

---

## 13. Notes d'implémentation importantes

### API Key rawKey — one-time display
```tsx
// Après création, stocker temporairement dans état local
const [revealedKey, setRevealedKey] = useState<string | null>(null)
const createMut = useCreateApiKey()

async function handleCreate(payload) {
  const result = await createMut.mutateAsync(payload)
  // result.data.rawKey est disponible UNE SEULE FOIS ici
  setRevealedKey(result.data.rawKey)
  // Invalider la liste seulement après fermeture du modal
}
```

### Export download via axios (JWT token)
```tsx
async function downloadExport(id: string) {
  const response = await apiClient.get(`/exports/${id}/download`, {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(response.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `export-${id}.xlsx`  // adapter selon format
  a.click()
  URL.revokeObjectURL(url)
}
```

### Slug auto-généré pour custom fields
```tsx
function labelToSlug(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // remove accents
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}
```

### Polling exports avec TanStack Query v5
```tsx
// refetchInterval comme fonction (v5 syntax)
refetchInterval: (query) => {
  const jobs = query.state.data as ExportJob[] | undefined
  return jobs?.some(j => j.status === 'pending' || j.status === 'processing')
    ? 5_000
    : false
}
```
