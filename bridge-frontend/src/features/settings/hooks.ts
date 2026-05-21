import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { settingsApi } from './api'
import type { UpdateSettingsPayload, AssetType } from './types'

const KEY = ['settings'] as const

export function useSettings() {
  return useQuery({
    queryKey:  KEY,
    queryFn:   settingsApi.get,
    staleTime: 120_000,
  })
}

/** Même hook, utilisé sur les pages non-authentifiées (login, 2FA, reset-password). */
export function usePublicSettings() {
  return useQuery({
    queryKey:  KEY,
    queryFn:   settingsApi.get,
    staleTime: 300_000,
    retry:     false,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateSettingsPayload) => settingsApi.update(payload),
    onSuccess:  (data) => {
      qc.setQueryData(KEY, data)
      toast.success('Paramètres enregistrés')
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast.error(e.response?.data?.error ?? 'Erreur lors de la sauvegarde')
    },
  })
}

export function useUploadAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ type, file }: { type: AssetType; file: File }) =>
      settingsApi.uploadAsset(type, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      toast.success('Fichier uploadé')
    },
    onError: () => toast.error('Erreur lors de l\'upload (max 2MB, PNG/JPEG/WebP)'),
  })
}
