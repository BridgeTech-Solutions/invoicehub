import { apiClient } from '@/lib/api-client'
import type {
  SupplierInvoice, PaginatedSupplierInvoices,
  CreateSupplierInvoicePayload, UpdateSupplierInvoicePayload,
  ListSupplierInvoicesParams, RecordSupplierPaymentPayload,
} from './types'

export const supplierInvoicesApi = {
  list: (params?: ListSupplierInvoicesParams) =>
    apiClient.get<PaginatedSupplierInvoices>('/supplier-invoices', { params }).then(r => r.data),

  get: (id: string) =>
    apiClient.get<SupplierInvoice>(`/supplier-invoices/${id}`).then(r => r.data),

  create: (data: CreateSupplierInvoicePayload) =>
    apiClient.post<SupplierInvoice>('/supplier-invoices', data).then(r => r.data),

  update: (id: string, data: UpdateSupplierInvoicePayload) =>
    apiClient.put<SupplierInvoice>(`/supplier-invoices/${id}`, data).then(r => r.data),

  validate: (id: string) =>
    apiClient.post<SupplierInvoice>(`/supplier-invoices/${id}/validate`).then(r => r.data),

  dispute: (id: string, reason: string) =>
    apiClient.post<SupplierInvoice>(`/supplier-invoices/${id}/dispute`, { reason }).then(r => r.data),

  pay: (id: string, data: RecordSupplierPaymentPayload) =>
    apiClient.post<SupplierInvoice>(`/supplier-invoices/${id}/pay`, data).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/supplier-invoices/${id}`),

  // ─── Document original du fournisseur (pièce jointe) ────────
  // Une FF est un document REÇU : on ne génère pas de PDF, on stocke le justificatif.
  uploadAttachment: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<{ message: string }>(`/supplier-invoices/${id}/attachment`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  downloadAttachment: async (id: string, filename: string) => {
    const res  = await apiClient.get(`/supplier-invoices/${id}/attachment`, { responseType: 'blob' })
    const type = (res.data as Blob).type || 'application/octet-stream'
    const url  = URL.createObjectURL(new Blob([res.data], { type }))
    const a    = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  },

  deleteAttachment: (id: string) =>
    apiClient.delete(`/supplier-invoices/${id}/attachment`).then(r => r.data),
}
