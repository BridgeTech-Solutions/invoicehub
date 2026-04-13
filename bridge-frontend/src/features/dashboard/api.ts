import { apiClient } from '@/lib/api-client'
import type { DashboardKpis, DashboardAging, CashflowDay } from './types'

export async function getKpis(): Promise<DashboardKpis> {
  const { data } = await apiClient.get('/dashboard/kpis')
  return data
}

export async function getAging(): Promise<DashboardAging> {
  const { data } = await apiClient.get('/dashboard/aging')
  return data
}

export async function getCashflowForecast(): Promise<CashflowDay[]> {
  const { data } = await apiClient.get('/dashboard/cashflow')
  return data
}
