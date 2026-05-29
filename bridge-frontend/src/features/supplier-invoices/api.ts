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
}
