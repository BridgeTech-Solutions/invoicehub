'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import * as recurringApi from './api'
import { ROUTES } from '@/lib/constants'
import type { ListRecurringParams, CreateRecurringPayload, UpdateRecurringPayload } from './types'

export const RECURRING_KEYS = {
  all:    ['recurring'] as const,
  list:   (p?: ListRecurringParams) => ['recurring', 'list', p] as const,
  detail: (id: string)              => ['recurring', 'detail', id] as const,
}

export function useRecurringList(params?: ListRecurringParams) {
  return useQuery({
    queryKey: RECURRING_KEYS.list(params),
    queryFn:  () => recurringApi.list(params),
  })
}

export function useRecurring(id: string) {
  return useQuery({
    queryKey: RECURRING_KEYS.detail(id),
    queryFn:  () => recurringApi.getById(id),
    enabled:  !!id,
  })
}

export function useCreateRecurring() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (payload: CreateRecurringPayload) => recurringApi.create(payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: RECURRING_KEYS.all })
      toast.success('Gabarit créé')
      router.push(`${ROUTES.RECURRING}/${data.id}`)
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdateRecurring(id: string) {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (payload: UpdateRecurringPayload) => recurringApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECURRING_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: RECURRING_KEYS.all })
      toast.success('Modifications enregistrées')
      router.push(`${ROUTES.RECURRING}/${id}`)
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteRecurring() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (id: string) => recurringApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECURRING_KEYS.all })
      toast.success('Gabarit supprimé')
      router.push(ROUTES.RECURRING)
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })
}

export function useActivateRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => recurringApi.activate(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: RECURRING_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: RECURRING_KEYS.all })
      toast.success('Gabarit activé')
    },
    onError: () => toast.error('Erreur lors de l\'activation'),
  })
}

export function useDeactivateRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => recurringApi.deactivate(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: RECURRING_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: RECURRING_KEYS.all })
      toast.success('Gabarit désactivé')
    },
    onError: () => toast.error('Erreur lors de la désactivation'),
  })
}

export function useGenerateRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => recurringApi.generate(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: RECURRING_KEYS.all })
      toast.success(`Facture ${data.number} générée`)
    },
    onError: () => toast.error('Erreur lors de la génération'),
  })
}
