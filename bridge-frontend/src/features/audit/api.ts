import apiClient from '@/lib/api-client'
import type { AuditLog, AuditStats, PaginatedAuditLogs, ListAuditLogsParams } from './types'

export const auditApi = {
  /** GET /audit-logs — liste paginée avec filtres */
  async list(params: ListAuditLogsParams = {}): Promise<PaginatedAuditLogs> {
    const { data } = await apiClient.get<PaginatedAuditLogs>('/audit-logs', { params })
    return data
  },

  /** GET /audit-logs/stats */
  async getStats(): Promise<AuditStats> {
    const { data } = await apiClient.get<AuditStats>('/audit-logs/stats')
    return data
  },

  /** GET /audit-logs?export=csv — téléchargement CSV */
  async exportCsv(params: Omit<ListAuditLogsParams, 'export' | 'page' | 'limit'>): Promise<void> {
    const res = await apiClient.get('/audit-logs', {
      params:       { ...params, export: 'csv' },
      responseType: 'blob',
    })
    const url  = URL.createObjectURL(res.data as Blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
