import { apiClient } from '@/lib/api-client'
import type {
  Proforma, PaginatedProformas,
  CreateProformaPayload, UpdateProformaPayload,
  ListProformasParams, ConvertToInvoicePayload,
} from './types'

export const proformasApi = {
  list: (params?: ListProformasParams) =>
    apiClient.get<PaginatedProformas>('/proformas', { params }).then(r => r.data),

  get: (id: string) =>
    apiClient.get<Proforma>(`/proformas/${id}`).then(r => r.data),

  create: (data: CreateProformaPayload) =>
    apiClient.post<Proforma>('/proformas', data).then(r => r.data),

  update: (id: string, data: UpdateProformaPayload) =>
    apiClient.put<Proforma>(`/proformas/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/proformas/${id}`),

  send: (id: string) =>
    apiClient.post<Proforma>(`/proformas/${id}/send`).then(r => r.data),

  accept: (id: string) =>
    apiClient.post<Proforma>(`/proformas/${id}/accept`).then(r => r.data),

  reject: (id: string, reason?: string) =>
    apiClient.post<Proforma>(`/proformas/${id}/reject`, { reason }).then(r => r.data),

  convert: (id: string, data: ConvertToInvoicePayload) =>
    apiClient.post<{ id: string }>(`/proformas/${id}/convert`, data).then(r => r.data),

  duplicate: (id: string) =>
    apiClient.post<Proforma>(`/proformas/${id}/duplicate`).then(r => r.data),

  counts: () =>
    apiClient.get<Record<string, number>>('/proformas/counts').then(r => r.data),

  exportCsv: async (params?: ListProformasParams) => {
    const res = await apiClient.get('/proformas', { params: { ...params, export: 'csv', page: 1, limit: 10_000 }, responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a   = document.createElement('a')
    a.href = url; a.download = 'proformas.csv'; a.click()
    URL.revokeObjectURL(url)
  },

  downloadPdf: async (id: string, filename: string) => {
    const res = await apiClient.get(`/proformas/${id}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    const a   = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  },
}
