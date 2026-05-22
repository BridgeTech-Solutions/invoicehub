import { apiClient } from '@/lib/api-client'
import type {
  SupplierInvoice, PaginatedSupplierInvoices, SupplierInvoiceStats,
  CreateSupplierInvoicePayload, UpdateSupplierInvoicePayload,
  ListSupplierInvoicesParams, RecordSupplierPaymentPayload,
} from './types'

export const supplierInvoicesApi = {
  list: (params?: ListSupplierInvoicesParams) =>
    apiClient.get<PaginatedSupplierInvoices>('/supplier-invoices', { params }).then(r => r.data),

  get: (id: string) =>
    apiClient.get<SupplierInvoice>(`/supplier-invoices/${id}`).then(r => r.data),

  stats: () =>
    apiClient.get<SupplierInvoiceStats>('/supplier-invoices/stats').then(r => r.data),

  create: (data: CreateSupplierInvoicePayload) =>
    apiClient.post<SupplierInvoice>('/supplier-invoices', data).then(r => r.data),

  update: (id: string, data: UpdateSupplierInvoicePayload) =>
    apiClient.put<SupplierInvoice>(`/supplier-invoices/${id}`, data).then(r => r.data),

  approve: (id: string) =>
    apiClient.post<SupplierInvoice>(`/supplier-invoices/${id}/approve`).then(r => r.data),

  recordPayment: (id: string, data: RecordSupplierPaymentPayload) =>
    apiClient.post<SupplierInvoice>(`/supplier-invoices/${id}/payments`, data).then(r => r.data),

  cancel: (id: string) =>
    apiClient.post<SupplierInvoice>(`/supplier-invoices/${id}/cancel`).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/supplier-invoices/${id}`),

  exportCsv: async (params?: ListSupplierInvoicesParams) => {
    const res = await apiClient.get('/supplier-invoices', {
      params: { ...params, export: 'csv', page: 1, limit: 10_000 },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a   = document.createElement('a')
    a.href = url; a.download = 'factures-fournisseurs.csv'; a.click()
    URL.revokeObjectURL(url)
  },
}
