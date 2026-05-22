// ─── Purchase Orders feature — types ─────────────────────────

export type PurchaseOrderStatus =
  | 'draft' | 'pending' | 'approved' | 'ordered'
  | 'partially_received' | 'received' | 'billed' | 'cancelled'

export interface PurchaseOrderLine {
  id:             string
  sortOrder:      number
  productId:      string | null
  designation:    string
  description:    string | null
  unit:           string
  quantity:       number
  unitPriceHt:    number
  taxRate:        number
  subtotalHt:     number
  taxAmount:      number
  totalTtc:       number
  receivedQty:    number
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
  orderDate:        string
  expectedDate:     string | null
  receivedDate:     string | null
  reference:        string | null
  notes:            string | null
  paymentTermDays:  number
  subtotalHt:       number
  totalTax:         number
  totalTtc:         number
  lines:            PurchaseOrderLine[]
  createdAt:        string
  updatedAt:        string
}

export interface PurchaseOrderListItem {
  id:              string
  number:          string
  status:          PurchaseOrderStatus
  supplierId:      string
  supplier:        PurchaseOrderSupplier
  orderDate:       string
  expectedDate:    string | null
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

export interface PurchaseOrderStats {
  total:            number
  pending:          number
  approved:         number
  received:         number
  totalAmountMonth: number
}
