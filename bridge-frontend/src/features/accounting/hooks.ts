// ─── Accounting feature — hooks ────────────────────────────────

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { accountingApi } from './api'
import type {
  CreateAccountPayload, UpdateAccountPayload,
  CreateFiscalYearPayload,
  CreateJournalPayload, UpdateJournalPayload,
  ListEntriesParams, CreateEntryPayload,
  CreateTaxDeclPayload, ExportConfig,
  AccountClass,
} from './types'

// ─── Accounts ─────────────────────────────────────────────────

export function useAccounts(params?: { class?: AccountClass; search?: string; active?: boolean }) {
  return useQuery({
    queryKey: ['accounting-accounts', params],
    queryFn:  () => accountingApi.listAccounts(params),
    staleTime: 5 * 60 * 1000,
  })
}

export function useAccount(id: string | null) {
  return useQuery({
    queryKey: ['accounting-account', id],
    queryFn:  () => accountingApi.getAccount(id!),
    enabled:  !!id,
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAccountPayload) => accountingApi.createAccount(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-accounts'] }),
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAccountPayload }) =>
      accountingApi.updateAccount(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting-accounts'] })
      qc.invalidateQueries({ queryKey: ['accounting-account'] })
    },
  })
}

export function useToggleAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      accountingApi.toggleAccount(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-accounts'] }),
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => accountingApi.deleteAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-accounts'] }),
  })
}

// ─── Fiscal years & periods ───────────────────────────────────

export function useFiscalYears() {
  return useQuery({
    queryKey: ['accounting-fiscal-years'],
    queryFn:  accountingApi.listFiscalYears,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateFiscalYear() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateFiscalYearPayload) => accountingApi.createFiscalYear(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-fiscal-years'] }),
  })
}

export function useClosePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => accountingApi.closePeriod(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-fiscal-years'] }),
  })
}

export function useReopenPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => accountingApi.reopenPeriod(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-fiscal-years'] }),
  })
}

// ─── Journals ─────────────────────────────────────────────────

export function useJournals() {
  return useQuery({
    queryKey: ['accounting-journals'],
    queryFn:  accountingApi.listJournals,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateJournal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateJournalPayload) => accountingApi.createJournal(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-journals'] }),
  })
}

export function useUpdateJournal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateJournalPayload }) =>
      accountingApi.updateJournal(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-journals'] }),
  })
}

export function useToggleJournal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      accountingApi.toggleJournal(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-journals'] }),
  })
}

export function useDeleteJournal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => accountingApi.deleteJournal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-journals'] }),
  })
}

// ─── Entries ──────────────────────────────────────────────────

export function useEntries(params: ListEntriesParams = {}) {
  return useQuery({
    queryKey: ['accounting-entries', params],
    queryFn:  () => accountingApi.listEntries(params),
  })
}

export function useEntry(id: string | null) {
  return useQuery({
    queryKey: ['accounting-entry', id],
    queryFn:  () => accountingApi.getEntry(id!),
    enabled:  !!id,
  })
}

export function useCreateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateEntryPayload) => accountingApi.createEntry(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting-entries'] })
      qc.invalidateQueries({ queryKey: ['accounting-balance'] })
      qc.invalidateQueries({ queryKey: ['accounting-stats'] })
    },
  })
}

export function useCancelEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => accountingApi.cancelEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting-entries'] })
      qc.invalidateQueries({ queryKey: ['accounting-balance'] })
    },
  })
}

// ─── Balance & Grand livre ────────────────────────────────────

export function useBalance(params: { periodId?: string; class?: AccountClass; includeEmpty?: boolean } = {}) {
  return useQuery({
    queryKey: ['accounting-balance', params],
    queryFn:  () => accountingApi.getBalance(params),
    staleTime: 2 * 60 * 1000,
  })
}

export function useGeneralLedger(
  accountId: string | null,
  params: { periodId?: string; dateFrom?: string; dateTo?: string } = {}
) {
  return useQuery({
    queryKey: ['accounting-ledger', accountId, params],
    queryFn:  () => accountingApi.getGeneralLedger(accountId!, params),
    enabled:  !!accountId,
  })
}

// ─── Lettering ────────────────────────────────────────────────

export function useLetterableLines(accountId: string | null, periodId?: string) {
  return useQuery({
    queryKey: ['accounting-lettering', accountId, periodId],
    queryFn:  () => accountingApi.getLetterableLines(accountId!, periodId),
    enabled:  !!accountId,
  })
}

export function useLetterLines() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ lineIds, accountNumber }: { lineIds: string[]; accountNumber?: string }) =>
      accountingApi.letterLines(lineIds, accountNumber),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-lettering'] }),
  })
}

export function useUnletterGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ letterCode, accountNumber }: { letterCode: string; accountNumber: string }) =>
      accountingApi.unletterGroup(letterCode, accountNumber),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-lettering'] }),
  })
}

// ─── Tax declarations ─────────────────────────────────────────

export function useTaxDeclarations(params?: { periodId?: string; status?: string }) {
  return useQuery({
    queryKey: ['accounting-tax-decls', params],
    queryFn:  () => accountingApi.listTaxDeclarations(params),
    staleTime: 2 * 60 * 1000,
  })
}

export function useTaxDeclaration(id: string | null) {
  return useQuery({
    queryKey: ['accounting-tax-decl', id],
    queryFn:  () => accountingApi.getTaxDeclaration(id!),
    enabled:  !!id,
  })
}

export function useCreateTaxDeclaration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateTaxDeclPayload) => accountingApi.createTaxDeclaration(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-tax-decls'] }),
  })
}

export function useSubmitTaxDeclaration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => accountingApi.submitTaxDeclaration(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting-tax-decls'] }),
  })
}

// ─── Stats ────────────────────────────────────────────────────

export function useAccountingStats() {
  return useQuery({
    queryKey: ['accounting-stats'],
    queryFn:  accountingApi.getStats,
    staleTime: 5 * 60 * 1000,
  })
}
