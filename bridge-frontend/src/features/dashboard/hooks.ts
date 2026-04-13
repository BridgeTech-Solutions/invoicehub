import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSocket } from '@/hooks/useSocket'
import * as dashboardApi from './api'

export const DASHBOARD_KEYS = {
  kpis:     ['dashboard', 'kpis']     as const,
  aging:    ['dashboard', 'aging']    as const,
  cashflow: ['dashboard', 'cashflow'] as const,
}

// ─── KPI data ──────────────────────────────────────────────────
// Pas de staleTime côté frontend : le backend invalide via Socket.io + Redis.
// refetchOnWindowFocus garantit une mise à jour quand l'onglet reprend le focus.
export function useDashboardKpis() {
  return useQuery({
    queryKey: DASHBOARD_KEYS.kpis,
    queryFn:  dashboardApi.getKpis,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}

// ─── Aging report ──────────────────────────────────────────────
export function useDashboardAging() {
  return useQuery({
    queryKey: DASHBOARD_KEYS.aging,
    queryFn:  dashboardApi.getAging,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}

// ─── Cashflow forecast (30 jours) ──────────────────────────────
export function useCashflowForecast() {
  return useQuery({
    queryKey: DASHBOARD_KEYS.cashflow,
    queryFn:  dashboardApi.getCashflowForecast,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}

// ─── Socket sync — invalide le cache quand le backend push ─────
export function useDashboardSocketSync(onRefresh?: () => void) {
  const qc = useQueryClient()
  useSocket('dashboard:refresh', () => {
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    onRefresh?.()
  })
}
