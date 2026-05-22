'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { purchaseOrdersApi } from './api'
import type { CreatePurchaseOrderPayload, UpdatePurchaseOrderPayload, ListPurchaseOrdersParams } from './types'
import { ROUTES } from '@/lib/constants'

export const PO_KEYS = {
  all:    ['purchase-orders'] as const,
  list:   (p?: ListPurchaseOrdersParams) => ['purchase-orders', 'list', p] as const,
  detail: (id: string)                   => ['purchase-orders', 'detail', id] as const,
  stats:  ['purchase-orders', 'stats']   as const,
}

export function usePurchaseOrders(params?: ListPurchaseOrdersParams) {
  return useQuery({
    queryKey: PO_KEYS.list(params),
    queryFn:  () => purchaseOrdersApi.list(params),
    staleTime: 30_000,
  })
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: PO_KEYS.detail(id),
    queryFn:  () => purchaseOrdersApi.get(id),
    enabled:  !!id,
  })
}

export function usePurchaseOrderStats() {
  return useQuery({
    queryKey: PO_KEYS.stats,
    queryFn:  purchaseOrdersApi.stats,
    staleTime: 60_000,
  })
}

export function useCreatePurchaseOrder() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: purchaseOrdersApi.create,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      toast.success('Bon de commande créé')
      router.push(`${ROUTES.PURCHASE_ORDERS}/${data.id}`)
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdatePurchaseOrder(id: string) {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (data: UpdatePurchaseOrderPayload) => purchaseOrdersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      toast.success('Bon de commande mis à jour')
      router.push(`${ROUTES.PURCHASE_ORDERS}/${id}`)
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useApprovePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purchaseOrdersApi.approve(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      toast.success('Bon de commande approuvé')
    },
    onError: () => toast.error('Erreur lors de l\'approbation'),
  })
}

export function useReceivePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: { receivedDate?: string; notes?: string } }) =>
      purchaseOrdersApi.receive(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      toast.success('Réception enregistrée')
    },
    onError: () => toast.error('Erreur lors de la réception'),
  })
}

export function useCancelPurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purchaseOrdersApi.cancel(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      toast.success('Bon de commande annulé')
    },
    onError: () => toast.error('Erreur lors de l\'annulation'),
  })
}

export function useDuplicatePurchaseOrder() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (id: string) => purchaseOrdersApi.duplicate(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      toast.success('Bon de commande dupliqué')
      router.push(`${ROUTES.PURCHASE_ORDERS}/${data.id}`)
    },
    onError: () => toast.error('Erreur lors de la duplication'),
  })
}

export function useDeletePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purchaseOrdersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      toast.success('Bon de commande supprimé')
    },
    onError: () => toast.error('Impossible de supprimer ce bon de commande'),
  })
}
