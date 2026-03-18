import { apiClient } from '@/lib/api-client'
import type {
  ReportRange, RevenueRow, ClientRevenueRow, CategoryRevenueRow,
  UnpaidRow, PaymentRow, TaxSummaryRow,
} from './types'

function buildParams(range: ReportRange, format: 'json' | 'csv' | 'pdf' = 'json') {
  const p: Record<string, string | number> = { format }
  if (range.year)     p.year     = range.year
  if (range.quarter)  p.quarter  = range.quarter
  if (range.dateFrom) p.dateFrom = range.dateFrom
  if (range.dateTo)   p.dateTo   = range.dateTo
  return p
}

export async function getRevenue(range: ReportRange): Promise<RevenueRow[]> {
  const { data } = await apiClient.get('/reports/revenue', { params: buildParams(range) })
  return data ?? []
}

export async function getRevenueByClient(range: ReportRange): Promise<ClientRevenueRow[]> {
  const { data } = await apiClient.get('/reports/by-client', { params: buildParams(range) })
  return data ?? []
}

export async function getRevenueByCategory(range: ReportRange): Promise<CategoryRevenueRow[]> {
  const { data } = await apiClient.get('/reports/by-category', { params: buildParams(range) })
  return data ?? []
}

export async function getUnpaid(range: ReportRange): Promise<UnpaidRow[]> {
  const { data } = await apiClient.get('/reports/unpaid', { params: buildParams(range) })
  return data ?? []
}

export async function getPayments(range: ReportRange): Promise<PaymentRow[]> {
  const { data } = await apiClient.get('/reports/payments', { params: buildParams(range) })
  return data ?? []
}

export async function getTaxSummary(range: ReportRange): Promise<TaxSummaryRow[]> {
  const { data } = await apiClient.get('/reports/tax-summary', { params: buildParams(range) })
  return data ?? []
}

export async function downloadCsv(endpoint: string, filename: string, range: ReportRange) {
  const res = await apiClient.get(`/reports/${endpoint}`, {
    params: buildParams(range, 'csv'),
    responseType: 'blob',
  })
  const url = URL.createObjectURL(new Blob([res.data]))
  const a   = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export async function downloadPdf(endpoint: string, filename: string, range: ReportRange) {
  const res = await apiClient.get(`/reports/${endpoint}`, {
    params: buildParams(range, 'pdf'),
    responseType: 'blob',
  })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const a   = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
