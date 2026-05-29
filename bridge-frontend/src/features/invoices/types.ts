export type InvoiceType   = 'standard' | 'acompte' | 'solde' | 'avoir' | 'recurring'
export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'
export type LineUnit      = 'heure' | 'jour' | 'forfait' | 'piece' | 'licence' | 'mois' | 'annee'
export type PaymentMethod = 'virement' | 'especes' | 'cheque' | 'mobile_money' | 'autre'
// Shared with proformas — import for in-file use + re-export for consumers
import type { DiscountType } from '@/features/proformas/types'
export type { DiscountType }

// ─── API entities ──────────────────────────────────────────────

export interface InvoiceLineBase {
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
  hideDetails: boolean
}

export interface InvoiceClient {
  id: string
  name: string
  email: string | null
  phone: string | null
}

export interface InvoiceUser {
  id: string
  firstName: string
  lastName: string
}

export interface InvoiceStatusHistory {
  id: string
  changedAt: string
  previousStatus: string | null
  newStatus: string
  changedBy: InvoiceUser
}

export interface PaymentBankAccount {
  id: string
  name: string
  accountingAccount: string | null
}

export interface InvoiceBankAccount {
  id: string
  name: string
  bankName: string
  accountNumber: string | null
  iban: string | null
  swiftBic: string | null
}

export interface Payment {
  id: string
  invoiceId: string
  paymentDate: string
  amount: number
  method: PaymentMethod
  reference: string | null
  notes: string | null
  attachmentPath: string | null
  bankAccountId: string | null
  bankAccount: PaymentBankAccount | null
  reconciledAt: string | null
  reconciledBy: InvoiceUser | null
  escompteApplied: boolean
  escompteAmount: number
  createdById: string
  createdBy: InvoiceUser
  invoice?: {
    id: string
    number: string
    client: { name: string }
  }
  deletedAt: string | null
  createdAt: string
}

export interface Invoice {
  id: string
  number: string
  type: InvoiceType
  status: InvoiceStatus
  clientId: string
  client: InvoiceClient
  officeId: string
  createdById: string
  createdBy: InvoiceUser
  assignedTo?: InvoiceUser | null
  proformaId: string | null
  parentInvoiceId: string | null
  parentInvoice?: { id: string; number: string; type: InvoiceType; totalTtc: number } | null
  creditedInvoiceId: string | null
  creditedInvoice?: { id: string; number: string } | null
  linkedAvoir?: { id: string; number: string } | null
  issueDate: string
  issuedAt: string | null
  dueDate: string
  subject: string | null
  clientReference: string | null
  notes: string | null
  paymentConditions: string | null
  currency: string
  globalDiscountType: DiscountType
  globalDiscountValue: number
  globalDiscountAmount: number
  subtotalHt: number
  totalHt: number
  totalTax: number
  totalTtc: number
  amountDue: number
  amountPaid: number
  balanceDue: number
  acomptePercentage: number | null
  totalAcomptesDeducted: number
  escompteRate: number | null
  escompteDeadline: string | null
  escompteAmount: number
  reminderEscalationLevel: number
  lines: InvoiceLineBase[]
  payments?: Payment[]
  statusHistory?: InvoiceStatusHistory[]
  bankAccountId?: string | null
  bankAccount?: InvoiceBankAccount | null
  requiresApproval: boolean
  approvalRequestId?: string | null
  approvalRequest?: { status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired'; currentStep: number; totalSteps: number } | null
  createdAt: string
  updatedAt: string
}

export type InvoiceListItem = Omit<Invoice, 'lines' | 'payments' | 'statusHistory'>

export interface PaginatedInvoices {
  data: InvoiceListItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface PaginatedPayments {
  data: Payment[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ─── API Payloads ──────────────────────────────────────────────

export interface CreateInvoiceLinePayload {
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

export interface CreateInvoicePayload {
  type?: InvoiceType
  clientId: string
  officeId?: string
  assignedToId?: string
  proformaId?: string
  parentInvoiceId?: string
  creditedInvoiceId?: string
  issueDate?: string
  dueDate: string
  subject?: string
  clientReference?: string
  notes?: string
  paymentConditions?: string
  currency?: string
  globalDiscountType?: DiscountType
  globalDiscountValue?: number
  acomptePercentage?: number
  bankAccountId?: string
  escompteRate?: number
  escompteDeadline?: string
  lines: CreateInvoiceLinePayload[]
}

export type UpdateInvoicePayload = Partial<
  Omit<CreateInvoicePayload, 'type' | 'clientId'> & { lines?: CreateInvoiceLinePayload[] }
>

export interface ListInvoicesParams {
  page?: number
  limit?: number
  clientId?: string
  type?: InvoiceType
  status?: InvoiceStatus
  search?: string
  dateFrom?: string
  dateTo?: string
  overdue?: boolean
}

export interface ComputeInvoicePayload {
  clientId: string
  lines: Array<{
    quantity: number
    unitPriceHt: number
    discountType: DiscountType
    discountValue: number
    taxRate: number
    designation: string
  }>
  globalDiscountType: DiscountType
  globalDiscountValue: number
  clientReference?: string
}

export type ComputeWarningType =
  | 'CLIENT_UNPAID_BALANCE'
  | 'UNUSUAL_AMOUNT'
  | 'DUPLICATE_RISK'
  | 'DUPLICATE_CLIENT_REFERENCE'

export interface ComputeWarning {
  code:     ComputeWarningType
  severity: 'info' | 'warning' | 'error'
  message:  string
  data?:    Record<string, unknown>
}

export interface ComputeResult {
  totals: {
    subtotalHt:           number
    globalDiscountAmount: number
    totalHt:              number
    totalTax:             number
    totalTtc:             number
  }
  lines: Array<{
    quantity:       number
    unitPriceHt:    number
    subtotalHt:     number
    discountAmount: number
    netHt:          number
    taxAmount:      number
    totalTtc:       number
  }>
  warnings:    ComputeWarning[]
  hasErrors:   boolean
  hasWarnings: boolean
}

export interface CancelInvoicePayload {
  reason?: string
}

export interface CreateAvoirPayload {
  reason: string
  notes?: string
  lines?: CreateInvoiceLinePayload[]
  dueDate?: string
}

export interface CreatePaymentPayload {
  paymentDate: string
  amount: number
  method: PaymentMethod
  reference?: string
  notes?: string
  bankAccountId?: string
  attachmentPath?: string
  applyEscompte?: boolean
}

export interface BankAccountOption {
  id: string
  name: string
  bankName: string | null
  accountingAccount: string | null
  currency: string
  isActive: boolean
}

export interface ListPaymentsParams {
  page?:       number
  limit?:      number
  invoiceId?:  string
  method?:     PaymentMethod
  dateFrom?:   string
  dateTo?:     string
  reconciled?: boolean
}

// ─── Local form types (source of truth = proformas/types) ──────
// Re-exported so consumers can import from either feature without divergence.
export type { FormLine, DocumentTotals } from '@/features/proformas/types'
