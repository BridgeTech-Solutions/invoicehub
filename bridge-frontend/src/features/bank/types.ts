// ─── Enums ─────────────────────────────────────────────────────────────────

export type BankAccountType =
  | 'checking'
  | 'savings'
  | 'petty_cash'
  | 'mobile_money'
  | 'term_deposit'

export type TransactionType = 'debit' | 'credit'

export type ReconciliationStatus = 'pending' | 'reconciled' | 'unmatched' | 'ignored'

export type MatchedEntityType = 'payment' | 'supplier_payment' | 'expense'

export type ImportFormat = 'csv' | 'ofx' | 'mt940'

export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export type ReconciliationSessionStatus = 'in_progress' | 'completed' | 'cancelled'

// ─── Bank Account ───────────────────────────────────────────────────────────

export interface BankAccount {
  id:                string
  name:              string
  bankName:          string
  accountType:       BankAccountType
  accountNumber:     string | null
  branchName:        string | null
  iban:              string | null
  swiftBic:          string | null
  currency:          string
  openingBalance:    number
  currentBalance:    number
  isDefault:         boolean
  isActive:          boolean
  accountingAccount: string | null
  color:             string | null
  notes:             string | null
  createdAt:         string
  updatedAt:         string
  _count?:           { transactions: number }
}

export interface CreateBankAccountPayload {
  name:              string
  bankName:          string
  accountType?:      BankAccountType
  accountNumber?:    string | null
  branchName?:       string | null
  iban?:             string | null
  swiftBic?:         string | null
  currency?:         string
  openingBalance?:   number
  isDefault?:        boolean
  accountingAccount?: string | null
  color?:            string | null
  notes?:            string | null
}

export type UpdateBankAccountPayload = Partial<CreateBankAccountPayload>

// ─── Bank Transaction ───────────────────────────────────────────────────────

export interface BankTransaction {
  id:                   string
  bankAccountId:        string
  bankAccount?:         Pick<BankAccount, 'id' | 'name' | 'color' | 'currency'>
  transactionDate:      string
  valueDate:            string | null
  label:                string
  reference:            string | null
  amount:               number
  type:                 TransactionType
  balanceAfter:         number | null
  reconciliationStatus: ReconciliationStatus
  matchedEntityType:    MatchedEntityType | null
  matchedEntityId:      string | null
  matchedAt:            string | null
  matchedEntity?:       MatchedEntitySnippet | null
  importId:             string | null
  category:             string | null
  notes:                string | null
  createdAt:            string
}

export interface MatchedEntitySnippet {
  id:        string
  reference: string
  label:     string
  amount:    number
}

export interface CreateTransactionPayload {
  bankAccountId:   string
  transactionDate: string
  label:           string
  amount:          number
  type:            TransactionType
  reference?:      string | null
  category?:       string | null
  notes?:          string | null
}

export interface ReconcilePayload {
  matchedEntityType: MatchedEntityType
  matchedEntityId:   string
}

export interface ListTransactionsParams {
  page?:       number
  limit?:      number
  accountId?:  string
  type?:       TransactionType
  dateFrom?:   string
  dateTo?:     string
  reconciled?: boolean
  search?:     string
}

export interface PaginatedTransactions {
  data:  BankTransaction[]
  meta:  { total: number; page: number; limit: number; totalPages: number }
}

// ─── Matching Suggestions ───────────────────────────────────────────────────

export interface MatchingSuggestion {
  entityType:   MatchedEntityType
  entityId:     string
  reference:    string
  label:        string
  amount:       number
  date:         string
  score:        number          // 0–100
  scoreDetails: {
    amount:    number
    date:      number
    label:     number
    reference: number
  }
}

export interface SubsetMatch {
  ids:    string[]
  total:  number
  labels: string[]
}

// ─── Bank Statement Import ──────────────────────────────────────────────────

export interface BankStatementImport {
  id:               string
  bankAccountId:    string
  bankAccount?:     Pick<BankAccount, 'id' | 'name'>
  filename:         string
  fileFormat:       ImportFormat | null
  periodStart:      string | null
  periodEnd:        string | null
  nbTransactions:   number | null
  status:           ImportStatus
  errorMessage:     string | null
  jobId:            string | null
  importedAt:       string | null
  importedBy:       { id: string; firstName: string; lastName: string } | null
  createdAt:        string
}

// ─── Import Profiles ────────────────────────────────────────────────────────

export type ColumnRole =
  | 'date' | 'label' | 'debit' | 'credit' | 'amount'
  | 'direction' | 'reference' | 'balance' | 'valueDate' | 'ignore'

export interface ColumnMapping {
  date:         string
  label:        string
  debit?:       string
  credit?:      string
  amount?:      string
  direction?:   string
  reference?:   string
  balanceAfter?: string
  valueDate?:   string
}

export interface NumberFormat {
  thousands: string
  decimal:   string
}

export interface ProfileCandidate {
  profileId: string | null
  name:      string
  source:    string
  score:     number
}

export interface BankImportProfile {
  id:                  string
  name:                string
  bankName:            string | null
  country:             string
  source:              'system' | 'user' | 'estimated' | 'community' | 'verified'
  fileFormat:          ImportFormat
  encoding:            string
  delimiter:           string
  dateFormat:          string
  numberFormat:        NumberFormat
  columnMapping:       ColumnMapping
  directionValues:     { debit: string[]; credit: string[] } | null
  amountSign:          string | null
  skipRowsContaining:  string[] | null
  skipFirstRows:       number
  isPublic:            boolean
  usageCount:          number
  lastUsedAt:          string | null
  notes:               string | null
  createdBy?:          { id: string; firstName: string; lastName: string } | null
  createdAt:           string
  updatedAt:           string
}

export interface CreateImportProfilePayload {
  name:                string
  bankName?:           string
  country?:            string
  fileFormat?:         ImportFormat
  encoding?:           string
  delimiter?:          string
  dateFormat?:         string
  numberFormat:        NumberFormat
  columnMapping:       ColumnMapping
  directionValues?:    { debit: string[]; credit: string[] }
  amountSign?:         string
  skipRowsContaining?: string[]
  skipFirstRows?:      number
  isPublic?:           boolean
  notes?:              string
}

export type UpdateImportProfilePayload = Partial<CreateImportProfilePayload>

export interface DetectFormatResult {
  importId:          string
  format:            ImportFormat
  detectedBank:      string | null
  confidence:        'high' | 'medium' | 'low'
  confidenceScore:   number
  needsMapping:      boolean
  totalRows:         number
  encoding:          string
  periodStart:       string | null
  periodEnd:         string | null
  warnings:          string[]
  /** Noms bruts des colonnes CSV (null pour OFX/MT940) */
  headers:           string[] | null
  /** Premières 3 lignes de données brutes */
  sampleRows:        string[][] | null
  /** Mapping détecté complet (pour pré-remplir le mapper) */
  detectedMapping:   {
    columnMapping:   ColumnMapping
    dateFormat:      string
    numberFormat:    NumberFormat
    delimiter:       string
    encoding:        string
    amountSign?:     string
    directionValues?: { debit: string[]; credit: string[] }
    skipRowsContaining?: string[]
    profileId:       string | null
    profileName:     string
    headerRow:       number
  } | null
  profileCandidates: ProfileCandidate[]
}

export interface ImportPreviewRow {
  date:      string
  label:     string
  debit:     number | null
  credit:    number | null
  balance:   number | null
  reference: string | null
}

export interface ImportPreviewResult {
  importId:     string
  rows:         ImportPreviewRow[]
  totalRows:    number
  skippedRows:  number
  duplicates:   number
  parseErrors?: Array<{ row: number; message: string }>
  periodStart:  string | null
  periodEnd:    string | null
  format:       ImportFormat
  detectedBank: string | null
}

export interface ImportStatusResult {
  importId:     string
  status:       ImportStatus
  progress:     number          // 0–100
  importedRows: number
  totalRows:    number
  errorMessage: string | null
}

// ─── Bank Reconciliation ────────────────────────────────────────────────────

export interface BankReconciliation {
  id:                    string
  bankAccountId:         string
  bankAccount?:          Pick<BankAccount, 'id' | 'name' | 'currency'>
  periodStart:           string
  periodEnd:             string
  openingBalance:          number
  closingBalanceStatement: number
  closingBalanceSystem:    number
  status:                  ReconciliationSessionStatus
  notes:                 string | null
  completedAt:           string | null
  createdAt:             string
  createdBy?:            { id: string; firstName: string; lastName: string } | null
  completedBy?:          { id: string; firstName: string; lastName: string } | null
}

export interface OpenReconciliationPayload {
  bankAccountId:  string
  periodStart:    string
  periodEnd:      string
  openingBalance: number
  notes?:         string | null
}

export interface AutoMatchResult {
  applied: number
  high:    Array<{ txId: string; entityType: string; entityId: string; score: number }>
  medium:  Array<{ txId: string; entityType: string; entityId: string; score: number }>
}

export interface PaginatedReconciliations {
  data: BankReconciliation[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface ListReconciliationsParams {
  page?:      number
  limit?:     number
  accountId?: string
}

// ─── Bank Matching Rule ─────────────────────────────────────────────────────

export interface BankMatchingRule {
  id:             string
  bankAccountId:  string | null
  bankAccount?:   Pick<BankAccount, 'id' | 'name'> | null
  labelContains:  string
  entityType:     MatchedEntityType
  entityId:       string | null
  entityLabel:    string | null
  amountMin:      number | null
  amountMax:      number | null
  confidence:     number          // 0–100
  autoApply:      boolean
  isActive:       boolean
  usageCount?:    number
  notes:          string | null
  createdAt:      string
  createdBy?:     { id: string; firstName: string; lastName: string } | null
}

export interface CreateMatchingRulePayload {
  bankAccountId?: string | null
  labelContains:  string
  entityType:     MatchedEntityType
  entityId?:      string | null
  amountMin?:     number | null
  amountMax?:     number | null
  autoApply?:     boolean
  notes?:         string | null
}

export type UpdateMatchingRulePayload = Partial<CreateMatchingRulePayload & { isActive: boolean }>

// ─── Bank Summary ───────────────────────────────────────────────────────────

export interface BankSummary {
  totalBalance:        number
  accountsCount:       number
  unreconciledCount:   number
  openReconciliations: number
  importsThisMonth:    number
  accounts: Array<{
    id:             string
    name:           string
    bankName:       string
    currentBalance: number
    currency:       string
    color:          string | null
    pendingCount:   number
  }>
}
