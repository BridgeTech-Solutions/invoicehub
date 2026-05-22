// ─── Suppliers feature — types ────────────────────────────────

export interface Supplier {
  id:                  string
  name:                string
  email:               string | null
  phone:               string | null
  address:             string | null
  city:                string | null
  country:             string | null
  taxNumber:           string | null
  rccm:                string | null
  website:             string | null
  paymentTermDays:     number
  currency:            string
  accountingAccount:   string | null
  isActive:            boolean
  notes:               string | null
  createdAt:           string
  updatedAt:           string
  _count?: {
    purchaseOrders:    number
    supplierInvoices:  number
  }
  totalPurchases?:     number
  totalDue?:           number
}

export interface SupplierListItem {
  id:                  string
  name:                string
  email:               string | null
  phone:               string | null
  city:                string | null
  country:             string | null
  taxNumber:           string | null
  rccm:                string | null
  paymentTermDays:     number
  currency:            string
  isActive:            boolean
  totalPurchases:      number
  totalDue:            number
  createdAt:           string
  _count: {
    purchaseOrders:    number
    supplierInvoices:  number
  }
}

export interface PaginatedSuppliers {
  data:       SupplierListItem[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface ListSuppliersParams {
  page?:    number
  limit?:   number
  search?:  string
  isActive?: boolean
}

export interface CreateSupplierPayload {
  name:               string
  email?:             string
  phone?:             string
  address?:           string
  city?:              string
  country?:           string
  taxNumber?:         string
  rccm?:              string
  website?:           string
  paymentTermDays?:   number
  currency?:          string
  accountingAccount?: string
  notes?:             string
}

export type UpdateSupplierPayload = Partial<CreateSupplierPayload> & { isActive?: boolean }
