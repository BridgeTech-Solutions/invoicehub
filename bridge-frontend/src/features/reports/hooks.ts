'use client'

import { useQuery } from '@tanstack/react-query'
import * as reportsApi from './api'
import type { ReportRange } from './types'

export const REPORT_KEYS = {
  revenue:    (r: ReportRange) => ['reports', 'revenue',    r] as const,
  byClient:   (r: ReportRange) => ['reports', 'by-client',  r] as const,
  byCategory: (r: ReportRange) => ['reports', 'by-category',r] as const,
  unpaid:     (r: ReportRange) => ['reports', 'unpaid',     r] as const,
  payments:   (r: ReportRange) => ['reports', 'payments',   r] as const,
  taxSummary: (r: ReportRange) => ['reports', 'tax-summary',r] as const,
  byMethod:   (r: ReportRange) => ['reports', 'by-method',  r] as const,
  aging:      (r: ReportRange) => ['reports', 'aging',      r] as const,
}

export function useRevenue(range: ReportRange) {
  return useQuery({
    queryKey: REPORT_KEYS.revenue(range),
    queryFn:  () => reportsApi.getRevenue(range),
    staleTime: 60_000,
  })
}

export function useRevenueByClient(range: ReportRange) {
  return useQuery({
    queryKey: REPORT_KEYS.byClient(range),
    queryFn:  () => reportsApi.getRevenueByClient(range),
    staleTime: 60_000,
  })
}

export function useRevenueByCategory(range: ReportRange) {
  return useQuery({
    queryKey: REPORT_KEYS.byCategory(range),
    queryFn:  () => reportsApi.getRevenueByCategory(range),
    staleTime: 60_000,
  })
}

export function useUnpaid(range: ReportRange) {
  return useQuery({
    queryKey: REPORT_KEYS.unpaid(range),
    queryFn:  () => reportsApi.getUnpaid(range),
    staleTime: 60_000,
  })
}

export function usePayments(range: ReportRange) {
  return useQuery({
    queryKey: REPORT_KEYS.payments(range),
    queryFn:  () => reportsApi.getPayments(range),
    staleTime: 60_000,
  })
}

export function useTaxSummary(range: ReportRange) {
  return useQuery({
    queryKey: REPORT_KEYS.taxSummary(range),
    queryFn:  () => reportsApi.getTaxSummary(range),
    staleTime: 60_000,
  })
}

export function useByMethod(range: ReportRange) {
  return useQuery({
    queryKey: REPORT_KEYS.byMethod(range),
    queryFn:  () => reportsApi.getByMethod(range),
    staleTime: 60_000,
  })
}

export function useAging(range: ReportRange) {
  return useQuery({
    queryKey: REPORT_KEYS.aging(range),
    queryFn:  () => reportsApi.getAging(range),
    staleTime: 60_000,
  })
}
