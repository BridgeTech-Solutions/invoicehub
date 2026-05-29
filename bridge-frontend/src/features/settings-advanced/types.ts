// ── Clés API ──────────────────────────────────────────────────────
export interface ApiKey {
  id:          string
  name:        string
  keyPrefix:   string
  permissions: string[]
  expiresAt:   string | null
  lastUsedAt:  string | null
  createdAt:   string
  isActive:    boolean
}

export interface CreateApiKeyPayload {
  name:         string
  permissions:  string[]
  expiresAt?:   string | null
  ipWhitelist?: string[]
}

// ── Webhooks ──────────────────────────────────────────────────────
export interface WebhookDelivery {
  id:         string
  status:     'success' | 'failed'
  statusCode: number | null
  duration:   number | null
  createdAt:  string
}

export interface Webhook {
  id:          string
  name:        string
  url:         string
  events:      string[]
  secret:      string | null
  headers:     Record<string, string>
  isActive:    boolean
  retryCount:  number
  createdAt:   string
  updatedAt:   string
  _count?:     { deliveries: number }
  deliveries?: WebhookDelivery[]
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

// ── Champs personnalisés ──────────────────────────────────────────
export type CustomFieldEntityType = 'client' | 'supplier' | 'invoice' | 'proforma' | 'product' | 'expense'
export type CustomFieldType       = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'json'

export interface CustomField {
  id:           string
  entityType:   CustomFieldEntityType
  name:         string
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

// ── IP Whitelist ──────────────────────────────────────────────────
export interface IpWhitelistEntry {
  id:          string
  ipAddress:   string
  label:       string
  isActive:    boolean
  createdAt:   string
  createdById: string | null
}

export interface CreateIpWhitelistPayload {
  ipAddress: string
  label?:    string | null
  isActive?: boolean
}

// ── Export Jobs ───────────────────────────────────────────────────
export type ExportEntityType = 'invoices' | 'clients' | 'products' | 'payments' | 'expenses' | 'accounting_entries'
export type ExportFormat     = 'csv' | 'excel' | 'pdf' | 'sage_csv' | 'ciel_csv'
export type ExportStatus     = 'pending' | 'processing' | 'completed' | 'failed'

export interface ExportJob {
  id:           string
  module:       ExportEntityType
  format:       ExportFormat
  filters:      Record<string, unknown>
  status:       ExportStatus
  filePath:     string | null
  errorMessage: string | null
  progress:     number
  fileSizeBytes:number | null
  startedAt:    string | null
  completedAt:  string | null
  expiresAt:    string
  createdAt:    string
  createdById:  string
}

export interface CreateExportPayload {
  entityType: ExportEntityType
  format:     ExportFormat
  filters?:   Record<string, unknown>
}

// ── Constantes UI ─────────────────────────────────────────────────
export const EXPORT_ENTITY_LABELS: Record<ExportEntityType, string> = {
  invoices:            'Factures',
  clients:             'Clients',
  products:            'Produits',
  payments:            'Paiements',
  expenses:            'Dépenses',
  accounting_entries:  'Écritures comptables',
}

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  csv:      'CSV universel',
  excel:    'Excel (.xlsx)',
  pdf:      'PDF',
  sage_csv: 'Sage Compta',
  ciel_csv: 'Ciel Compta',
}

export const CUSTOM_FIELD_ENTITY_LABELS: Record<CustomFieldEntityType, string> = {
  client:   'Clients',
  supplier: 'Fournisseurs',
  invoice:  'Factures',
  proforma: 'Proformas',
  product:  'Produits',
  expense:  'Dépenses',
}

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text:    'Texte',
  number:  'Nombre',
  date:    'Date',
  boolean: 'Oui / Non',
  select:  'Liste de choix',
  json:    'JSON',
}

export const WEBHOOK_EVENTS: { group: string; events: { value: string; label: string }[] }[] = [
  {
    group: 'Facturation',
    events: [
      { value: 'invoice.created',   label: 'Facture créée' },
      { value: 'invoice.issued',    label: 'Facture émise' },
      { value: 'invoice.paid',      label: 'Facture payée' },
      { value: 'invoice.overdue',   label: 'Facture en retard' },
      { value: 'invoice.cancelled', label: 'Facture annulée' },
    ],
  },
  {
    group: 'Proformas',
    events: [
      { value: 'proforma.created',  label: 'Proforma créé' },
      { value: 'proforma.sent',     label: 'Proforma envoyé' },
      { value: 'proforma.accepted', label: 'Proforma accepté' },
      { value: 'proforma.rejected', label: 'Proforma rejeté' },
      { value: 'proforma.expired',  label: 'Proforma expiré' },
    ],
  },
  {
    group: 'Paiements',
    events: [
      { value: 'payment.created', label: 'Paiement enregistré' },
    ],
  },
  {
    group: 'Clients',
    events: [
      { value: 'client.created',  label: 'Client créé' },
      { value: 'client.archived', label: 'Client archivé' },
    ],
  },
  {
    group: 'Dépenses',
    events: [
      { value: 'expense.created',  label: 'Dépense créée' },
      { value: 'expense.approved', label: 'Dépense approuvée' },
    ],
  },
]

export const API_KEY_PERMISSIONS: { value: string; label: string }[] = [
  { value: 'invoices:read',   label: 'Factures — lecture' },
  { value: 'invoices:write',  label: 'Factures — écriture' },
  { value: 'proformas:read',  label: 'Proformas — lecture' },
  { value: 'proformas:write', label: 'Proformas — écriture' },
  { value: 'clients:read',    label: 'Clients — lecture' },
  { value: 'clients:write',   label: 'Clients — écriture' },
  { value: 'payments:read',   label: 'Paiements — lecture' },
  { value: 'payments:write',  label: 'Paiements — écriture' },
  { value: 'products:read',   label: 'Produits — lecture' },
  { value: 'reports:read',    label: 'Rapports — lecture' },
]
