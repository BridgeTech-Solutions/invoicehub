import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiKeysApi, webhooksApi, customFieldsApi, ipWhitelistApi, exportsApi } from './api'
import type {
  CreateApiKeyPayload,
  CreateWebhookPayload, UpdateWebhookPayload,
  CreateCustomFieldPayload, CustomFieldEntityType,
  CreateIpWhitelistPayload,
  CreateExportPayload, ExportJob,
} from './types'

// ── Clés API ──────────────────────────────────────────────────────
const API_KEYS_KEY = ['api-keys'] as const

export function useApiKeys() {
  return useQuery({
    queryKey:  API_KEYS_KEY,
    queryFn:   apiKeysApi.list,
    staleTime: 60_000,
  })
}

export function useCreateApiKey() {
  return useMutation({
    mutationFn: (payload: CreateApiKeyPayload) => apiKeysApi.create(payload),
    onError: () => toast.error('Erreur lors de la création de la clé API'),
  })
}

export function useRevokeApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: API_KEYS_KEY })
      toast.success('Clé API révoquée')
    },
    onError: () => toast.error('Impossible de révoquer cette clé'),
  })
}

// ── Webhooks ──────────────────────────────────────────────────────
const WEBHOOKS_KEY = ['webhooks'] as const

export function useWebhooks() {
  return useQuery({
    queryKey:  WEBHOOKS_KEY,
    queryFn:   webhooksApi.list,
    staleTime: 60_000,
  })
}

export function useWebhook(id: string) {
  return useQuery({
    queryKey:  [...WEBHOOKS_KEY, id],
    queryFn:   () => webhooksApi.getOne(id),
    staleTime: 30_000,
    enabled:   !!id,
  })
}

export function useCreateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateWebhookPayload) => webhooksApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WEBHOOKS_KEY })
      toast.success('Webhook créé')
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      toast.error(e.response?.data?.error ?? 'Erreur lors de la création'),
  })
}

export function useUpdateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & UpdateWebhookPayload) =>
      webhooksApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WEBHOOKS_KEY })
      toast.success('Webhook mis à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WEBHOOKS_KEY })
      toast.success('Webhook supprimé')
    },
    onError: () => toast.error('Impossible de supprimer ce webhook'),
  })
}

// ── Champs personnalisés ──────────────────────────────────────────
const CF_KEY = ['custom-fields'] as const

export function useCustomFields(entityType?: CustomFieldEntityType) {
  return useQuery({
    queryKey:  [...CF_KEY, entityType],
    queryFn:   () => customFieldsApi.list(entityType),
    staleTime: 120_000,
  })
}

export function useCreateCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateCustomFieldPayload) => customFieldsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CF_KEY })
      toast.success('Champ créé')
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      toast.error(e.response?.data?.error ?? 'Erreur lors de la création'),
  })
}

export function useDeleteCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => customFieldsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CF_KEY })
      toast.success('Champ supprimé')
    },
    onError: () => toast.error('Impossible de supprimer ce champ'),
  })
}

// ── IP Whitelist ──────────────────────────────────────────────────
const IP_KEY = ['ip-whitelist'] as const

export function useIpWhitelist() {
  return useQuery({
    queryKey:  IP_KEY,
    queryFn:   ipWhitelistApi.list,
    staleTime: 60_000,
  })
}

export function useAddIp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateIpWhitelistPayload) => ipWhitelistApi.add(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: IP_KEY })
      toast.success('IP ajoutée à la liste blanche')
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      toast.error(e.response?.data?.error ?? 'Erreur lors de l\'ajout'),
  })
}

export function useRemoveIp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ipWhitelistApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: IP_KEY })
      toast.success('IP supprimée')
    },
    onError: () => toast.error('Impossible de supprimer cette IP'),
  })
}

// ── Export Jobs ───────────────────────────────────────────────────
const EXPORTS_KEY = ['exports'] as const

export function useExports() {
  return useQuery({
    queryKey: EXPORTS_KEY,
    queryFn:  exportsApi.list,
    staleTime: 0,
    refetchInterval: (query) => {
      const jobs = query.state.data as ExportJob[] | undefined
      const hasPending = jobs?.some(
        (j) => j.status === 'pending' || j.status === 'processing',
      )
      return hasPending ? 5_000 : false
    },
  })
}

export function useCreateExport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateExportPayload) => exportsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXPORTS_KEY })
      toast.success('Export lancé — vous serez notifié quand il sera prêt')
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      toast.error(e.response?.data?.error ?? 'Erreur lors du lancement de l\'export'),
  })
}

export function useDownloadExport() {
  return useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      exportsApi.download(id, filename),
    onError: () => toast.error('Erreur lors du téléchargement'),
  })
}
