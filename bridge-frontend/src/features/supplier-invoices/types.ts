// ─── Supplier Invoices feature — types ───────────────────────

export type SupplierInvoiceStatus =
  | 'draft' | 'pending_approval' | 'approved'
  | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'

export interface SupplierInvoiceLine {
  id:           string
  sortOrder:    number
  productId:    string | null
  designation:  string
  description:  string | null
  unit:         string
  quantity:     number
  unitPriceHt:  number
  taxRate:      number
  subtotalHt:   number
  taxAmount:    number
  totalTtc:     number
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
  supplierRef:         string | null
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
  createdAt:           string
  updatedAt:           string
}

export interface SupplierInvoiceListItem {
  id:                  string
  number:              string
  supplierRef:         string | null
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
  productId?:    string
  designation:   string
  description?:  string
  unit?:         string
  quantity:      number
  unitPriceHt:   number
  taxRate?:      number
  sortOrder?:    number
}

export interface CreateSupplierInvoicePayload {
  supplierId:          string
  supplierRef?:        string
  purchaseOrderId?:    string
  invoiceDate:         string
  dueDate?:            string
  notes?:              string
  accountingAccount?:  string
  lines:               CreateSILine[]
}

export type UpdateSupplierInvoicePayload = Partial<CreateSupplierInvoicePayload>

export interface RecordSupplierPaymentPayload {
  paymentDate:  string
  amount:       number
  method:       string
  reference?:   string
  notes?:       string
}

export interface SupplierInvoiceStats {
  totalDue:        number
  overdueAmount:   number
  dueSoon:         number
  overdueCount:    number
}
