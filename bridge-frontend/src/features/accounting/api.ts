// ─── Accounting feature — API ──────────────────────────────────

import type {
  Account, AccountListItem, CreateAccountPayload, UpdateAccountPayload,
  FiscalYear, FiscalPeriod, CreateFiscalYearPayload,
  AccountingJournal, CreateJournalPayload, UpdateJournalPayload,
  AccountingEntry, AccountingEntryListItem, PaginatedEntries, ListEntriesParams, CreateEntryPayload,
  AccountBalance, GeneralLedgerLine,
  LetterableEntryLine, LetteredGroup,
  TaxDeclaration, TaxDeclarationDetail, CreateTaxDeclPayload,
  AccountingStats, ExportConfig, AccountClass,
} from './types'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'

// Prisma retourne accountNumber comme PK (pas id) + accountClass "c4" (pas 4)
// → on normalise pour que le reste du frontend reste stable
function normalizeAccount(a: any) {
  return {
    ...a,
    id:             a.accountNumber,
    number:         a.accountNumber,
    class:          parseInt((a.accountClass ?? 'c0').replace('c', ''), 10) as any,
    normalBalance:  a.accountNature === 'credit_normal' ? 'credit' : 'debit',
    isLeaf:         a.isDetailAccount ?? true,
    openingBalance: 0,
    shortName:      a.shortName ?? null,
    accountNature:  a.accountNature ?? 'debit_normal',
    allowsReconciliation: a.allowsReconciliation ?? false,
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Accounts ─────────────────────────────────────────────────

export const accountingApi = {

  // Chart of accounts
  listAccounts: async (params?: { class?: AccountClass; search?: string; active?: boolean }) => {
    const q = new URLSearchParams()
    if (params?.class)  q.set('class', String(params.class))
    if (params?.search) q.set('search', params.search)
    if (params?.active !== undefined) q.set('active', String(params.active))
    const raw = await req<any[]>(`/accounting/accounts${q.toString() ? `?${q}` : ''}`)
    return raw.map(normalizeAccount) as AccountListItem[]
  },

  getAccount: async (id: string) => {
    const raw = await req<any>(`/accounting/accounts/${id}`)
    return normalizeAccount(raw) as Account
  },

  createAccount: (data: CreateAccountPayload) =>
    req<Account>('/accounting/accounts', { method: 'POST', body: JSON.stringify(data) }),

  updateAccount: (id: string, data: UpdateAccountPayload) =>
    req<Account>(`/accounting/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  toggleAccount: (id: string, isActive: boolean) =>
    req<Account>(`/accounting/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ isActive }) }),

  deleteAccount: (id: string) =>
    req<void>(`/accounting/accounts/${id}`, { method: 'DELETE' }),

  // ─── Fiscal years & periods ─────────────────────────────────

  listFiscalYears: () => req<FiscalYear[]>('/accounting/fiscal-years'),

  createFiscalYear: (data: CreateFiscalYearPayload) =>
    req<FiscalYear>('/accounting/fiscal-years', { method: 'POST', body: JSON.stringify(data) }),

  closePeriod: (id: string) =>
    req<FiscalPeriod>(`/accounting/periods/${id}/close`, { method: 'POST' }),

  reopenPeriod: (id: string) =>
    req<FiscalPeriod>(`/accounting/periods/${id}/reopen`, { method: 'POST' }),

  // ─── Journals ───────────────────────────────────────────────

  listJournals: () => req<AccountingJournal[]>('/accounting/journals'),

  createJournal: (data: CreateJournalPayload) =>
    req<AccountingJournal>('/accounting/journals', { method: 'POST', body: JSON.stringify(data) }),

  updateJournal: (id: string, data: UpdateJournalPayload) =>
    req<AccountingJournal>(`/accounting/journals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  toggleJournal: (id: string, isActive: boolean) =>
    req<AccountingJournal>(`/accounting/journals/${id}`, { method: 'PUT', body: JSON.stringify({ isActive }) }),

  deleteJournal: (id: string) =>
    req<void>(`/accounting/journals/${id}`, { method: 'DELETE' }),

  // ─── Entries ────────────────────────────────────────────────

  listEntries: (params: ListEntriesParams = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return req<PaginatedEntries>(`/accounting/entries?${q}`)
  },

  getEntry: (id: string) => req<AccountingEntry>(`/accounting/entries/${id}`),

  createEntry: (data: CreateEntryPayload) =>
    req<AccountingEntry>('/accounting/entries', { method: 'POST', body: JSON.stringify(data) }),

  cancelEntry: (id: string) =>
    req<AccountingEntry>(`/accounting/entries/${id}/cancel`, { method: 'POST' }),

  // ─── Balance & Grand livre ──────────────────────────────────

  getBalance: (params: { periodId?: string; class?: AccountClass; includeEmpty?: boolean }) => {
    const q = new URLSearchParams()
    if (params.periodId)     q.set('periodId', params.periodId)
    if (params.class)        q.set('class', String(params.class))
    if (params.includeEmpty) q.set('includeEmpty', 'true')
    return req<AccountBalance[]>(`/accounting/reports/balance?${q}`)
  },

  getGeneralLedger: (accountId: string, params: { periodId?: string; dateFrom?: string; dateTo?: string } = {}) => {
    const q = new URLSearchParams({ accountId })
    if (params.periodId) q.set('periodId', params.periodId)
    if (params.dateFrom) q.set('dateFrom', params.dateFrom)
    if (params.dateTo)   q.set('dateTo', params.dateTo)
    return req<GeneralLedgerLine[]>(`/accounting/reports/ledger?${q}`)
  },

  exportSage: (config: ExportConfig) =>
    fetch(`${BASE}/accounting/reports/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}`,
      },
      body: JSON.stringify(config),
    }),

  // ─── Lettering ─────────────────────────────────────────────

  getLetterableLines: (accountId: string, periodId?: string) => {
    const q = new URLSearchParams({ accountId })
    if (periodId) q.set('periodId', periodId)
    return req<{ unlettered: LetterableEntryLine[]; lettered: LetteredGroup[] }>(`/accounting/lettering?${q}`)
  },

  letterLines: (lineIds: string[]) =>
    req<LetteredGroup>('/accounting/lettering', { method: 'POST', body: JSON.stringify({ lineIds }) }),

  unletterGroup: (letterCode: string, accountId: string) =>
    req<void>(`/accounting/lettering/${letterCode}?accountId=${accountId}`, { method: 'DELETE' }),

  // ─── Tax declarations ───────────────────────────────────────

  listTaxDeclarations: (params?: { periodId?: string; status?: string }) => {
    const q = new URLSearchParams()
    if (params?.periodId) q.set('periodId', params.periodId)
    if (params?.status)   q.set('status', params.status)
    return req<TaxDeclaration[]>(`/accounting/tax-declarations${q.toString() ? `?${q}` : ''}`)
  },

  getTaxDeclaration: (id: string) => req<TaxDeclaration & { detail: TaxDeclarationDetail }>(`/accounting/tax-declarations/${id}`),

  createTaxDeclaration: (data: CreateTaxDeclPayload) =>
    req<TaxDeclaration>('/accounting/tax-declarations', { method: 'POST', body: JSON.stringify(data) }),

  submitTaxDeclaration: (id: string) =>
    req<TaxDeclaration>(`/accounting/tax-declarations/${id}/submit`, { method: 'POST' }),

  // ─── Dashboard stats ─────────────────────────────────────────

  getStats: () => req<AccountingStats>('/accounting/stats'),
}
