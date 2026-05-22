// ─── Expenses feature — types ─────────────────────────────────

export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected'
export type ExpensePaymentMethod = 'cash' | 'bank_transfer' | 'mobile_money' | 'card' | 'check'

export interface ExpenseCategory {
  id:                string
  name:              string
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
  notes:             string | null
  isRecurring:       boolean
  submittedById:     string
  submittedBy:       ExpenseUser
  approvedById:      string | null
  approvedBy:        ExpenseUser | null
  approvedAt:        string | null
  paidAt:            string | null
  rejectionReason:   string | null
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
  page?:        number
  limit?:       number
  search?:      string
  status?:      ExpenseStatus | ''
  categoryId?:  string
  dateFrom?:    string
  dateTo?:      string
  isRecurring?: boolean
}

export interface CreateExpensePayload {
  designation:        string
  description?:       string
  categoryId?:        string
  supplierId?:        string
  supplierName?:      string
  expenseDate:        string
  paymentMethod:      ExpensePaymentMethod
  amountHt:           number
  taxRate?:           number
  accountingAccount?: string
  analyticalAxis?:    string
  notes?:             string
  isRecurring?:       boolean
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
  id:          string
  year:        number
  categoryId:  string | null
  category:    { id: string; name: string; color: string | null } | null
  label:       string
  amount:      number
  spent:       number
  remaining:   number
  percentUsed: number
  period:      'annual' | 'monthly'
  createdAt:   string
}

export interface CreateBudgetPayload {
  year:         number
  categoryId?:  string
  label:        string
  amount:       number
  period?:      'annual' | 'monthly'
}
