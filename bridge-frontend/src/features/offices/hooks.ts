import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { officesApi } from './api'
import type { CreateOfficePayload, UpdateOfficePayload } from './types'

const KEY = ['offices'] as const

export function useOffices() {
  return useQuery({ queryKey: KEY, queryFn: officesApi.list, staleTime: 60_000 })
}

export function useCreateOffice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: CreateOfficePayload) => officesApi.create(p),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Bureau créé') },
    onError:    (e: { response?: { data?: { error?: string } } }) =>
      toast.error(e.response?.data?.error ?? 'Erreur lors de la création'),
  })
}

export function useUpdateOffice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...p }: { id: string } & UpdateOfficePayload) => officesApi.update(id, p),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Bureau mis à jour') },
    onError:    () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteOffice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => officesApi.delete(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Bureau supprimé') },
    onError:    () => toast.error('Impossible de supprimer ce bureau'),
  })
}
