// ─── Accounting feature — API ──────────────────────────────────

import apiClient from '@/lib/api-client'
import type {
  Account, AccountListItem, CreateAccountPayload, UpdateAccountPayload,
  FiscalYear, FiscalPeriod, CreateFiscalYearPayload,
  AccountingJournal, CreateJournalPayload, UpdateJournalPayload,
  AccountingEntry, AccountingEntryListItem, PaginatedEntries, ListEntriesParams, CreateEntryPayload,
  AccountBalance, GeneralLedgerLine,
  LetterableEntryLine, LetteredGroup,
  TaxDeclaration, TaxDeclarationDetail, CreateTaxDeclPayload,
  AccountingStats, ExportConfig, AccountClass,
  Bilan, CompteResultat,
} from './types'

// ── Normalizers ──────────────────────────────────────────────────

function accountTypeFromClass(cls: number): string {
  if (cls === 1) return 'equity'
  if (cls === 2 || cls === 3 || cls === 5) return 'asset'
  if (cls === 4) return 'liability'
  if (cls === 6) return 'expense'
  if (cls === 7) return 'revenue'
  return 'asset'
}

function normalizeAccount(a: any): AccountListItem {
  const cls = parseInt((a.accountClass ?? 'c0').replace('c', ''), 10)
  return {
    ...a,
    id:                   a.accountNumber,
    number:               a.accountNumber,
    class:                cls as any,
    type:                 accountTypeFromClass(cls) as any,
    normalBalance:        a.accountNature === 'credit_normal' ? 'credit' : 'debit',
    isLeaf:               a.isDetailAccount ?? true,
    openingBalance:       0,
    shortName:            a.shortName ?? null,
    accountNature:        a.accountNature ?? 'debit_normal',
    allowsReconciliation: a.allowsReconciliation ?? false,
    parentId:             a.parentAccountNumber ?? null,
    isActive:             a.isActive ?? true,
    isDetailAccount:      a.isDetailAccount ?? true,
  }
}

function normalizeJournal(j: any): AccountingJournal {
  return {
    id:           j.id,
    code:         j.code,
    name:         j.name,
    type:         j.type,
    description:  j.description ?? null,
    isActive:     j.isActive,
    entriesCount: j._count?.journalEntries ?? 0,
    createdAt:    typeof j.createdAt === 'string' ? j.createdAt : new Date(j.createdAt).toISOString(),
  }
}

function normalizeEntryListItem(e: any): AccountingEntryListItem {
  return {
    id:          e.id,
    number:      e.entryNumber,
    journalId:   e.journalId,
    journal:     e.journal,
    date:        typeof e.entryDate === 'string'
      ? e.entryDate.split('T')[0]
      : new Date(e.entryDate).toISOString().split('T')[0],
    label:       e.label,
    source:      e.sourceType ?? null,
    status:      e.status,
    sourceId:    e.sourceId ?? null,
    totalDebit:  Number(e.totalDebit),
    totalCredit: Number(e.totalCredit),
    isBalanced:  Math.abs(Number(e.totalDebit) - Number(e.totalCredit)) < 0.01,
    createdAt:   typeof e.createdAt === 'string' ? e.createdAt : new Date(e.createdAt).toISOString(),
  }
}

// ── API ──────────────────────────────────────────────────────────

export const accountingApi = {

  // ─── Chart of accounts ──────────────────────────────────────

  listAccounts: async (params?: { class?: AccountClass; search?: string; active?: boolean }): Promise<AccountListItem[]> => {
    const q = new URLSearchParams()
    if (params?.class  !== undefined) q.set('class', String(params.class))
    if (params?.search)               q.set('search', params.search)
    if (params?.active !== undefined) q.set('active', String(params.active))
    const raw = await apiClient.get<any[]>(`/accounting/accounts${q.toString() ? `?${q}` : ''}`).then(r => r.data)
    return raw.map(normalizeAccount)
  },

  getAccount: async (id: string): Promise<Account> => {
    const raw = await apiClient.get<any>(`/accounting/accounts/${id}`).then(r => r.data)
    return normalizeAccount(raw) as unknown as Account
  },

  createAccount: (data: CreateAccountPayload) =>
    apiClient.post<Account>('/accounting/accounts', data).then(r => r.data),

  updateAccount: (id: string, data: UpdateAccountPayload) =>
    apiClient.put<Account>(`/accounting/accounts/${id}`, data).then(r => r.data),

  toggleAccount: (id: string, isActive: boolean) =>
    apiClient.put<Account>(`/accounting/accounts/${id}`, { isActive }).then(r => r.data),

  deleteAccount: (id: string) =>
    apiClient.delete<void>(`/accounting/accounts/${id}`).then(r => r.data),

  // ─── Fiscal years & periods ─────────────────────────────────

  listFiscalYears: async (): Promise<FiscalYear[]> => {
    const raw = await apiClient.get<any[]>('/accounting/fiscal-years').then(r => r.data)
    const yearMap = new Map<number, FiscalPeriod[]>()
    for (const p of raw) {
      const yr = p.fiscalYear as number
      if (!yearMap.has(yr)) yearMap.set(yr, [])
      const month = new Date(p.startDate).getUTCMonth() + 1
      const period: FiscalPeriod = {
        id:         p.id,
        yearId:     String(yr),
        year:       yr,
        month,
        fiscalYear: yr,
        startDate:  typeof p.startDate === 'string' ? p.startDate.split('T')[0] : new Date(p.startDate).toISOString().split('T')[0],
        endDate:    typeof p.endDate   === 'string' ? p.endDate.split('T')[0]   : new Date(p.endDate).toISOString().split('T')[0],
        status:     p.status,
        createdAt:  typeof p.createdAt === 'string' ? p.createdAt : new Date(p.createdAt).toISOString(),
      }
      yearMap.get(yr)!.push(period)
    }
    return Array.from(yearMap.entries())
      .sort(([a], [b]) => b - a)
      .map(([yr, periods]) => ({
        id:        String(yr),
        year:      yr,
        startDate: periods[0]?.startDate ?? '',
        endDate:   periods[periods.length - 1]?.endDate ?? '',
        status:    (periods.some(p => p.status === 'open') ? 'open'
          : periods.some(p => p.status === 'closed') ? 'closed' : 'locked') as any,
        periods,
        createdAt: periods[0]?.createdAt ?? '',
      }))
  },

  createFiscalYear: (data: CreateFiscalYearPayload) =>
    apiClient.post<FiscalPeriod>('/accounting/fiscal-years', data).then(r => r.data),

  closePeriod: (id: string) =>
    apiClient.post<FiscalPeriod>(`/accounting/periods/${id}/close`).then(r => r.data),

  reopenPeriod: (id: string) =>
    apiClient.post<FiscalPeriod>(`/accounting/periods/${id}/reopen`).then(r => r.data),

  // ─── Journals ───────────────────────────────────────────────

  listJournals: async (): Promise<AccountingJournal[]> => {
    const raw = await apiClient.get<any[]>('/accounting/journals').then(r => r.data)
    return raw.map(normalizeJournal)
  },

  createJournal: async (data: CreateJournalPayload): Promise<AccountingJournal> => {
    const raw = await apiClient.post<any>('/accounting/journals', data).then(r => r.data)
    return normalizeJournal(raw)
  },

  updateJournal: async (id: string, data: UpdateJournalPayload): Promise<AccountingJournal> => {
    const raw = await apiClient.put<any>(`/accounting/journals/${id}`, data).then(r => r.data)
    return normalizeJournal(raw)
  },

  toggleJournal: (id: string, isActive: boolean) =>
    apiClient.put<AccountingJournal>(`/accounting/journals/${id}`, { isActive }).then(r => r.data),

  deleteJournal: (id: string) =>
    apiClient.delete<void>(`/accounting/journals/${id}`).then(r => r.data),

  // ─── Entries ────────────────────────────────────────────────

  listEntries: async (params: ListEntriesParams = {}): Promise<PaginatedEntries> => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    const res = await apiClient.get<{ data: any[]; total: number; page: number; limit: number; totalPages: number }>(
      `/accounting/entries?${q}`
    ).then(r => r.data)
    return {
      data:       res.data.map(normalizeEntryListItem),
      total:      res.total,
      page:       res.page,
      limit:      res.limit,
      totalPages: res.totalPages,
    }
  },

  getEntry: (id: string) =>
    apiClient.get<AccountingEntry>(`/accounting/entries/${id}`).then(r => r.data),

  createEntry: (data: CreateEntryPayload) =>
    apiClient.post<AccountingEntry>('/accounting/entries', data).then(r => r.data),

  validateEntry: (id: string) =>
    apiClient.post<AccountingEntry>(`/accounting/entries/${id}/validate`).then(r => r.data),

  validateEntriesBulk: (ids: string[]) =>
    apiClient.post<{ validated: number; skipped: { id: string; reason: string }[] }>(
      '/accounting/entries/validate-bulk', { ids },
    ).then(r => r.data),

  validateAllDraft: (filters: { periodId?: string; journalId?: string; dateFrom?: string; dateTo?: string }) =>
    apiClient.post<{ validated: number; skippedUnbalanced: number; totalDraft: number }>(
      '/accounting/entries/validate-all', filters,
    ).then(r => r.data),

  getPendingValidation: (periodId?: string) =>
    apiClient.get<{ count: number; amount: number }>(
      `/accounting/entries-pending${periodId ? `?periodId=${periodId}` : ''}`,
    ).then(r => r.data),

  cancelEntry: (id: string) =>
    apiClient.post<AccountingEntry>(`/accounting/entries/${id}/cancel`).then(r => r.data),

  reverseEntry: (id: string) =>
    apiClient.post<AccountingEntry>(`/accounting/entries/${id}/reverse`).then(r => r.data),

  // ─── Balance & Grand livre ──────────────────────────────────

  getBalance: async (params: { periodId?: string; class?: AccountClass; includeEmpty?: boolean }): Promise<AccountBalance[]> => {
    const q = new URLSearchParams()
    if (params.periodId)     q.set('periodId', params.periodId)
    if (params.class)        q.set('class',    String(params.class))
    if (params.includeEmpty) q.set('includeEmpty', 'true')
    const raw = await apiClient.get<any[]>(`/accounting/reports/balance?${q}`).then(r => r.data)
    return raw.map((b: any) => ({
      accountId:   b.accountNumber,
      account:     b.account ? normalizeAccount(b.account) : null as any,
      debitTotal:  b.totalDebit,
      creditTotal: b.totalCredit,
      balance:     b.balance,
    }))
  },

  getGeneralLedger: async (
    accountId: string,
    params: { periodId?: string; dateFrom?: string; dateTo?: string } = {}
  ): Promise<GeneralLedgerLine[]> => {
    // Le backend pagine le grand livre (limit par défaut 50). On récupère TOUTES
    // les pages : sinon un compte à plus de 50 mouvements aurait un grand livre
    // tronqué et un solde progressif/total faux.
    const PAGE = 500
    const buildQ = (page: number) => {
      const q = new URLSearchParams({ accountNumber: accountId, page: String(page), limit: String(PAGE) })
      if (params.periodId) q.set('periodId', params.periodId)
      if (params.dateFrom) q.set('dateFrom', params.dateFrom)
      if (params.dateTo)   q.set('dateTo',   params.dateTo)
      return q
    }
    const first = await apiClient.get<any>(`/accounting/reports/ledger?${buildQ(1)}`).then(r => r.data)
    const lines: any[] = first.lines ?? first ?? []
    const total: number = Number(first.total ?? lines.length)
    const pages = Math.max(1, Math.ceil(total / PAGE))
    for (let p = 2; p <= pages; p++) {
      const more = await apiClient.get<any>(`/accounting/reports/ledger?${buildQ(p)}`).then(r => r.data)
      lines.push(...(more.lines ?? []))
    }
    let running = 0
    return lines.map((l: any) => {
      running += Number(l.debit) - Number(l.credit)
      return {
        entryId:     l.journalEntryId ?? l.id,
        entryNum:    l.journalEntry?.entryNumber ?? '',
        journalCode: l.journalEntry?.journal?.code ?? '',
        date:        l.journalEntry?.entryDate
          ? (typeof l.journalEntry.entryDate === 'string'
              ? l.journalEntry.entryDate.split('T')[0]
              : new Date(l.journalEntry.entryDate).toISOString().split('T')[0])
          : '',
        label:      l.label,
        debit:      Number(l.debit),
        credit:     Number(l.credit),
        runningBal: running,
        letterCode: l.letteringCode ?? null,
      } as GeneralLedgerLine
    })
  },

  exportSage: (config: ExportConfig) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('bts_access_token') : ''
    const base  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api'
    return fetch(`${base}/accounting/reports/export`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${token ?? ''}`,
      },
      body: JSON.stringify(config),
    })
  },

  // ─── Lettering ─────────────────────────────────────────────

  getLetterableLines: (accountId: string, periodId?: string) => {
    const q = new URLSearchParams({ accountId })
    if (periodId) q.set('periodId', periodId)
    return apiClient.get<{ unlettered: LetterableEntryLine[]; lettered: LetteredGroup[] }>(`/accounting/lettering?${q}`).then(r => r.data)
  },

  letterLines: (lineIds: string[], accountNumber?: string) =>
    apiClient.post<void>('/accounting/lettering', { lineIds, ...(accountNumber ? { accountNumber } : {}) }).then(r => r.data),

  unletterGroup: (letterCode: string, accountNumber: string) =>
    apiClient.delete<void>(`/accounting/lettering/${letterCode}?accountNumber=${encodeURIComponent(accountNumber)}`).then(r => r.data),

  // ─── Tax declarations ───────────────────────────────────────

  listTaxDeclarations: async (params?: { periodId?: string; status?: string }): Promise<TaxDeclaration[]> => {
    const q = new URLSearchParams()
    if (params?.periodId) q.set('periodId', params.periodId)
    if (params?.status)   q.set('type',     params.status)
    const res = await apiClient.get<{ data: TaxDeclaration[] }>(
      `/accounting/tax-declarations${q.toString() ? `?${q}` : ''}`
    ).then(r => r.data)
    return res.data
  },

  getTaxDeclaration: (id: string) =>
    apiClient.get<TaxDeclaration & { detail: TaxDeclarationDetail }>(`/accounting/tax-declarations/${id}`).then(r => r.data),

  createTaxDeclaration: (data: CreateTaxDeclPayload) =>
    apiClient.post<TaxDeclaration>('/accounting/tax-declarations', data).then(r => r.data),

  submitTaxDeclaration: (id: string) =>
    apiClient.post<TaxDeclaration>(`/accounting/tax-declarations/${id}/submit`).then(r => r.data),

  // ─── Dashboard stats ─────────────────────────────────────────

  getStats: () => apiClient.get<AccountingStats>('/accounting/stats').then(r => r.data),

  // ─── États financiers SYSCOHADA ──────────────────────────────

  getBilan: (params: { periodId?: string; year?: number }) => {
    const q = new URLSearchParams()
    if (params.periodId) q.set('periodId', params.periodId)
    if (params.year)     q.set('year', String(params.year))
    return apiClient.get<Bilan>(`/accounting/reports/bilan${q.toString() ? `?${q}` : ''}`).then(r => r.data)
  },

  getCompteResultat: (params: { periodId?: string; year?: number }) => {
    const q = new URLSearchParams()
    if (params.periodId) q.set('periodId', params.periodId)
    if (params.year)     q.set('year', String(params.year))
    return apiClient.get<CompteResultat>(`/accounting/reports/compte-resultat${q.toString() ? `?${q}` : ''}`).then(r => r.data)
  },

  downloadStatementPdf: async (kind: 'bilan' | 'compte-resultat', params: { periodId?: string; year?: number }) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('bts_access_token') : ''
    const base  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api'
    const q = new URLSearchParams()
    if (params.periodId) q.set('periodId', params.periodId)
    if (params.year)     q.set('year', String(params.year))
    const res = await fetch(`${base}/accounting/reports/${kind}/pdf${q.toString() ? `?${q}` : ''}`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
    if (!res.ok) throw new Error('Échec de génération du PDF')
    const blob = await res.blob()
    const cd = res.headers.get('Content-Disposition') ?? ''
    const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? `${kind}.pdf`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  },
}
