import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as stockApi from './api'
import type { AdjustStockPayload, ListMovementsParams, ListLevelsParams, CreateInventoryPayload, SaveCountsPayload } from './types'

export const STOCK_KEYS = {
  summary:        ['stock', 'summary']                                                   as const,
  levels:         (params?: ListLevelsParams)     => ['stock', 'levels', params]         as const,
  alerts:         ['stock', 'alerts']                                                    as const,
  movements:      (params?: ListMovementsParams)  => ['stock', 'movements', params]      as const,
  movement:       (id: string)                    => ['stock', 'movements', 'detail', id] as const,
  history:        (productId: string, page?: number, limit?: number) =>
    ['stock', 'history', productId, page, limit] as const,
  inventory:      ['stock', 'inventory']                                                 as const,
  inventorySession: (id: string)                  => ['stock', 'inventory', id]          as const,
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

export function useReverseMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => stockApi.reverseMovement(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success('Mouvement contre-passé')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Contre-passation impossible')
    },
  })
}

// ─── Inventaire physique ──────────────────────────────────────
const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

export function useInventorySessions() {
  return useQuery({ queryKey: STOCK_KEYS.inventory, queryFn: stockApi.listInventory })
}

export function useInventorySession(id: string) {
  return useQuery({
    queryKey: STOCK_KEYS.inventorySession(id),
    queryFn:  () => stockApi.getInventory(id),
    enabled:  !!id,
  })
}

export function useCreateInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateInventoryPayload) => stockApi.createInventory(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STOCK_KEYS.inventory })
      toast.success('Session d\'inventaire créée')
    },
    onError: (err: unknown) => toast.error(errMsg(err, 'Création impossible')),
  })
}

export function useSaveCounts(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: SaveCountsPayload) => stockApi.saveCounts(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STOCK_KEYS.inventorySession(id) })
      toast.success('Comptage enregistré')
    },
    onError: (err: unknown) => toast.error(errMsg(err, 'Enregistrement impossible')),
  })
}

export function useValidateInventory(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => stockApi.validateInventory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success('Inventaire validé — stock recalé')
    },
    onError: (err: unknown) => toast.error(errMsg(err, 'Validation impossible')),
  })
}

export function useCancelInventory(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => stockApi.cancelInventory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success('Session annulée')
    },
    onError: (err: unknown) => toast.error(errMsg(err, 'Annulation impossible')),
  })
}
