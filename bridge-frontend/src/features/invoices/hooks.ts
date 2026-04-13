'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { invoicesApi, paymentsApi } from './api'
import type {
  ListInvoicesParams, UpdateInvoicePayload, CancelInvoicePayload,
  CreateAvoirPayload, ComputeInvoicePayload, CreatePaymentPayload, ListPaymentsParams,
} from './types'
import { ROUTES } from '@/lib/constants'

export const INVOICE_KEYS = {
  all:    ['invoices'] as const,
  list:   (p?: ListInvoicesParams) => ['invoices', 'list', p] as const,
  detail: (id: string)             => ['invoices', 'detail', id] as const,
  counts: ['invoices', 'counts']   as const,
}

export const PAYMENT_KEYS = {
  all:  ['payments'] as const,
  list: (p?: ListPaymentsParams) => ['payments', 'list', p] as const,
}

// ─── Invoice queries ────────────────────────────────────────────

export function useInvoiceCounts() {
  return useQuery({
    queryKey: INVOICE_KEYS.counts,
    queryFn:  () => invoicesApi.counts(),
    staleTime: 60_000,
  })
}

export function useInvoices(params?: ListInvoicesParams) {
  return useQuery({
    queryKey: INVOICE_KEYS.list(params),
    queryFn:  () => invoicesApi.list(params),
    staleTime: 30_000,
  })
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: INVOICE_KEYS.detail(id),
    queryFn:  () => invoicesApi.get(id),
    enabled:  !!id,
  })
}

export function useInvoiceHistory(id: string) {
  return useQuery({
    queryKey: [...INVOICE_KEYS.detail(id), 'history'],
    queryFn:  () => invoicesApi.getHistory(id),
    enabled:  !!id,
    staleTime: 60_000,
  })
}

// ─── Invoice mutations ──────────────────────────────────────────

export function useCreateInvoice() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: invoicesApi.create,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all })
      toast.success('Facture créée')
      router.push(`${ROUTES.INVOICES}/${data.id}`)
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdateInvoice(id: string) {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (data: UpdateInvoicePayload) => invoicesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all })
      toast.success('Modifications enregistrées')
      router.push(`${ROUTES.INVOICES}/${id}`)
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useIssueInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => invoicesApi.issue(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all })
      toast.success('Facture émise avec succès')
    },
    onError: () => toast.error('Erreur lors de l\'émission'),
  })
}

export function useCancelInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: CancelInvoicePayload }) =>
      invoicesApi.cancel(id, data),
    onSuccess: (result, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all })
      toast.success('Facture annulée — avoir généré automatiquement')
    },
    onError: () => toast.error('Annulation impossible'),
  })
}

export function useDuplicateInvoice() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (id: string) => invoicesApi.duplicate(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all })
      toast.success('Facture dupliquée')
      router.push(`${ROUTES.INVOICES}/${data.id}`)
    },
    onError: () => toast.error('Erreur lors de la duplication'),
  })
}

export function useDeleteInvoice() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (id: string) => invoicesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all })
      toast.success('Facture supprimée')
      router.push(ROUTES.INVOICES)
    },
    onError: () => toast.error('Suppression impossible (statut non brouillon ?)'),
  })
}

export function useCreateAvoir() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateAvoirPayload }) =>
      invoicesApi.createAvoir(id, data),
    onSuccess: (avoir, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all })
      toast.success('Avoir créé')
      router.push(`${ROUTES.INVOICES}/${avoir.id}`)
    },
    onError: () => toast.error('Erreur lors de la création de l\'avoir'),
  })
}

export function useComputeInvoice() {
  return useMutation({
    mutationFn: (data: ComputeInvoicePayload) => invoicesApi.compute(data),
  })
}

export function useDownloadInvoicePdf() {
  return useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      invoicesApi.downloadPdf(id, filename),
    onMutate: () => {
      const tid = toast.loading('Génération du PDF en cours…')
      return { tid }
    },
    onSuccess: (_d, _v, ctx) => toast.success('PDF téléchargé', { id: ctx?.tid }),
    onError:   (_e, _v, ctx) => toast.error('Erreur lors du téléchargement PDF', { id: ctx?.tid }),
  })
}

// ─── Payment mutations ──────────────────────────────────────────

export function useCreatePayment(invoiceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePaymentPayload) =>
      invoicesApi.createPayment(invoiceId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(invoiceId) })
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all })
      qc.invalidateQueries({ queryKey: PAYMENT_KEYS.all })
      toast.success('Paiement enregistré ✓')
    },
    onError: () => toast.error('Erreur lors de l\'enregistrement du paiement'),
  })
}

export function useDeletePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paymentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all })
      qc.invalidateQueries({ queryKey: PAYMENT_KEYS.all })
      toast.success('Paiement supprimé')
    },
    onError: () => toast.error('Suppression impossible'),
  })
}

export function useDownloadReceipt() {
  return useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      paymentsApi.downloadReceipt(id, filename),
    onSuccess: () => toast.success('Reçu téléchargé'),
    onError:   () => toast.error('Erreur lors du téléchargement'),
  })
}

// ─── Payments list query ────────────────────────────────────────

export function usePayments(params?: ListPaymentsParams) {
  return useQuery({
    queryKey: PAYMENT_KEYS.list(params),
    queryFn:  () => paymentsApi.list(params),
    staleTime: 30_000,
  })
}
