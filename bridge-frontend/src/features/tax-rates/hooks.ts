import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { taxRatesApi } from './api'
import type { CreateTaxRatePayload, UpdateTaxRatePayload } from './types'

const KEY = ['tax-rates'] as const

export function useTaxRates(includeInactive = false) {
  return useQuery({
    queryKey:  [...KEY, { includeInactive }],
    queryFn:   () => taxRatesApi.list(includeInactive),
    staleTime: 60_000,
  })
}

export function useCreateTaxRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: CreateTaxRatePayload) => taxRatesApi.create(p),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Taux de TVA créé') },
    onError:    (e: { response?: { data?: { error?: string } } }) =>
      toast.error(e.response?.data?.error ?? 'Erreur lors de la création'),
  })
}

export function useUpdateTaxRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...p }: { id: string } & UpdateTaxRatePayload) => taxRatesApi.update(id, p),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Taux mis à jour') },
    onError:    () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteTaxRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => taxRatesApi.delete(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Taux supprimé') },
    onError:    () => toast.error('Impossible de supprimer ce taux'),
  })
}
