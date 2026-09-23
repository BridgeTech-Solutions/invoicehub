// ─── Expenses feature — types ─────────────────────────────────

export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected' | 'cancelled'
export type ExpensePaymentMethod = 'cash' | 'bank_transfer' | 'mobile_money' | 'card' | 'check' | 'other'
export type ExpenseFrequency = 'once' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

export interface ExpenseCategory {
  id:                string
  name:              string
  description:       string | null
  color:             string | null
  icon:              string | null
  accountingAccount: string | null
  parentId:          string | null
  parent:            { id: string; name: string } | null
  isActive:          boolean
  sortOrder:         number
  _count?: { expenses: number }
  createdAt:         string
}

export interface ExpenseUser {
  id:        string
  firstName: string
  lastName:  string
}

/** Justificatif : `path` est une route API relative à passer à l'apiClient authentifié. */
export interface ExpenseAttachment {
  filename: string
  path:     string
}

export interface Expense {
  id:                string
  designation:       string
  description:       string | null
  status:            ExpenseStatus
  categoryId:        string | null
  category:          ExpenseCategory | null
  supplierId:        string | null
  supplierName:      string | null
  expenseDate:       string
  paymentMethod:     ExpensePaymentMethod
  amountHt:          number
  taxRate:           number
  taxAmount:         number
  amountTtc:         number
  accountingAccount: string | null
  analyticalAxis:    string | null
  attachmentPath:    string | null
  attachments:       ExpenseAttachment[]
  notes:             string | null
  isRecurring:       boolean
  frequency:         ExpenseFrequency | null
  nextOccurrenceDate: string | null
  endDate:           string | null
  isEmployeeExpense: boolean
  reimbursedAt:      string | null
  reimbursementReference: string | null
  submittedById:     string
  submittedBy:       ExpenseUser
  approvedById:      string | null
  approvedBy:        ExpenseUser | null
  approvedAt:        string | null
  paidAt:            string | null
  rejectionReason:   string | null
  // Workflow d'approbation
  requiresApproval:  boolean
  approvalRequestId: string | null
  approvalRequest:   { status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired'; currentStep: number; totalSteps: number } | null
  /** Calculé (brouillon) : true si la soumission déclenchera une demande d'approbation. */
  willRequireApproval?: boolean
  createdAt:         string
  updatedAt:         string
}

export interface ExpenseListItem {
  id:             string
  designation:    string
  status:         ExpenseStatus
  categoryId:     string | null
  category:       { id: string; name: string; color: string | null } | null
  supplierName:   string | null
  expenseDate:    string
  paymentMethod:  ExpensePaymentMethod
  amountTtc:      number
  attachmentPath: string | null
  isRecurring:    boolean
  submittedBy:    ExpenseUser
  createdAt:      string
}

export interface PaginatedExpenses {
  data:       ExpenseListItem[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface ListExpensesParams {
  page?:              number
  limit?:             number
  search?:            string
  status?:            ExpenseStatus | ''
  categoryId?:        string
  officeId?:          string
  dateFrom?:          string
  dateTo?:            string
  isRecurring?:       boolean
  isEmployeeExpense?: boolean
}

export interface CreateExpensePayload {
  designation:        string
  description?:       string
  categoryId?:        string
  officeId?:          string
  supplierId?:        string
  supplierName?:      string
  expenseDate:        string
  paymentMethod:      ExpensePaymentMethod
  bankAccountId?:     string
  amountHt:           number
  taxRate?:           number
  currency?:          string
  accountingAccount?: string
  analyticalAxis?:    string
  isEmployeeExpense?: boolean
  notes?:             string
  isRecurring?:       boolean
  frequency?:         ExpenseFrequency
  endDate?:           string
}

export type UpdateExpensePayload = Partial<CreateExpensePayload>

export interface ExpenseStats {
  currentMonth:   number
  currentQuarter: number
  pendingCount:   number
  pendingAmount:  number
  recurringMonthly: number
}

export interface ExpenseBudget {
  id:            string
  year:          number
  accountNumber: string | null
  accountName:   string | null
  kind:          'charge' | 'revenue' | 'other'
  status:        'draft' | 'active'
  categoryId:    string | null
  category:      { id: string; name: string; color: string | null } | null
  officeId:      string | null
  officeName:    string | null
  quarter:       number | null
  month:         number | null
  label:         string
  amount:        number
  realized:      number
  engaged:       number
  available:     number
  consumed:      number
  spent:         number   // = realized (rétro-compat)
  remaining:     number   // = available
  percentUsed:   number
  period:        'annual' | 'quarterly' | 'monthly'
  createdAt:     string
}

export interface BudgetSummaryLine extends ExpenseBudget {
  forecast:    number | null
  forecastPct: number
  variance:    number
}
export interface BudgetTotals {
  count: number; budget: number; realized: number; engaged: number; available: number
}
export interface BudgetSummary {
  year:   number
  lines:  BudgetSummaryLine[]
  totals: { charge: BudgetTotals; revenue: BudgetTotals }
}

export interface CreateBudgetPayload {
  year:          number
  accountNumber?: string
  categoryId?:   string
  officeId?:     string
  period?:       'annual' | 'quarterly' | 'monthly'
  quarter?:      number
  month?:        number
  label?:        string
  amount:        number
  notes?:        string
}
