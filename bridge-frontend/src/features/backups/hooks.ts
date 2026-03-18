import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { backupsApi } from './api'
import type { ListBackupsParams } from './types'

const KEY = ['backups'] as const

export function useBackups(params: ListBackupsParams = {}) {
  return useQuery({
    queryKey:           [...KEY, params],
    queryFn:            () => backupsApi.list(params),
    staleTime:          10_000,
    refetchInterval:    (query) => {
      // Poll every 5s if any backup is running/pending
      const data = query.state.data
      const hasActive = data?.data.some((b) => b.status === 'pending' || b.status === 'running')
      return hasActive ? 5_000 : false
    },
  })
}

export function useCreateBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => backupsApi.create(),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: KEY })
      toast.success('Sauvegarde en cours de création…')
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      toast.error(e.response?.data?.error ?? 'Erreur lors du déclenchement de la sauvegarde'),
  })
}

export function useDownloadBackup() {
  return useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      backupsApi.download(id, filename),
    onSuccess: () => toast.success('Téléchargement démarré'),
    onError:   () => toast.error('Erreur lors du téléchargement'),
  })
}

export function useDeleteBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => backupsApi.delete(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: KEY })
      toast.success('Sauvegarde supprimée')
    },
    onError: () => toast.error('Impossible de supprimer cette sauvegarde'),
  })
}
