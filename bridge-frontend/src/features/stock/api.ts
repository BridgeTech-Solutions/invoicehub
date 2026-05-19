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
