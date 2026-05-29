'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { expensesApi } from './api'
import type { CreateExpensePayload, UpdateExpensePayload, ListExpensesParams, CreateBudgetPayload } from './types'
import { ROUTES } from '@/lib/constants'

export const EXPENSE_KEYS = {
  all:        ['expenses'] as const,
  list:       (p?: ListExpensesParams) => ['expenses', 'list', p] as const,
  detail:     (id: string)             => ['expenses', 'detail', id] as const,
  stats:      ['expenses', 'stats']    as const,
  categories: ['expense-categories']   as const,
  budgets:    (year: number)           => ['expense-budgets', year] as const,
}

export function useExpenses(params?: ListExpensesParams) {
  return useQuery({
    queryKey: EXPENSE_KEYS.list(params),
    queryFn:  () => expensesApi.list(params),
    staleTime: 30_000,
  })
}

export function useExpense(id: string) {
  return useQuery({
    queryKey: EXPENSE_KEYS.detail(id),
    queryFn:  () => expensesApi.get(id),
    enabled:  !!id,
  })
}

export function useExpenseStats() {
  return useQuery({
    queryKey: EXPENSE_KEYS.stats,
    queryFn:  expensesApi.stats,
    staleTime: 60_000,
  })
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: EXPENSE_KEYS.categories,
    queryFn:  expensesApi.listCategories,
    staleTime: 300_000,
  })
}

export function useExpenseBudgets(year: number) {
  return useQuery({
    queryKey: EXPENSE_KEYS.budgets(year),
    queryFn:  () => expensesApi.listBudgets(year),
    staleTime: 60_000,
    enabled:  !!year,
  })
}

export function useCreateExpense() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: expensesApi.create,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.all })
      toast.success('Dépense créée')
      router.push(`${ROUTES.EXPENSES}/${data.id}`)
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdateExpense(id: string) {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (data: UpdateExpensePayload) => expensesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.all })
      toast.success('Dépense mise à jour')
      router.push(`${ROUTES.EXPENSES}/${id}`)
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useSubmitExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => expensesApi.submit(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.all })
      toast.success('Dépense soumise pour approbation')
    },
    onError: () => toast.error('Erreur lors de la soumission'),
  })
}

export function useApproveExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => expensesApi.approve(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.all })
      toast.success('Dépense approuvée')
    },
    onError: () => toast.error('Erreur lors de l\'approbation'),
  })
}

export function useRejectExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => expensesApi.reject(id, reason),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.all })
      toast.success('Dépense rejetée')
    },
    onError: () => toast.error('Erreur lors du rejet'),
  })
}

export function useMarkExpensePaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => expensesApi.markPaid(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.all })
      toast.success('Dépense marquée comme payée')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.all })
      toast.success('Dépense supprimée')
    },
    onError: () => toast.error('Impossible de supprimer cette dépense'),
  })
}

export function useCreateExpenseCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: expensesApi.createCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.categories })
      toast.success('Catégorie créée')
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdateExpenseCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof expensesApi.updateCategory>[1] }) =>
      expensesApi.updateCategory(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.categories })
      toast.success('Catégorie mise à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteExpenseCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => expensesApi.deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.categories })
      toast.success('Catégorie supprimée')
    },
    onError: () => toast.error('Impossible de supprimer cette catégorie'),
  })
}

export function useCreateBudget(year: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateBudgetPayload) => expensesApi.createBudget(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.budgets(year) })
      toast.success('Budget créé')
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useDeleteBudget(year: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => expensesApi.deleteBudget(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPENSE_KEYS.budgets(year) })
      toast.success('Budget supprimé')
    },
    onError: () => toast.error('Impossible de supprimer ce budget'),
  })
}
