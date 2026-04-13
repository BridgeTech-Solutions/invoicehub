import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import * as clientsApi from './api'
import { ROUTES } from '@/lib/constants'
import type { ListClientsParams, CreateClientPayload, UpdateClientPayload, ImportClientRow } from './types'

export const CLIENTS_KEYS = {
  list:      (params?: ListClientsParams) => ['clients', 'list', params] as const,
  detail:    (id: string)                 => ['clients', 'detail', id]   as const,
  summary:   (id: string)                 => ['clients', 'summary', id]  as const,
  quickFill: (id: string)                 => ['clients', 'quick-fill', id] as const,
}

export function useClients(params?: ListClientsParams) {
  return useQuery({
    queryKey: CLIENTS_KEYS.list(params),
    queryFn:  () => clientsApi.listClients(params),
    staleTime: 30_000,
  })
}

export function useClient(id: string) {
  return useQuery({
    queryKey: CLIENTS_KEYS.detail(id),
    queryFn:  () => clientsApi.getClient(id),
    enabled:  !!id,
    staleTime: 30_000,
  })
}

export function useClientSummary(id: string) {
  return useQuery({
    queryKey: CLIENTS_KEYS.summary(id),
    queryFn:  () => clientsApi.getClientSummary(id),
    enabled:  !!id,
    staleTime: 2 * 60 * 1000,
  })
}

export function useClientQuickFill(id: string) {
  return useQuery({
    queryKey: CLIENTS_KEYS.quickFill(id),
    queryFn:  () => clientsApi.getClientQuickFill(id),
    enabled:  !!id,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateClient() {
  const qc     = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: (payload: CreateClientPayload) => clientsApi.createClient(payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success(`Client "${data.name}" créé`)
      router.push(`${ROUTES.CLIENTS}/${data.id}`)
    },
    onError: () => toast.error('Erreur lors de la création du client'),
  })
}

export function useUpdateClient(id: string) {
  const qc     = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: (payload: UpdateClientPayload) => clientsApi.updateClient(id, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success(`Client "${data.name}" mis à jour`)
      router.push(`${ROUTES.CLIENTS}/${id}`)
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useArchiveClient() {
  const qc     = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: (id: string) => clientsApi.archiveClient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Client archivé')
      router.push(ROUTES.CLIENTS)
    },
    onError: () => toast.error('Erreur lors de l\'archivage'),
  })
}


export function useImportClients() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: ImportClientRow[]) => clientsApi.importClients(rows),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      if (result.created > 0) {
        toast.success(`${result.created} client${result.created > 1 ? 's' : ''} importé${result.created > 1 ? 's' : ''}`)
      }
    },
    onError: () => toast.error("Erreur lors de l'import"),
  })
}
