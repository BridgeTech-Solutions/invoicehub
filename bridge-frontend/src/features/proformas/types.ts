export type ProformaStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'

export type DiscountType = 'none' | 'percentage' | 'fixed'

export type LineUnit = 'heure' | 'jour' | 'forfait' | 'piece' | 'licence' | 'mois' | 'annee'

export interface ProformaLineBase {
  id: string
  productId: string | null
  sortOrder: number
  designation: string
  description: string | null
  unit: string
  quantity: number
  unitPriceHt: number
  discountType: DiscountType
  discountValue: number
  discountAmount: number
  taxRate: number
  subtotalHt: number
  netHt: number
  taxAmount: number
  totalTtc: number
}

export interface ProformaClient {
  id: string
  name: string
  email: string | null
}

export interface ProformaUser {
  id: string
  firstName: string
  lastName: string
}

export interface ProformaStatusHistory {
  id: string
  changedAt: string
  previousStatus: string | null
  newStatus: string
  reason: string | null
  changedBy: ProformaUser
}

export interface ProformaBankAccount {
  id: string
  name: string
  bankName: string
  accountNumber: string | null
  iban: string | null
  swiftBic: string | null
}

export interface Proforma {
  id: string
  number: string
  status: ProformaStatus
  clientId: string
  client: ProformaClient & { email?: string | null }
  officeId: string
  createdById: string
  createdBy: ProformaUser
  assignedTo?: ProformaUser | null
  issueDate: string
  validUntil: string
  lastSentAt: string | null
  pdfGeneratedAt: string | null
  subject: string | null
  notes: string | null
  paymentConditions: string | null
  deliveryDelay: string | null
  warranty: string | null
  currency: string
  globalDiscountType: DiscountType
  globalDiscountValue: number
  globalDiscountAmount: number
  subtotalHt: number
  totalHt: number
  totalTax: number
  totalTtc: number
  lines: ProformaLineBase[]
  statusHistory?: ProformaStatusHistory[]
  bankAccountId?: string | null
  bankAccount?: ProformaBankAccount | null
  requiresApproval: boolean
  approvalRequest?: { status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired'; currentStep: number; totalSteps: number } | null
  createdAt: string
  updatedAt: string
}

export type ProformaListItem = Omit<Proforma, 'lines' | 'statusHistory'>

export interface PaginatedProformas {
  data: ProformaListItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface CreateProformaLinePayload {
  productId?: string
  sortOrder: number
  designation: string
  description?: string
  unit: string
  quantity: number
  unitPriceHt: number
  discountType?: DiscountType
  discountValue?: number
  taxRate?: number
}

export interface CreateProformaPayload {
  clientId: string
  officeId?: string
  assignedToId?: string
  issueDate?: string
  validUntil: string
  subject?: string
  notes?: string
  paymentConditions?: string
  deliveryDelay?: string
  warranty?: string
  currency?: string
  globalDiscountType?: DiscountType
  globalDiscountValue?: number
  bankAccountId?: string
  lines: CreateProformaLinePayload[]
}

export type UpdateProformaPayload = Partial<CreateProformaPayload>

export interface ListProformasParams {
  page?: number
  limit?: number
  clientId?: string
  status?: ProformaStatus
  search?: string
  dateFrom?: string
  dateTo?: string
}

export interface ConvertToInvoicePayload {
  invoiceType: 'standard' | 'acompte'
  acomptePercentage?: number
}

// ─── Local form types ──────────────────────────────────────────

/** Line state in the form (with computed values + local key) */
export interface FormLine {
  _localId: string          // React key (crypto.randomUUID)
  productId?: string
  sortOrder: number
  designation: string
  description: string
  unit: string
  quantity: number
  unitPriceHt: number
  discountType: DiscountType
  discountValue: number
  taxRate: number
  // computed (kept in sync)
  subtotalHt: number
  discountAmount: number
  netHt: number
  taxAmount: number
  totalTtc: number
  // Mode service : masque Ref/Qté/PU sur le PDF — PU devient le montant total de la prestation
  hideDetails?: boolean
}

export interface DocumentTotals {
  sumNetHt: number        // sub-total (sum of per-line netHt)
  globalDiscountAmount: number
  totalHt: number         // after global discount
  totalTax: number        // sum of per-line taxAmount
  totalTtc: number
}
