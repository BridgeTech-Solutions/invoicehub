import apiClient from '@/lib/api-client'
import type { TaxRate, CreateTaxRatePayload, UpdateTaxRatePayload } from './types'

export const taxRatesApi = {
  async list(includeInactive = false): Promise<TaxRate[]> {
    const { data } = await apiClient.get<TaxRate[]>('/tax-rates', {
      params: includeInactive ? { includeInactive: true } : {},
    })
    return data
  },
  async create(payload: CreateTaxRatePayload): Promise<TaxRate> {
    const { data } = await apiClient.post<TaxRate>('/tax-rates', payload)
    return data
  },
  async update(id: string, payload: UpdateTaxRatePayload): Promise<TaxRate> {
    const { data } = await apiClient.patch<TaxRate>(`/tax-rates/${id}`, payload)
    return data
  },
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/tax-rates/${id}`)
  },
}
