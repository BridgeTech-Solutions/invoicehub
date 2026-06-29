// ─── Accounting feature — types ───────────────────────────────

export type AccountType    = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export type AccountClass   = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type JournalType    = 'purchases' | 'sales' | 'bank' | 'cash' | 'operations' | 'misc' | 'opening' | 'closing'
export type PeriodStatus   = 'open' | 'closed' | 'locked'
export type EntrySource    = 'manual' | 'invoice' | 'payment' | 'expense' | 'purchase_order' | 'extourne' | 'payment_reversal'
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
  id:         string
  yearId:     string
  year:       number
  month:      number
  fiscalYear?: number
  startDate:  string
  endDate:    string
  status:     PeriodStatus
  entryCount: number
  createdAt:  string
}

export interface CreateFiscalYearPayload {
  name:        string
  fiscalYear:  number
  startDate:   string
  endDate:     string
  periodType?: string
}

// ─── Journal ─────────────────────────────────────────────────

export interface AccountingJournal {
  id:               string
  code:             string
  name:             string
  type:             JournalType
  description?:     string | null
  defaultAccountId?: string | null
  defaultAccount?:  { id: string; number: string; name: string } | null
  bankAccountId?:   string | null
  isActive:         boolean
  entriesCount:     number
  createdAt:        string
}

export interface CreateJournalPayload {
  code:             string
  name:             string
  type:             JournalType
  description?:     string
  defaultAccountId?: string | null
  bankAccountId?:   string | null
}

export interface UpdateJournalPayload {
  name?:             string
  type?:             JournalType
  description?:      string
  isActive?:         boolean
  defaultAccountId?: string | null
  bankAccountId?:   string | null
}

// ─── Entry ───────────────────────────────────────────────────

export interface EntryLine {
  id:             string
  accountId:      string
  account:        { id: string; number: string; name: string }
  label:          string
  debit:          number
  credit:         number
  letteringCode:  string | null
  analyticAxis1?: string | null
  analyticAxis2?: string | null
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
  status:         'draft' | 'validated' | 'locked' | 'cancelled'
  sourceId:       string | null
  lines:          EntryLine[]
  attachmentPath: string | null
  createdById:    string
  createdBy:      { id: string; firstName: string; lastName: string }
  createdAt:      string
  updatedAt:      string
}

export interface AccountingEntryListItem {
  id:          string
  number:      string
  journalId:   string
  journal:     { code: string; name: string; type: JournalType }
  date:        string
  label:       string
  source:      string | null
  status:      'draft' | 'validated' | 'locked' | 'cancelled'
  sourceId:    string | null
  totalDebit:  number
  totalCredit: number
  isBalanced:  boolean
  createdAt:   string
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
  status?:    string | ''
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
  id:              string
  declarationType: string
  periodStart:     string
  periodEnd:       string
  fiscalPeriodId:  string | null
  period:          FiscalPeriod | null
  tvaCollected:    number
  tvaDeductible:   number
  tvaCredit:       number
  status:          TaxDeclStatus
  submittedAt:     string | null
  notes:           string | null
  createdAt:       string
  updatedAt:       string
}

export interface TaxDeclarationDetail {
  collected: { rate: number; base: number; amount: number }[]
  deductible:{ rate: number; base: number; amount: number }[]
}

export interface CreateTaxDeclPayload {
  declarationType: string
  periodStart:     string
  periodEnd:       string
  tvaCollected:    number
  tvaDeductible:   number
  tvaCredit?:      number
  fiscalPeriodId?: string
  notes?:          string
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

// ─── États financiers SYSCOHADA (Bilan & Compte de résultat) ──

export interface BilanLineAccount { accountNumber: string; label: string; amount: number }
export interface BilanActifLine  { code: string; label: string; brut: number; amortissements: number; net: number; netN1: number; accounts?: BilanLineAccount[] }
export interface BilanPassifLine { code: string; label: string; net: number; netN1: number; accounts?: BilanLineAccount[] }

export interface BilanActifMasse {
  code: string; label: string; lines: BilanActifLine[]
  totalBrut: number; totalAmort: number; totalNet: number; totalNetN1: number
}
export interface BilanPassifMasse {
  code: string; label: string; lines: BilanPassifLine[]
  totalNet: number; totalNetN1: number
}

export interface Bilan {
  actifMasses:        BilanActifMasse[]
  passifMasses:       BilanPassifMasse[]
  totalActif:         number
  totalActifN1:       number
  totalPassif:        number
  totalPassifN1:      number
  resultatNet:        number
  equilibre:          boolean
  ecart:              number
  comptesNonVentiles: number
}

// ─── Rubriques des états financiers (paramétrage « façon Sage ») ──
export type RubriqueMode = 'debitRaw' | 'creditRaw' | 'debitSign' | 'creditSign'
export interface RubriqueSource { column: 'brut' | 'amort'; prefixes: string[]; mode: RubriqueMode; exclude?: string[] }
export interface StatementRubrique {
  id: string; side: 'actif' | 'passif'
  masseCode: string; masseLabel: string; masseOrder: number
  code: string; label: string; lineOrder: number
  isResult: boolean; sources: RubriqueSource[]
}

export interface SIGLine { code: string; label: string; amount: number; kind: 'produit' | 'charge' | 'solde' }

export interface CompteResultat {
  lines:       SIGLine[]
  resultatNet: number
  coherent:    boolean
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
