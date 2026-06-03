// ─── Purchase Orders feature — types ─────────────────────────

export type PurchaseOrderStatus =
  | 'draft' | 'sent' | 'confirmed'
  | 'partially_received' | 'received' | 'invoiced' | 'cancelled' | 'closed'

export interface PurchaseOrderLine {
  id:               string
  sortOrder:        number
  productId:        string | null
  designation:      string
  description:      string | null
  unit:             string
  quantityOrdered:  number
  quantityReceived: number
  unitPriceHt:      number
  discountType:     string
  discountValue:    number
  discountAmount:   number
  taxRate:          number
  subtotalHt:       number
  netHt:            number
  taxAmount:        number
  totalTtc:         number
}

export interface PurchaseOrderSupplier {
  id:    string
  name:  string
  email: string | null
  phone: string | null
}

export interface PurchaseOrderUser {
  id:        string
  firstName: string
  lastName:  string
}

export interface PurchaseOrder {
  id:               string
  number:           string
  status:           PurchaseOrderStatus
  supplierId:       string
  supplier:         PurchaseOrderSupplier
  officeId:         string
  createdById:      string
  createdBy:        PurchaseOrderUser
  approvedById:     string | null
  approvedBy:       PurchaseOrderUser | null
  approvedAt:       string | null
  issueDate:        string
  expectedDeliveryDate: string | null
  receivedDate:     string | null
  reference:        string | null
  notes:            string | null
  paymentTermDays:  number
  subtotalHt:       number
  totalTax:         number
  totalTtc:         number
  fullyInvoiced:    boolean
  lines:            PurchaseOrderLine[]
  // Workflow d'approbation
  requiresApproval:  boolean
  approvalRequestId: string | null
  approvalRequest:   { status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired'; currentStep: number; totalSteps: number } | null
  createdAt:        string
  updatedAt:        string
}

export interface PurchaseOrderListItem {
  id:              string
  number:          string
  status:          PurchaseOrderStatus
  supplierId:      string
  supplier:        PurchaseOrderSupplier
  issueDate:       string
  expectedDeliveryDate: string | null
  totalTtc:        number
  createdAt:       string
}

export interface PaginatedPurchaseOrders {
  data:       PurchaseOrderListItem[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface ListPurchaseOrdersParams {
  page?:       number
  limit?:      number
  search?:     string
  status?:     PurchaseOrderStatus | ''
  supplierId?: string
  dateFrom?:   string
  dateTo?:     string
}

export interface CreatePOLine {
  productId?:    string
  designation:   string
  description?:  string
  unit?:         string
  quantity:      number
  unitPriceHt:   number
  taxRate?:      number
  sortOrder?:    number
}

export interface CreatePurchaseOrderPayload {
  supplierId:       string
  orderDate:        string
  expectedDate?:    string
  reference?:       string
  notes?:           string
  paymentTermDays?: number
  lines:            CreatePOLine[]
}

export type UpdatePurchaseOrderPayload = Partial<CreatePurchaseOrderPayload>

export interface LinkedSupplierInvoice {
  id:          string
  number:      string
  status:      string
  totalTtc:    number
  invoiceDate: string
  amountPaid:  number
  balanceDue:  number
}

export interface PurchaseOrderStats {
  total:            number
  pending:          number
  approved:         number
  received:         number
  totalAmountMonth: number
}
