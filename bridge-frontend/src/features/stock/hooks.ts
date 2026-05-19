import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as stockApi from './api'
import type { AdjustStockPayload, ListMovementsParams, ListLevelsParams } from './types'

export const STOCK_KEYS = {
  summary:        ['stock', 'summary']                                                   as const,
  levels:         (params?: ListLevelsParams)     => ['stock', 'levels', params]         as const,
  alerts:         ['stock', 'alerts']                                                    as const,
  movements:      (params?: ListMovementsParams)  => ['stock', 'movements', params]      as const,
  movement:       (id: string)                    => ['stock', 'movements', 'detail', id] as const,
  history:        (productId: string, page?: number, limit?: number) =>
    ['stock', 'history', productId, page, limit] as const,
}

export function useStockSummary() {
  return useQuery({
    queryKey:  STOCK_KEYS.summary,
    queryFn:   stockApi.getStockSummary,
    staleTime: 2 * 60 * 1000,
  })
}

export function useStockLevels(params?: ListLevelsParams) {
  return useQuery({
    queryKey: STOCK_KEYS.levels(params),
    queryFn:  () => stockApi.getStockLevels(params),
  })
}

export function useStockAlerts() {
  return useQuery({
    queryKey:  STOCK_KEYS.alerts,
    queryFn:   stockApi.getStockAlerts,
    staleTime: 60 * 1000,
  })
}

export function useStockMovements(params?: ListMovementsParams) {
  return useQuery({
    queryKey: STOCK_KEYS.movements(params),
    queryFn:  () => stockApi.listMovements(params),
  })
}

export function useStockMovement(id: string) {
  return useQuery({
    queryKey: STOCK_KEYS.movement(id),
    queryFn:  () => stockApi.getMovement(id),
    enabled:  !!id,
  })
}

export function useProductStockHistory(productId: string, page = 1, limit = 20) {
  return useQuery({
    queryKey: STOCK_KEYS.history(productId, page, limit),
    queryFn:  () => stockApi.getProductHistory(productId, page, limit),
    enabled:  !!productId,
  })
}

export function useAdjustStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AdjustStockPayload) => stockApi.adjustStock(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success('Mouvement de stock enregistré')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Erreur lors de l\'ajustement de stock')
    },
  })
}
