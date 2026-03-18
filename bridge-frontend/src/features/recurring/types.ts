export type RecurringInterval = 'monthly' | 'quarterly' | 'biannual' | 'annual'

export interface RecurringLine {
  id: string
  sortOrder: number
  designation: string
  description?: string | null
  unit: string
  quantity: number
  unitPriceHt: number
  discountType: string
  discountValue: number
  taxRate: number
}

export interface RecurringTemplate {
  id: string
  interval: RecurringInterval
  nextInvoiceDate: string
  endDate?: string | null
  subject?: string | null
  notes?: string | null
  paymentConditions?: string | null
  currency: string
  isActive: boolean
  createdAt: string
  client: { id: string; name: string }
  createdBy: { id: string; firstName: string; lastName: string }
  lines: RecurringLine[]
}

export interface PaginatedRecurring {
  data: RecurringTemplate[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ListRecurringParams {
  page?: number
  limit?: number
  clientId?: string
  isActive?: boolean
}

export interface CreateRecurringPayload {
  clientId: string
  interval: RecurringInterval
  nextInvoiceDate: string
  endDate?: string
  subject?: string
  notes?: string
  paymentConditions?: string
  currency?: string
  lines: {
    sortOrder: number
    designation: string
    description?: string
    unit: string
    quantity: number
    unitPriceHt: number
    discountType: string
    discountValue: number
    taxRate: number
  }[]
}

export type UpdateRecurringPayload = Partial<CreateRecurringPayload>
