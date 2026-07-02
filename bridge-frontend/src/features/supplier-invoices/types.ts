// ─── Supplier Invoices feature — types ───────────────────────

export type SupplierInvoiceStatus =
  | 'received' | 'validated' | 'partially_paid' | 'paid' | 'disputed' | 'cancelled'

export interface SupplierInvoiceLine {
  id:                   string
  sortOrder:            number
  purchaseOrderLineId:  string | null
  productId:            string | null
  designation:          string
  description:          string | null
  unit:                 string
  quantity:             number
  unitPriceHt:          number
  discountValue:        number
  discountAmount:       number
  taxRate:              number
  subtotalHt:           number
  netHt:                number
  taxAmount:            number
  totalTtc:             number
}

export interface SupplierInvoiceSupplier {
  id:    string
  name:  string
  email: string | null
  phone: string | null
}

export interface SupplierInvoiceUser {
  id:        string
  firstName: string
  lastName:  string
}

export interface SupplierInvoicePayment {
  id:          string
  paymentDate: string
  amount:      number
  method:      string
  reference:   string | null
  notes:       string | null
}

export interface SupplierInvoice {
  id:                  string
  number:              string
  supplierInvoiceNumber: string | null
  status:              SupplierInvoiceStatus
  supplierId:          string
  supplier:            SupplierInvoiceSupplier
  purchaseOrderId:     string | null
  purchaseOrderNumber: string | null
  invoiceDate:         string
  dueDate:             string | null
  receivedDate:        string | null
  subtotalHt:          number
  totalTax:            number
  totalTtc:            number
  amountPaid:          number
  balanceDue:          number
  attachmentPath:      string | null
  notes:               string | null
  accountingAccount:   string | null
  lines:               SupplierInvoiceLine[]
  payments:            SupplierInvoicePayment[]
  createdBy:           SupplierInvoiceUser
  // Workflow d'approbation
  requiresApproval:    boolean
  approvalRequestId:   string | null
  approvalRequest:     { status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired'; currentStep: number; totalSteps: number } | null
  /** Calculé (statut « reçue ») : true si la validation déclenchera une soumission pour approbation. */
  willRequireApproval?: boolean
  createdAt:           string
  updatedAt:           string
}

export interface SupplierInvoiceListItem {
  id:                  string
  number:              string
  supplierInvoiceNumber: string | null
  status:              SupplierInvoiceStatus
  supplierId:          string
  supplier:            SupplierInvoiceSupplier
  purchaseOrderId:     string | null
  purchaseOrderNumber: string | null
  invoiceDate:         string
  dueDate:             string | null
  totalTtc:            number
  amountPaid:          number
  balanceDue:          number
  createdAt:           string
}

export interface PaginatedSupplierInvoices {
  data:       SupplierInvoiceListItem[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface ListSupplierInvoicesParams {
  page?:       number
  limit?:      number
  search?:     string
  status?:     SupplierInvoiceStatus | ''
  supplierId?: string
  dateFrom?:   string
  dateTo?:     string
}

export interface CreateSILine {
  purchaseOrderLineId?: string
  productId?:           string
  designation:          string
  description?:         string
  unit?:                string
  quantity:             number
  unitPrice:            number
  discountPercent?:     number
  taxRate?:             number
  sortOrder?:           number
}

export interface CreateSupplierInvoicePayload {
  supplierId:          string
  supplierInvoiceRef?: string
  purchaseOrderId?:    string
  officeId?:           string
  invoiceDate:         string
  dueDate?:            string
  currency?:           string
  notes?:              string
  accountingAccount?:  string
  lines:               CreateSILine[]
}

export type UpdateSupplierInvoicePayload = Partial<CreateSupplierInvoicePayload>

export interface RecordSupplierPaymentPayload {
  paymentDate:   string
  amount:        number
  method:        'bank_transfer' | 'cash' | 'check' | 'mobile_money' | 'other'
  reference?:    string
  bankAccountId?: string
  notes?:        string
}

export interface SupplierInvoiceStats {
  totalDue:        number
  overdueAmount:   number
  dueSoon:         number
  overdueCount:    number
}
