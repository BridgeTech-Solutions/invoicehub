'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { purchaseOrdersApi } from './api'
import type { CreatePurchaseOrderPayload, UpdatePurchaseOrderPayload, ListPurchaseOrdersParams } from './types'
import { ROUTES } from '@/lib/constants'
import { getApiErrorMessage, getApiErrorCode, isApprovalFlowCode } from '@/lib/api-error'

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

export function useSendPurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purchaseOrdersApi.send(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      toast.success('Bon de commande envoyé')
    },
    onError: (e, id) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      const code = getApiErrorCode(e)
      const msg  = getApiErrorMessage(e, "Erreur lors de l'envoi")
      if (isApprovalFlowCode(code)) toast.info(msg)
      else toast.error(msg)
    },
  })
}

export function useConfirmPurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purchaseOrdersApi.confirm(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      toast.success('Bon de commande confirmé')
    },
    onError: () => toast.error('Erreur lors de la confirmation'),
  })
}

export function useReceivePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { lines: { lineId: string; quantityReceived: number }[]; receivedDate?: string; notes?: string | null } }) =>
      purchaseOrdersApi.receive(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      toast.success('Réception enregistrée')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur lors de la réception'),
  })
}

export function useClosePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purchaseOrdersApi.close(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      toast.success('Bon de commande clôturé')
    },
    onError: () => toast.error('Erreur lors de la clôture'),
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

export function useDownloadPurchaseOrderPdf() {
  return useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      purchaseOrdersApi.downloadPdf(id, filename),
    onMutate: () => {
      const tid = toast.loading('Génération du PDF en cours…')
      return { tid }
    },
    onSuccess: (_d, _v, ctx) => toast.success('PDF téléchargé', { id: ctx?.tid }),
    onError:   (_e, _v, ctx) => toast.error('Erreur lors du téléchargement PDF', { id: ctx?.tid }),
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

export function useCreateSupplierInvoiceFromBC() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (id: string) => purchaseOrdersApi.createSupplierInvoice(id),
    onMutate: () => {
      const tid = toast.loading('Création de la facture fournisseur…')
      return { tid }
    },
    onSuccess: (data, id, ctx) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PO_KEYS.all })
      toast.success(`FF ${data.supplierInvoiceNumber} créée`, { id: ctx?.tid })
      router.push(`/supplier-invoices/${data.supplierInvoiceId}`)
    },
    onError: (_e, _id, ctx) => toast.error('Erreur lors de la création de la FF', { id: ctx?.tid }),
  })
}

export function useLinkedSupplierInvoices(poId: string) {
  return useQuery({
    queryKey: ['purchase-orders', poId, 'supplier-invoices'],
    queryFn:  () => purchaseOrdersApi.getSupplierInvoices(poId),
    enabled:  !!poId,
    staleTime: 30_000,
  })
}
