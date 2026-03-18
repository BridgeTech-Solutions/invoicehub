import apiClient from '@/lib/api-client'
import type { Backup, PaginatedBackups, ListBackupsParams } from './types'

export const backupsApi = {
  async list(params: ListBackupsParams = {}): Promise<PaginatedBackups> {
    const { data } = await apiClient.get<PaginatedBackups>('/backups', { params })
    return data
  },
  async create(): Promise<Backup> {
    const { data } = await apiClient.post<Backup>('/backups')
    return data
  },
  async download(id: string, filename: string): Promise<void> {
    const res = await apiClient.get(`/backups/${id}/download`, { responseType: 'blob' })
    // If redirect (presigned URL), axios follows it automatically
    const url = URL.createObjectURL(res.data as Blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/backups/${id}`)
  },
}
