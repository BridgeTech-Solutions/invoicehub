import { apiClient } from '@/lib/api-client'
import type {
  Supplier, SupplierListItem, PaginatedSuppliers,
  CreateSupplierPayload, UpdateSupplierPayload, ListSuppliersParams,
} from './types'

export const suppliersApi = {
  list: (params?: ListSuppliersParams) =>
    apiClient.get<PaginatedSuppliers>('/suppliers', { params }).then(r => r.data),

  get: (id: string) =>
    apiClient.get<Supplier>(`/suppliers/${id}`).then(r => r.data),

  create: (data: CreateSupplierPayload) =>
    apiClient.post<Supplier>('/suppliers', data).then(r => r.data),

  update: (id: string, data: UpdateSupplierPayload) =>
    apiClient.put<Supplier>(`/suppliers/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/suppliers/${id}`),

  exportCsv: async (params?: ListSuppliersParams) => {
    const res = await apiClient.get('/suppliers', {
      params: { ...params, export: 'csv', page: 1, limit: 10_000 },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a   = document.createElement('a')
    a.href = url; a.download = 'fournisseurs.csv'; a.click()
    URL.revokeObjectURL(url)
  },
}
