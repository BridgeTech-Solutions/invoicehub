import { apiClient } from '@/lib/api-client'
import type {
  Invoice, InvoiceListItem, PaginatedInvoices, PaginatedPayments,
  CreateInvoicePayload, UpdateInvoicePayload, ListInvoicesParams,
  CancelInvoicePayload, CreateAvoirPayload, ComputeInvoicePayload, ComputeResult,
  CreatePaymentPayload, ListPaymentsParams, Payment,
} from './types'

export interface AuditLogEntry {
  id:         string
  action:     string
  entityType: string | null
  entityId:   string | null
  before:     unknown
  after:      unknown
  ipAddress:  string | null
  createdAt:  string
  user:       { id: string; firstName: string; lastName: string; email: string } | null
}

export const invoicesApi = {
  // ─── Invoices CRUD ─────────────────────────────────────────
  list: (params?: ListInvoicesParams) =>
    apiClient.get<PaginatedInvoices>('/invoices', { params }).then(r => r.data),

  get: (id: string) =>
    apiClient.get<Invoice>(`/invoices/${id}`).then(r => r.data),

  create: (data: CreateInvoicePayload) =>
    apiClient.post<Invoice>('/invoices', data).then(r => r.data),

  update: (id: string, data: UpdateInvoicePayload) =>
    apiClient.put<Invoice>(`/invoices/${id}`, data).then(r => r.data),

  // ─── Lifecycle actions ──────────────────────────────────────
  issue: (id: string) =>
    apiClient.post<Invoice>(`/invoices/${id}/issue`).then(r => r.data),

  cancel: (id: string, data?: CancelInvoicePayload) =>
    apiClient.post<Invoice>(`/invoices/${id}/cancel`, data).then(r => r.data),

  duplicate: (id: string) =>
    apiClient.post<Invoice>(`/invoices/${id}/duplicate`).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/invoices/${id}`),

  // ─── Avoir ──────────────────────────────────────────────────
  createAvoir: (id: string, data: CreateAvoirPayload) =>
    apiClient.post<Invoice>(`/invoices/${id}/avoir`, data).then(r => r.data),

  // ─── Compute dry-run ────────────────────────────────────────
  compute: (data: ComputeInvoicePayload) =>
    apiClient.post<ComputeResult>('/invoices/compute', data).then(r => r.data),

  // ─── PDF ────────────────────────────────────────────────────
  downloadPdf: async (id: string, filename: string) => {
    const res = await apiClient.get(`/invoices/${id}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    const a   = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  },

  // ─── Export CSV ─────────────────────────────────────────────
  exportCsv: async (params?: ListInvoicesParams) => {
    const res = await apiClient.get('/invoices', { params: { ...params, export: 'csv', page: 1, limit: 10_000 }, responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a   = document.createElement('a')
    a.href = url; a.download = 'factures.csv'; a.click()
    URL.revokeObjectURL(url)
  },

  // ─── Counts par statut ──────────────────────────────────────
  counts: () =>
    apiClient.get<Record<string, number>>('/invoices/counts').then(r => r.data),

  // ─── Audit history ──────────────────────────────────────────
  getHistory: (id: string) =>
    apiClient.get<AuditLogEntry[]>(`/invoices/${id}/history`).then(r => r.data),

  // ─── Payments (nested under invoice) ───────────────────────
  createPayment: (invoiceId: string, data: CreatePaymentPayload) =>
    apiClient.post<Payment>(`/invoices/${invoiceId}/payment`, data).then(r => r.data),
}

export const paymentsApi = {
  list: (params?: ListPaymentsParams) =>
    apiClient.get<PaginatedPayments>('/payments', { params }).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/payments/${id}`),

  downloadReceipt: async (id: string, filename: string) => {
    const res = await apiClient.get(`/payments/${id}/receipt`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    const a   = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  },
}
