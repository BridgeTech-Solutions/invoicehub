'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supplierInvoicesApi } from './api'
import type {
  CreateSupplierInvoicePayload, UpdateSupplierInvoicePayload,
  ListSupplierInvoicesParams, RecordSupplierPaymentPayload,
} from './types'
import { ROUTES } from '@/lib/constants'

export const SI_KEYS = {
  all:    ['supplier-invoices'] as const,
  list:   (p?: ListSupplierInvoicesParams) => ['supplier-invoices', 'list', p] as const,
  detail: (id: string)                     => ['supplier-invoices', 'detail', id] as const,
}

export function useSupplierInvoices(params?: ListSupplierInvoicesParams) {
  return useQuery({
    queryKey: SI_KEYS.list(params),
    queryFn:  () => supplierInvoicesApi.list(params),
    staleTime: 30_000,
  })
}

export function useSupplierInvoice(id: string) {
  return useQuery({
    queryKey: SI_KEYS.detail(id),
    queryFn:  () => supplierInvoicesApi.get(id),
    enabled:  !!id,
  })
}

export function useCreateSupplierInvoice() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: supplierInvoicesApi.create,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: SI_KEYS.all })
      toast.success('Facture fournisseur créée')
      router.push(`${ROUTES.SUPPLIER_INVOICES}/${data.id}`)
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdateSupplierInvoice(id: string) {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (data: UpdateSupplierInvoicePayload) => supplierInvoicesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SI_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: SI_KEYS.all })
      toast.success('Facture fournisseur mise à jour')
      router.push(`${ROUTES.SUPPLIER_INVOICES}/${id}`)
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useValidateSupplierInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => supplierInvoicesApi.validate(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: SI_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: SI_KEYS.all })
      toast.success('Facture validée')
    },
    onError: () => toast.error('Erreur lors de la validation'),
  })
}

export function useDisputeSupplierInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      supplierInvoicesApi.dispute(id, reason),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: SI_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: SI_KEYS.all })
      toast.success('Facture contestée')
    },
    onError: () => toast.error('Erreur lors de la contestation'),
  })
}

export function useRecordSupplierPayment(invoiceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: RecordSupplierPaymentPayload) =>
      supplierInvoicesApi.pay(invoiceId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SI_KEYS.detail(invoiceId) })
      qc.invalidateQueries({ queryKey: SI_KEYS.all })
      toast.success('Paiement enregistré')
    },
    onError: () => toast.error('Erreur lors de l\'enregistrement'),
  })
}

export function useDeleteSupplierInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => supplierInvoicesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SI_KEYS.all })
      toast.success('Facture supprimée')
    },
    onError: () => toast.error('Impossible de supprimer cette facture'),
  })
}
