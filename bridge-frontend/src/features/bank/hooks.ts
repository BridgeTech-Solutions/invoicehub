'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  bankSummaryApi, bankAccountsApi, bankTransactionsApi,
  bankImportApi, bankReconciliationsApi, bankMatchingRulesApi,
  bankImportProfilesApi,
} from './api'
import type {
  CreateBankAccountPayload, UpdateBankAccountPayload,
  CreateTransactionPayload, ReconcilePayload,
  ListTransactionsParams, OpenReconciliationPayload,
  CreateMatchingRulePayload, UpdateMatchingRulePayload,
  ListReconciliationsParams,
  CreateImportProfilePayload, UpdateImportProfilePayload,
} from './types'

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const BANK_KEYS = {
  summary:        ['bank', 'summary']                              as const,
  accounts:       ['bank', 'accounts']                            as const,
  account:        (id: string) => ['bank', 'accounts', id]        as const,
  transactions:   (p?: ListTransactionsParams) => ['bank', 'transactions', p] as const,
  transaction:    (id: string) => ['bank', 'transactions', id]    as const,
  suggestions:    (id: string) => ['bank', 'transactions', id, 'suggestions'] as const,
  reconciliations:(p?: ListReconciliationsParams) => ['bank', 'reconciliations', p] as const,
  reconciliation: (id: string) => ['bank', 'reconciliations', id] as const,
  matchingRules:  (accountId?: string) => ['bank', 'matching-rules', accountId] as const,
  importProfiles: ['bank', 'import-profiles'] as const,
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export function useBankSummary() {
  return useQuery({
    queryKey: BANK_KEYS.summary,
    queryFn:  bankSummaryApi.get,
    staleTime: 60_000,
  })
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export function useBankAccounts() {
  return useQuery({
    queryKey: BANK_KEYS.accounts,
    queryFn:  bankAccountsApi.list,
    staleTime: 60_000,
  })
}

export function useBankAccount(id: string) {
  return useQuery({
    queryKey: BANK_KEYS.account(id),
    queryFn:  () => bankAccountsApi.get(id),
    enabled:  !!id,
  })
}

export function useCreateBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateBankAccountPayload) => bankAccountsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BANK_KEYS.accounts })
      qc.invalidateQueries({ queryKey: BANK_KEYS.summary })
      toast.success('Compte bancaire créé')
    },
    onError: () => toast.error('Erreur lors de la création du compte'),
  })
}

export function useUpdateBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBankAccountPayload }) =>
      bankAccountsApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: BANK_KEYS.accounts })
      qc.invalidateQueries({ queryKey: BANK_KEYS.account(id) })
      qc.invalidateQueries({ queryKey: BANK_KEYS.summary })
      toast.success('Compte mis à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bankAccountsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BANK_KEYS.accounts })
      qc.invalidateQueries({ queryKey: BANK_KEYS.summary })
      toast.success('Compte supprimé')
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })
}

// ─── Transactions ──────────────────────────────────────────────────────────────

export function useTransactions(params?: ListTransactionsParams) {
  return useQuery({
    queryKey: BANK_KEYS.transactions(params),
    queryFn:  () => bankTransactionsApi.list(params),
    staleTime: 30_000,
  })
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: BANK_KEYS.transaction(id),
    queryFn:  () => bankTransactionsApi.get(id),
    enabled:  !!id,
  })
}

export function useTransactionSuggestions(id: string, enabled = true) {
  return useQuery({
    queryKey: BANK_KEYS.suggestions(id),
    queryFn:  () => bankTransactionsApi.getSuggestions(id),
    enabled:  !!id && enabled,
    staleTime: 120_000,
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateTransactionPayload) => bankTransactionsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank', 'transactions'] })
      qc.invalidateQueries({ queryKey: BANK_KEYS.summary })
      toast.success('Transaction créée')
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useReconcileTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReconcilePayload }) =>
      bankTransactionsApi.reconcile(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank', 'transactions'] })
      qc.invalidateQueries({ queryKey: BANK_KEYS.summary })
      toast.success('Transaction rapprochée')
    },
    onError: () => toast.error('Erreur lors du rapprochement'),
  })
}

export function useUnmatchTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bankTransactionsApi.unmatch(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank', 'transactions'] })
      qc.invalidateQueries({ queryKey: BANK_KEYS.summary })
      toast.success('Rapprochement annulé')
    },
    onError: () => toast.error('Erreur'),
  })
}

export function useIgnoreTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bankTransactionsApi.ignore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank', 'transactions'] })
      qc.invalidateQueries({ queryKey: BANK_KEYS.summary })
      toast.success('Transaction ignorée')
    },
    onError: () => toast.error('Erreur'),
  })
}

// ─── Import ────────────────────────────────────────────────────────────────────

export function useImportStatus(importId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['bank', 'import', importId, 'status'],
    queryFn:  () => bankImportApi.getStatus(importId!),
    enabled:  !!importId && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'processing' || status === 'pending') return 2_000
      return false
    },
    staleTime: 0,
  })
}

export function useConfirmImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (importId: string) => bankImportApi.confirm(importId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank', 'transactions'] })
      qc.invalidateQueries({ queryKey: BANK_KEYS.summary })
    },
    onError: () => toast.error("Erreur lors de la confirmation de l'import"),
  })
}

export function useRollbackImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (importId: string) => bankImportApi.rollback(importId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank', 'transactions'] })
      qc.invalidateQueries({ queryKey: BANK_KEYS.summary })
      toast.success('Import annulé')
    },
    onError: () => toast.error("Erreur lors de l'annulation"),
  })
}

// ─── Reconciliations ────────────────────────────────────────────────────────────

export function useReconciliations(params?: ListReconciliationsParams) {
  return useQuery({
    queryKey: BANK_KEYS.reconciliations(params),
    queryFn:  () => bankReconciliationsApi.list(params),
    staleTime: 30_000,
  })
}

export function useReconciliation(id: string) {
  return useQuery({
    queryKey: BANK_KEYS.reconciliation(id),
    queryFn:  () => bankReconciliationsApi.get(id),
    enabled:  !!id,
  })
}

export function useOpenReconciliation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: OpenReconciliationPayload) => bankReconciliationsApi.open(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank', 'reconciliations'] })
      toast.success('Session de rapprochement ouverte')
    },
    onError: () => toast.error('Erreur lors de la création de la session'),
  })
}

export function useAutoMatch(reconciliationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (applyHighConfidence: boolean) =>
      bankReconciliationsApi.autoMatch(reconciliationId, applyHighConfidence),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['bank', 'transactions'] })
      qc.invalidateQueries({ queryKey: BANK_KEYS.reconciliation(reconciliationId) })
      toast.success(`${result.applied} transaction(s) rapprochée(s) automatiquement`)
    },
    onError: () => toast.error("Erreur lors de l'auto-matching"),
  })
}

export function useCompleteReconciliation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bankReconciliationsApi.complete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank', 'reconciliations'] })
      qc.invalidateQueries({ queryKey: BANK_KEYS.summary })
      toast.success('Rapprochement terminé')
    },
    onError: () => toast.error('Erreur lors de la clôture de la session'),
  })
}

// ─── Matching Rules ────────────────────────────────────────────────────────────

export function useMatchingRules(bankAccountId?: string) {
  return useQuery({
    queryKey: BANK_KEYS.matchingRules(bankAccountId),
    queryFn:  () => bankMatchingRulesApi.list(bankAccountId),
    staleTime: 60_000,
  })
}

export function useCreateMatchingRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateMatchingRulePayload) => bankMatchingRulesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank', 'matching-rules'] })
      toast.success('Règle créée')
    },
    onError: () => toast.error('Erreur lors de la création de la règle'),
  })
}

export function useUpdateMatchingRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMatchingRulePayload }) =>
      bankMatchingRulesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank', 'matching-rules'] })
      toast.success('Règle mise à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteMatchingRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bankMatchingRulesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank', 'matching-rules'] })
      toast.success('Règle supprimée')
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })
}

// ─── Polling helper pour import async ─────────────────────────────────────────

export function useImportPolling(importId: string | null) {
  const isActive = !!importId
  const result = useImportStatus(importId, isActive)
  const isDone = result.data?.status === 'completed' || result.data?.status === 'failed'
  return { ...result, isDone }
}

// ─── Import Profiles ───────────────────────────────────────────────────────────

export function useImportProfiles() {
  return useQuery({
    queryKey: BANK_KEYS.importProfiles,
    queryFn:  bankImportProfilesApi.list,
    staleTime: 60_000,
  })
}

export function useCreateImportProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateImportProfilePayload) => bankImportProfilesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BANK_KEYS.importProfiles })
      toast.success('Profil d\'import créé')
    },
    onError: () => toast.error('Erreur lors de la création du profil'),
  })
}

export function useUpdateImportProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateImportProfilePayload }) =>
      bankImportProfilesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BANK_KEYS.importProfiles })
      toast.success('Profil mis à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour du profil'),
  })
}

export function useDeleteImportProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bankImportProfilesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BANK_KEYS.importProfiles })
      toast.success('Profil supprimé')
    },
    onError: () => toast.error('Erreur lors de la suppression du profil'),
  })
}
