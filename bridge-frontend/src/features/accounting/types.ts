// ─── Accounting feature — types ───────────────────────────────

export type AccountType    = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export type AccountClass   = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type JournalType    = 'purchases' | 'sales' | 'bank' | 'cash' | 'operations'
export type PeriodStatus   = 'open' | 'current' | 'closed' | 'archived'
export type EntrySource    = 'manual' | 'invoice' | 'payment' | 'expense' | 'purchase_order'
export type TaxDeclStatus  = 'draft' | 'submitted' | 'validated' | 'to_pay'

// ─── Account (Plan comptable) ─────────────────────────────────

export interface Account {
  id:             string
  number:         string
  name:           string
  type:           AccountType
  normalBalance:  'debit' | 'credit'
  class:          AccountClass
  parentId:       string | null
  parent:         { id: string; number: string; name: string } | null
  children?:      Account[]
  isLeaf:         boolean
  isActive:       boolean
  openingBalance: number
  createdAt:      string
}

export type AccountNature = 'debit_normal' | 'credit_normal'

export interface AccountListItem {
  id:                   string
  number:               string
  name:                 string
  shortName:            string | null
  type:                 AccountType
  accountNature:        AccountNature
  normalBalance:        'debit' | 'credit'
  class:                AccountClass
  parentId:             string | null
  isLeaf:               boolean
  isDetailAccount:      boolean
  isActive:             boolean
  allowsReconciliation: boolean
  openingBalance:       number
}

export interface CreateAccountPayload {
  accountNumber:        string
  name:                 string
  shortName?:           string
  parentAccountNumber?: string
  accountNature?:       AccountNature
  isDetailAccount?:     boolean
  allowsReconciliation?: boolean
  description?:         string
  notes?:               string
}

export interface UpdateAccountPayload {
  name?:                string
  shortName?:           string
  accountNature?:       AccountNature
  isDetailAccount?:     boolean
  allowsReconciliation?: boolean
  description?:         string
  notes?:               string
  isActive?:            boolean
}

// ─── Fiscal Period ────────────────────────────────────────────

export interface FiscalYear {
  id:        string
  year:      number
  startDate: string
  endDate:   string
  status:    PeriodStatus
  periods:   FiscalPeriod[]
  createdAt: string
}

export interface FiscalPeriod {
  id:        string
  yearId:    string
  year:      number
  month:     number
  startDate: string
  endDate:   string
  status:    PeriodStatus
  createdAt: string
}

export interface CreateFiscalYearPayload {
  year:      number
  startDate: string
  endDate:   string
}

// ─── Journal ─────────────────────────────────────────────────

export interface AccountingJournal {
  id:               string
  code:             string
  name:             string
  type:             JournalType
  defaultAccountId: string | null
  defaultAccount:   { id: string; number: string; name: string } | null
  isActive:         boolean
  entriesCount:     number
  createdAt:        string
}

export interface CreateJournalPayload {
  code:              string
  name:              string
  type:              JournalType
  defaultAccountId?: string
}

export type UpdateJournalPayload = Partial<CreateJournalPayload>

// ─── Entry ───────────────────────────────────────────────────

export interface EntryLine {
  id:         string
  accountId:  string
  account:    { id: string; number: string; name: string }
  label:      string
  debit:      number
  credit:     number
  letterCode: string | null
}

export interface AccountingEntry {
  id:             string
  number:         string
  journalId:      string
  journal:        { id: string; code: string; name: string; type: JournalType }
  periodId:       string
  period:         { id: string; month: number; year: number }
  date:           string
  label:          string
  source:         EntrySource
  sourceId:       string | null
  lines:          EntryLine[]
  attachmentPath: string | null
  createdById:    string
  createdBy:      { id: string; firstName: string; lastName: string }
  createdAt:      string
  updatedAt:      string
}

export interface AccountingEntryListItem {
  id:         string
  number:     string
  journalId:  string
  journal:    { code: string; name: string; type: JournalType }
  date:       string
  label:      string
  source:     EntrySource
  sourceId:   string | null
  totalDebit: number
  totalCredit:number
  isBalanced: boolean
  createdAt:  string
}

export interface PaginatedEntries {
  data:       AccountingEntryListItem[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface ListEntriesParams {
  page?:      number
  limit?:     number
  journalId?: string
  periodId?:  string
  accountId?: string
  source?:    EntrySource | ''
  dateFrom?:  string
  dateTo?:    string
  search?:    string
}

export interface FormEntryLine {
  accountId:   string
  accountNum:  string
  accountName: string
  label:       string
  debit:       number
  credit:      number
}

export interface CreateEntryPayload {
  journalId:       string
  entryDate:       string
  label:           string
  lines:           { accountNumber: string; label: string; debit: number; credit: number }[]
  attachmentPath?: string
}

// ─── Balance / Grand livre ────────────────────────────────────

export interface AccountBalance {
  accountId:   string
  account:     AccountListItem
  debitTotal:  number
  creditTotal: number
  balance:     number
}

export interface GeneralLedgerLine {
  entryId:    string
  entryNum:   string
  journalCode:string
  date:        string
  label:       string
  debit:       number
  credit:      number
  runningBal:  number
  letterCode:  string | null
}

// ─── Lettering ───────────────────────────────────────────────

export interface LetterableEntryLine {
  id:          string
  entryId:     string
  entryNumber: string
  journalCode: string
  date:        string
  label:       string
  debit:       number
  credit:      number
  letterCode:  string | null
}

export interface LetteredGroup {
  letterCode:  string
  lines:       LetterableEntryLine[]
  totalDebit:  number
  totalCredit: number
  balance:     number
  letteredAt:  string
}

// ─── Tax Declaration ─────────────────────────────────────────

export interface TaxDeclaration {
  id:             string
  periodId:       string
  period:         FiscalPeriod
  vatCollected:   number
  vatDeductible:  number
  vatNet:         number
  status:         TaxDeclStatus
  submittedAt:    string | null
  notes:          string | null
  createdAt:      string
  updatedAt:      string
}

export interface TaxDeclarationDetail {
  collected: { rate: number; base: number; amount: number }[]
  deductible:{ rate: number; base: number; amount: number }[]
}

export interface CreateTaxDeclPayload {
  periodId:  string
  notes?:    string
}

// ─── Dashboard stats ─────────────────────────────────────────

export interface AccountingStats {
  revenueMonth:   number
  expensesMonth:  number
  netResult:      number
  vatDue:         number
  trend: {
    month:    string
    revenue:  number
    expenses: number
  }[]
}

// ─── Export ──────────────────────────────────────────────────

export type ExportFormat = 'sage100' | 'csv' | 'fec'

export interface ExportConfig {
  dateFrom:   string
  dateTo:     string
  journals:   string[]
  format:     ExportFormat
  encoding:   'utf-8' | 'latin-1'
}
