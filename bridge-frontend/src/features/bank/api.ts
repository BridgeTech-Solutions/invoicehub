import { apiClient } from '@/lib/api-client'
import type {
  BankAccount, CreateBankAccountPayload, UpdateBankAccountPayload,
  BankTransaction, CreateTransactionPayload, ReconcilePayload,
  ListTransactionsParams, PaginatedTransactions,
  MatchingSuggestion, SubsetMatch,
  BankStatementImport, DetectFormatResult, ImportPreviewResult, ImportStatusResult,
  BankReconciliation, OpenReconciliationPayload, AutoMatchResult,
  PaginatedReconciliations, ListReconciliationsParams,
  BankMatchingRule, CreateMatchingRulePayload, UpdateMatchingRulePayload,
  BankSummary,
  BankImportProfile, CreateImportProfilePayload, UpdateImportProfilePayload,
} from './types'

// ─── Summary ────────────────────────────────────────────────────────────────

export const bankSummaryApi = {
  get: () => apiClient.get<BankSummary>('/bank/summary').then(r => r.data),
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export const bankAccountsApi = {
  list: () =>
    apiClient.get<BankAccount[]>('/bank/accounts').then(r => r.data),

  get: (id: string) =>
    apiClient.get<BankAccount>(`/bank/accounts/${id}`).then(r => r.data),

  create: (data: CreateBankAccountPayload) =>
    apiClient.post<BankAccount>('/bank/accounts', data).then(r => r.data),

  update: (id: string, data: UpdateBankAccountPayload) =>
    apiClient.put<BankAccount>(`/bank/accounts/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/bank/accounts/${id}`),

  getImportConfig: (id: string) =>
    apiClient.get(`/bank/accounts/${id}/import-config`).then(r => r.data),
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export const bankTransactionsApi = {
  list: (params?: ListTransactionsParams) =>
    apiClient.get<PaginatedTransactions>('/bank/transactions', { params }).then(r => r.data),

  get: (id: string) =>
    apiClient.get<BankTransaction>(`/bank/transactions/${id}`).then(r => r.data),

  create: (data: CreateTransactionPayload) =>
    apiClient.post<BankTransaction>('/bank/transactions', data).then(r => r.data),

  reconcile: (id: string, data: ReconcilePayload) =>
    apiClient.post<BankTransaction>(`/bank/transactions/${id}/reconcile`, data).then(r => r.data),

  unmatch: (id: string) =>
    apiClient.post<BankTransaction>(`/bank/transactions/${id}/unmatch`).then(r => r.data),

  ignore: (id: string) =>
    apiClient.post<BankTransaction>(`/bank/transactions/${id}/ignore`).then(r => r.data),

  getSuggestions: (id: string) =>
    apiClient.get<MatchingSuggestion[]>(`/bank/transactions/${id}/suggestions`).then(r => r.data),

  getSubsetMatches: (id: string) =>
    apiClient.get<SubsetMatch[]>(`/bank/transactions/${id}/subset-matches`).then(r => r.data),
}

// ─── Import ───────────────────────────────────────────────────────────────────

export const bankImportApi = {
  detect: (file: File, bankAccountId: string, encoding?: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('bankAccountId', bankAccountId)
    if (encoding) form.append('encoding', encoding)
    return apiClient.post<DetectFormatResult>('/bank/import/detect', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  preview: (file: File, bankAccountId: string, encoding?: string, columnMapping?: object) => {
    const form = new FormData()
    form.append('file', file)
    form.append('bankAccountId', bankAccountId)
    if (encoding)      form.append('encoding', encoding)
    if (columnMapping) form.append('columnMapping', JSON.stringify(columnMapping))
    return apiClient.post<ImportPreviewResult>('/bank/import/preview', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  confirm: (importId: string) =>
    apiClient.post<{ importId: string; jobId: string }>('/bank/import/confirm', { importId }).then(r => r.data),

  getStatus: (importId: string) =>
    apiClient.get<ImportStatusResult>(`/bank/import/${importId}/status`).then(r => r.data),

  rollback: (importId: string) =>
    apiClient.delete(`/bank/import/${importId}`),

  listHistory: () =>
    apiClient.get<BankStatementImport[]>('/bank/imports').then(r => r.data),
}

// ─── Reconciliations ──────────────────────────────────────────────────────────

export const bankReconciliationsApi = {
  list: (params?: ListReconciliationsParams) =>
    apiClient.get<PaginatedReconciliations>('/bank/reconciliations', { params }).then(r => r.data),

  get: (id: string) =>
    apiClient.get<BankReconciliation>(`/bank/reconciliations/${id}`).then(r => r.data),

  open: (data: OpenReconciliationPayload) =>
    apiClient.post<BankReconciliation>('/bank/reconciliations', data).then(r => r.data),

  autoMatch: (id: string, applyHighConfidence?: boolean) =>
    apiClient.post<AutoMatchResult>(`/bank/reconciliations/${id}/auto-match`, { applyHighConfidence }).then(r => r.data),

  complete: (id: string) =>
    apiClient.post<BankReconciliation>(`/bank/reconciliations/${id}/complete`).then(r => r.data),

  getReport: (id: string) =>
    apiClient.get(`/bank/reconciliations/${id}/report`).then(r => r.data),
}

// ─── Matching Rules ───────────────────────────────────────────────────────────

export const bankMatchingRulesApi = {
  list: (bankAccountId?: string) =>
    apiClient.get<BankMatchingRule[]>('/bank/matching-rules', {
      params: bankAccountId ? { bankAccountId } : undefined,
    }).then(r => r.data),

  create: (data: CreateMatchingRulePayload) =>
    apiClient.post<BankMatchingRule>('/bank/matching-rules', data).then(r => r.data),

  update: (id: string, data: UpdateMatchingRulePayload) =>
    apiClient.put<BankMatchingRule>(`/bank/matching-rules/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/bank/matching-rules/${id}`),
}

// ─── Import Profiles ──────────────────────────────────────────────────────────

export const bankImportProfilesApi = {
  list: () =>
    apiClient.get<BankImportProfile[]>('/bank/import-profiles').then(r => r.data),

  get: (id: string) =>
    apiClient.get<BankImportProfile>(`/bank/import-profiles/${id}`).then(r => r.data),

  create: (data: CreateImportProfilePayload) =>
    apiClient.post<BankImportProfile>('/bank/import-profiles', data).then(r => r.data),

  update: (id: string, data: UpdateImportProfilePayload) =>
    apiClient.put<BankImportProfile>(`/bank/import-profiles/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/bank/import-profiles/${id}`),
}
