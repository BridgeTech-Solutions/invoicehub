import { apiClient } from '@/lib/api-client'
import type {
  StockSummary,
  StockAlert,
  PaginatedStockLevels,
  PaginatedMovements,
  StockMovement,
  ProductStockHistory,
  AdjustStockPayload,
  ListMovementsParams,
  ListLevelsParams,
  InventorySessionListItem,
  InventorySessionDetail,
  CreateInventoryPayload,
  SaveCountsPayload,
} from './types'

export async function getStockSummary(): Promise<StockSummary> {
  const { data } = await apiClient.get('/stock/summary')
  return data
}

export async function getStockLevels(params?: ListLevelsParams): Promise<PaginatedStockLevels> {
  const { data } = await apiClient.get('/stock/levels', { params })
  return data
}

export async function getStockAlerts(): Promise<StockAlert[]> {
  const { data } = await apiClient.get('/stock/alerts')
  return data
}

export async function listMovements(params?: ListMovementsParams): Promise<PaginatedMovements> {
  const { data } = await apiClient.get('/stock/movements', { params })
  return data
}

export async function getMovement(id: string): Promise<StockMovement> {
  const { data } = await apiClient.get(`/stock/movements/${id}`)
  return data
}

export async function adjustStock(payload: AdjustStockPayload): Promise<StockMovement> {
  const { data } = await apiClient.post('/stock/movements/adjust', payload)
  return data
}

export async function getProductHistory(productId: string, page = 1, limit = 20): Promise<ProductStockHistory> {
  const { data } = await apiClient.get(`/stock/levels/${productId}/history`, { params: { page, limit } })
  return data
}

export async function reverseMovement(id: string, reason?: string): Promise<StockMovement> {
  const { data } = await apiClient.post(`/stock/movements/${id}/reverse`, { reason: reason || undefined })
  return data
}

// ─── Inventaire physique ──────────────────────────────────────
export async function listInventory(): Promise<InventorySessionListItem[]> {
  const { data } = await apiClient.get('/stock/inventory')
  return data
}

export async function getInventory(id: string): Promise<InventorySessionDetail> {
  const { data } = await apiClient.get(`/stock/inventory/${id}`)
  return data
}

export async function createInventory(payload: CreateInventoryPayload): Promise<{ id: string; reference: string }> {
  const { data } = await apiClient.post('/stock/inventory', payload)
  return data
}

export async function saveCounts(id: string, payload: SaveCountsPayload): Promise<InventorySessionDetail> {
  const { data } = await apiClient.put(`/stock/inventory/${id}/counts`, payload)
  return data
}

export async function validateInventory(id: string): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.post(`/stock/inventory/${id}/validate`)
  return data
}

export async function cancelInventory(id: string): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.post(`/stock/inventory/${id}/cancel`)
  return data
}
