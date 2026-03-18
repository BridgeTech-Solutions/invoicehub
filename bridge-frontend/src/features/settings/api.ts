import apiClient from '@/lib/api-client'
import type { CompanySettings, UpdateSettingsPayload, AssetType } from './types'

export const settingsApi = {
  /** GET /settings */
  async get(): Promise<CompanySettings> {
    const { data } = await apiClient.get<CompanySettings>('/settings')
    return data
  },

  /** PUT /settings */
  async update(payload: UpdateSettingsPayload): Promise<CompanySettings> {
    const { data } = await apiClient.put<CompanySettings>('/settings', payload)
    return data
  },

  /** PUT /settings/assets/:type — multipart upload */
  async uploadAsset(type: AssetType, file: File): Promise<{ path: string }> {
    const form = new FormData()
    form.append('file', file)
    const { data } = await apiClient.put<{ path: string }>(`/settings/assets/${type}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
}
