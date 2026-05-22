'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { suppliersApi } from './api'
import type { CreateSupplierPayload, UpdateSupplierPayload, ListSuppliersParams } from './types'
import { ROUTES } from '@/lib/constants'

export const SUPPLIER_KEYS = {
  all:    ['suppliers'] as const,
  list:   (p?: ListSuppliersParams) => ['suppliers', 'list', p] as const,
  detail: (id: string)              => ['suppliers', 'detail', id] as const,
}

export function useSuppliers(params?: ListSuppliersParams) {
  return useQuery({
    queryKey: SUPPLIER_KEYS.list(params),
    queryFn:  () => suppliersApi.list(params),
    staleTime: 30_000,
  })
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: SUPPLIER_KEYS.detail(id),
    queryFn:  () => suppliersApi.get(id),
    enabled:  !!id,
  })
}

export function useCreateSupplier() {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: suppliersApi.create,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: SUPPLIER_KEYS.all })
      toast.success('Fournisseur créé')
      router.push(`${ROUTES.SUPPLIERS}/${data.id}`)
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdateSupplier(id: string) {
  const qc     = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (data: UpdateSupplierPayload) => suppliersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUPPLIER_KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: SUPPLIER_KEYS.all })
      toast.success('Fournisseur mis à jour')
      router.push(`${ROUTES.SUPPLIERS}/${id}`)
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => suppliersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUPPLIER_KEYS.all })
      toast.success('Fournisseur supprimé')
    },
    onError: () => toast.error('Impossible de supprimer ce fournisseur'),
  })
}

export function useExportSuppliersCsv() {
  return useMutation({
    mutationFn: suppliersApi.exportCsv,
    onError: () => toast.error('Erreur lors de l\'export'),
  })
}
