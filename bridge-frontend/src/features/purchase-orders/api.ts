import { apiClient } from '@/lib/api-client'
import type {
  PurchaseOrder, PaginatedPurchaseOrders, PurchaseOrderStats,
  CreatePurchaseOrderPayload, UpdatePurchaseOrderPayload, ListPurchaseOrdersParams,
  LinkedSupplierInvoice,
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

  send: (id: string) =>
    apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/send`).then(r => r.data),

  confirm: (id: string) =>
    apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/confirm`).then(r => r.data),

  receive: (id: string, data: { lines: { lineId: string; quantityReceived: number }[]; receivedDate?: string; notes?: string | null }) =>
    apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/receive`, data).then(r => r.data),

  close: (id: string) =>
    apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/close`).then(r => r.data),

  cancel: (id: string) =>
    apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/cancel`).then(r => r.data),

  duplicate: (id: string) =>
    apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/duplicate`).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/purchase-orders/${id}`),

  createSupplierInvoice: (id: string) =>
    apiClient.post<{ supplierInvoiceId: string; supplierInvoiceNumber: string }>(
      `/purchase-orders/${id}/create-supplier-invoice`
    ).then(r => r.data),

  getSupplierInvoices: (id: string) =>
    apiClient.get<LinkedSupplierInvoice[]>(`/purchase-orders/${id}/supplier-invoices`).then(r => r.data),

  downloadPdf: async (id: string, filename: string) => {
    const res = await apiClient.get(`/purchase-orders/${id}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    const a   = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  },

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
