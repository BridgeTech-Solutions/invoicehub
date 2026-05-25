import apiClient from '@/lib/api-client'
import type {
  ApiKey, CreateApiKeyPayload,
  Webhook, CreateWebhookPayload, UpdateWebhookPayload,
  CustomField, CreateCustomFieldPayload, CustomFieldEntityType,
  IpWhitelistEntry, CreateIpWhitelistPayload,
  ExportJob, CreateExportPayload,
} from './types'

// ── Clés API ──────────────────────────────────────────────────────
export const apiKeysApi = {
  list: async (): Promise<ApiKey[]> => {
    const { data } = await apiClient.get<ApiKey[]>('/api-keys')
    return data
  },

  create: async (payload: CreateApiKeyPayload): Promise<{ data: ApiKey & { rawKey: string }; warning: string }> => {
    const { data } = await apiClient.post<{ data: ApiKey & { rawKey: string }; warning: string }>('/api-keys', payload)
    return data
  },

  revoke: async (id: string): Promise<void> => {
    await apiClient.delete(`/api-keys/${id}`)
  },
}

// ── Webhooks ──────────────────────────────────────────────────────
export const webhooksApi = {
  list: async (): Promise<Webhook[]> => {
    const { data } = await apiClient.get<Webhook[]>('/webhooks')
    return data
  },

  getOne: async (id: string): Promise<Webhook> => {
    const { data } = await apiClient.get<Webhook>(`/webhooks/${id}`)
    return data
  },

  create: async (payload: CreateWebhookPayload): Promise<Webhook> => {
    const { data } = await apiClient.post<Webhook>('/webhooks', payload)
    return data
  },

  update: async (id: string, payload: UpdateWebhookPayload): Promise<Webhook> => {
    const { data } = await apiClient.put<Webhook>(`/webhooks/${id}`, payload)
    return data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/webhooks/${id}`)
  },
}

// ── Champs personnalisés ──────────────────────────────────────────
export const customFieldsApi = {
  list: async (entityType?: CustomFieldEntityType): Promise<CustomField[]> => {
    const { data } = await apiClient.get<CustomField[]>('/custom-fields', {
      params: entityType ? { entityType } : {},
    })
    return data
  },

  create: async (payload: CreateCustomFieldPayload): Promise<CustomField> => {
    const { data } = await apiClient.post<CustomField>('/custom-fields', payload)
    return data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/custom-fields/${id}`)
  },
}

// ── IP Whitelist ──────────────────────────────────────────────────
export const ipWhitelistApi = {
  list: async (): Promise<IpWhitelistEntry[]> => {
    const { data } = await apiClient.get<IpWhitelistEntry[]>('/ip-whitelist')
    return data
  },

  add: async (payload: CreateIpWhitelistPayload): Promise<IpWhitelistEntry> => {
    const { data } = await apiClient.post<IpWhitelistEntry>('/ip-whitelist', payload)
    return data
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/ip-whitelist/${id}`)
  },
}

// ── Export Jobs ───────────────────────────────────────────────────
export const exportsApi = {
  list: async (): Promise<ExportJob[]> => {
    const { data } = await apiClient.get<ExportJob[]>('/exports')
    return data
  },

  getOne: async (id: string): Promise<ExportJob> => {
    const { data } = await apiClient.get<ExportJob>(`/exports/${id}`)
    return data
  },

  create: async (payload: CreateExportPayload): Promise<ExportJob> => {
    const { data } = await apiClient.post<ExportJob>('/exports', payload)
    return data
  },

  download: async (id: string, filename: string): Promise<void> => {
    const response = await apiClient.get(`/exports/${id}/download`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(response.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },
}
