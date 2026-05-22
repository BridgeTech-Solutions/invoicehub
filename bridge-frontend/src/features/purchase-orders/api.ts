import { apiClient } from '@/lib/api-client'
import type {
  PurchaseOrder, PaginatedPurchaseOrders, PurchaseOrderStats,
  CreatePurchaseOrderPayload, UpdatePurchaseOrderPayload, ListPurchaseOrdersParams,
} from './types'

export const purchaseOrdersApi = {
  list: (params?: ListPurchaseOrdersParams) =>
    apiClient.get<PaginatedPurchaseOrders>('/purchase-orders', { params }).then(r => r.data),

  get: (id: string) =>
    apiClient.get<PurchaseOrder>(`/purchase-orders/${id}`).then(r => r.data),

  stats: () =>
    apiClient.get<PurchaseOrderStats>('/purchase-orders/stats').then(r => r.data),

  create: (data: CreatePurchaseOrderPayload) =>
    apiClient.post<PurchaseOrder>('/purchase-orders', data).then(r => r.data),

  update: (id: string, data: UpdatePurchaseOrderPayload) =>
    apiClient.put<PurchaseOrder>(`/purchase-orders/${id}`, data).then(r => r.data),

  approve: (id: string) =>
    apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/approve`).then(r => r.data),

  receive: (id: string, data?: { receivedDate?: string; notes?: string }) =>
    apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/receive`, data).then(r => r.data),

  cancel: (id: string) =>
    apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/cancel`).then(r => r.data),

  duplicate: (id: string) =>
    apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/duplicate`).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/purchase-orders/${id}`),

  exportCsv: async (params?: ListPurchaseOrdersParams) => {
    const res = await apiClient.get('/purchase-orders', {
      params: { ...params, export: 'csv', page: 1, limit: 10_000 },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a   = document.createElement('a')
    a.href = url; a.download = 'bons-de-commande.csv'; a.click()
    URL.revokeObjectURL(url)
  },
}
