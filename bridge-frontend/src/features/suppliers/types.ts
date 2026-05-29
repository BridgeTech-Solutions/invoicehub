// ─── Suppliers feature — types ────────────────────────────────

export interface Supplier {
  id:                  string
  name:                string
  type:                'individual' | 'company' | 'government' | 'ngo' | 'other'
  email:               string | null
  phone:               string | null
  address:             string | null
  city:                string | null
  country:             string | null
  taxNumber:           string | null
  rccm:                string | null
  website:             string | null
  defaultDueDays:      number
  currency:            string
  paymentMethod:       'virement' | 'especes' | 'cheque' | 'mobile_money' | 'autre' | null
  status:              'active' | 'inactive' | 'blacklisted'
  category:            string | null
  rating:              number | null
  bankName:            string | null
  bankAccount:         string | null
  accountingAccount:   string | null
  internalNotes:       string | null
  supplierCode:        string | null
  createdAt:           string
  updatedAt:           string
  _count?: {
    purchaseOrders:    number
    invoices:          number
  }
  totalPurchases?:     number
  totalDue?:           number
}

export interface SupplierListItem {
  id:                  string
  name:                string
  supplierCode:        string | null
  email:               string | null
  phone:               string | null
  city:                string | null
  country:             string | null
  taxNumber:           string | null
  rccm:                string | null
  defaultDueDays:      number
  currency:            string
  status:              'active' | 'inactive' | 'blacklisted'
  category:            string | null
  rating:              number | null
  totalPurchases:      number
  totalDue:            number
  createdAt:           string
  _count: {
    purchaseOrders:    number
    invoices:          number
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
  status?:  'active' | 'inactive' | 'blacklisted'
}

export interface CreateSupplierPayload {
  name:               string
  type?:              'individual' | 'company' | 'government' | 'ngo' | 'other'
  email?:             string
  phone?:             string
  address?:           string
  city?:              string
  country?:           string
  taxNumber?:         string
  rccm?:              string
  website?:           string
  currency?:          string
  defaultDueDays?:    number
  paymentMethod?:     'virement' | 'especes' | 'cheque' | 'mobile_money' | 'autre'
  status?:            'active' | 'inactive' | 'blacklisted'
  category?:          string
  rating?:            number
  bankName?:          string
  bankAccount?:       string
  accountingAccount?: string
  internalNotes?:     string
}

export type UpdateSupplierPayload = Partial<CreateSupplierPayload>
