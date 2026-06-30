'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { proformasApi } from './api'
import type { ListProformasParams, UpdateProformaPayload, ConvertToInvoicePayload } from './types'
import { ROUTES } from '@/lib/constants'

export const PROFORMA_KEYS = {
  all:    ['proformas'] as const,
  list:   (p?: ListProformasParams) => ['proformas', 'list', p] as const,
  detail: (id: string)              => ['proformas', 'detail', id] as const,
  counts: ['proformas', 'counts']   as const,
}

// ─── Queries ───────────────────────────────────────────────────

export function useProformaCounts() {
  return useQuery({
    queryKey: PROFORMA_KEYS.counts,
    queryFn:  () => proformasApi.counts(),
    staleTime: 60_000,
  })
}

export function useProformas(params?: ListProformasParams) {
  return useQuery({
    queryKey: PROFORMA_KEYS.list(params),
    queryFn:  () => proformasApi.list(params),
    staleTime: 30_000,
  })
}

export function useProforma(id: string) {
  return useQuery({
    queryKey: PROFORMA_KEYS.detail(id),
    queryFn:  () => proformasApi.get(id),
    enabled:  !!id,
  })
}

// ─── Mutations ─────────────────────────────────────────────────

export function useCreateProforma() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: proformasApi.create,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.all })
      toast.success('Proforma créée')
      router.push(`${ROUTES.PROFORMAS}/${data.id}`)
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdateProforma(id: string) {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (data: UpdateProformaPayload) => proformasApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.all })
      toast.success('Modifications enregistrées')
      router.push(`${ROUTES.PROFORMAS}/${id}`)
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteProforma() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: proformasApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.all })
      toast.success('Proforma supprimée')
      router.push(ROUTES.PROFORMAS)
    },
    onError: () => toast.error('Suppression impossible (statut non brouillon ?)'),
  })
}

export function useSendProforma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: proformasApi.send,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.all })
      toast.success('Proforma marquée comme envoyée ✓')
    },
    onError: () => toast.error('Erreur lors de l\'envoi'),
  })
}

export function useAcceptProforma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: proformasApi.accept,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.all })
      toast.success('Proforma acceptée ✓')
    },
    onError: () => toast.error('Acceptation impossible'),
  })
}

export function useRejectProforma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      proformasApi.reject(id, reason),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.all })
      toast.success('Proforma rejetée')
    },
    onError: () => toast.error('Rejet impossible'),
  })
}

export function useConvertProforma() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConvertToInvoicePayload }) =>
      proformasApi.convert(id, data),
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.all })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Convertie en facture !')
      router.push(`${ROUTES.INVOICES}/${invoice.id}`)
    },
    onError: () => toast.error('Erreur lors de la conversion'),
  })
}

export function useDuplicateProforma() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: proformasApi.duplicate,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.all })
      toast.success('Proforma dupliquée')
      router.push(`${ROUTES.PROFORMAS}/${data.id}`)
    },
    onError: () => toast.error('Erreur lors de la duplication'),
  })
}

export function useReorderProformaLines(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (lineIds: string[]) => proformasApi.reorderLines(id, lineIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: PROFORMA_KEYS.all })
      toast.success('Ordre des lignes enregistré')
    },
    onError: () => toast.error('Erreur lors du réordonnancement'),
  })
}

export function useDownloadProformaPdf() {
  return useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      proformasApi.downloadPdf(id, filename),
    onMutate: () => {
      const tid = toast.loading('Génération du PDF en cours…')
      return { tid }
    },
    onSuccess: (_d, _v, ctx) => toast.success('PDF téléchargé', { id: ctx?.tid }),
    onError:   (_e, _v, ctx) => toast.error('Erreur lors du téléchargement PDF', { id: ctx?.tid }),
  })
}
