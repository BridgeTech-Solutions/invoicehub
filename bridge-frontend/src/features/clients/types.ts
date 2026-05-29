export interface Client {
  id:                    string
  name:                  string
  type:                  'company' | 'individual'
  status:                'active' | 'archived'
  email?:                string | null
  phone?:                string | null
  phone2?:               string | null
  city?:                 string | null
  country?:              string | null
  address?:              string | null
  postalBox?:            string | null
  taxNumber?:            string | null
  rccm?:                 string | null
  accountingAccount?:    string | null
  defaultPaymentTerms?:  string | null
  internalNotes?:        string | null
  createdAt:             string
  updatedAt?:            string
}

export interface ClientSummary {
  invoiceCount:        number
  totalInvoiced:       number
  totalPaid:           number
  totalPending:        number
  pendingInvoiceCount: number
}

export interface ClientQuickFill {
  suggestedDueDate:     string
  suggestedProducts:    Array<{
    productId:    string
    name:         string
    reference:    string | null
    unit:         string
    lastPriceHt:  number
    usageCount:   number
  }>
  lastPaymentConditions: string | null
  lastDiscount:          { type: string; value: number } | null
  lastCurrency:          string
  unpaidBalance:         number
  unpaidInvoicesCount:   number
  paymentBehavior: {
    avgDaysLate:        number | null
    onTimeRate:         number | null
    totalPaidInvoices:  number
  }
}

export interface ListClientsParams {
  page?:    number
  limit?:   number
  type?:    'company' | 'individual'
  status?:  'active' | 'archived'
  search?:  string
  city?:    string
}

export interface PaginatedClients {
  data:       Client[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface CreateClientPayload {
  name:                  string
  type:                  'company' | 'individual'
  email?:                string
  phone?:                string
  phone2?:               string
  city?:                 string
  country?:              string
  address?:              string
  postalBox?:            string
  taxNumber?:            string
  rccm?:                 string
  accountingAccount?:    string
  defaultPaymentTerms?:  string
  internalNotes?:        string
}

export type UpdateClientPayload = Partial<CreateClientPayload>

// ── Import en masse ───────────────────────────────────────────────────────────

export interface ImportClientRow {
  type?:                'company' | 'individual'
  name:                 string
  email?:               string
  phone?:               string
  phone2?:              string
  address?:             string
  city?:                string
  country?:             string
  postalBox?:           string
  taxNumber?:           string
  rccm?:                string
  currency?:            string
  defaultPaymentTerms?: string
  internalNotes?:       string
}

export interface ImportClientResult {
  created:    number
  duplicates: { index: number; name: string; reason: string }[]
  errors:     { index: number; name: string; message: string }[]
}

/** Statut d'une ligne dans la preview avant import */
export type ImportRowStatus = 'valid' | 'error' | 'duplicate'

export interface ImportPreviewRow extends ImportClientRow {
  _rowIndex: number
  _status:   ImportRowStatus
  _message?: string
}
