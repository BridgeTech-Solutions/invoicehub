import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { unitsApi, type Unit } from './api'

const KEYS = {
  all:    ['units'] as const,
  active: ['units', 'active'] as const,
}

/** Unités actives — utilisé dans les dropdowns (LineItemsEditor, ProductForm) */
export function useUnits() {
  return useQuery({
    queryKey:  KEYS.active,
    queryFn:   () => unitsApi.list(false),
    staleTime: 5 * 60_000,
  })
}

/** Toutes les unités (actives + inactives) — page Paramètres */
export function useAllUnits() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn:  () => unitsApi.list(true),
    staleTime: 30_000,
  })
}

export function useCreateUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Omit<Unit, 'id'>) => unitsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Unité créée')
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Erreur lors de la création'),
  })
}

export function useUpdateUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Unit> & { id: string }) => unitsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Unité mise à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useRemoveUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unitsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Unité désactivée')
    },
    onError: () => toast.error('Impossible de désactiver cette unité'),
  })
}
