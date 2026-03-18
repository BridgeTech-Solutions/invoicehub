import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { auditApi } from './api'
import type { ListAuditLogsParams } from './types'

const KEYS = {
  all:   ['audit'] as const,
  list:  (p: ListAuditLogsParams) => ['audit', 'list', p] as const,
  stats: ['audit', 'stats'] as const,
}

export function useAuditLogs(params: ListAuditLogsParams = {}) {
  return useQuery({
    queryKey:  KEYS.list(params),
    queryFn:   () => auditApi.list(params),
    staleTime: 30_000,
  })
}

export function useAuditStats() {
  return useQuery({
    queryKey:  KEYS.stats,
    queryFn:   auditApi.getStats,
    staleTime: 120_000,
  })
}

export function useExportAuditCsv() {
  return useMutation({
    mutationFn: (params: Omit<ListAuditLogsParams, 'export' | 'page' | 'limit'>) =>
      auditApi.exportCsv(params),
    onSuccess: () => toast.success('Export CSV téléchargé'),
    onError:   () => toast.error('Erreur lors de l\'export'),
  })
}
