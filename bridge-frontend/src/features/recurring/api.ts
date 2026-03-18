import { apiClient } from '@/lib/api-client'
import type {
  RecurringTemplate, PaginatedRecurring,
  ListRecurringParams, CreateRecurringPayload, UpdateRecurringPayload,
} from './types'

export async function list(params?: ListRecurringParams): Promise<PaginatedRecurring> {
  const { data } = await apiClient.get('/recurring', { params })
  return data
}

export async function getById(id: string): Promise<RecurringTemplate> {
  const { data } = await apiClient.get(`/recurring/${id}`)
  return data
}

export async function create(payload: CreateRecurringPayload): Promise<RecurringTemplate> {
  const { data } = await apiClient.post('/recurring', payload)
  return data
}

export async function update(id: string, payload: UpdateRecurringPayload): Promise<RecurringTemplate> {
  const { data } = await apiClient.put(`/recurring/${id}`, payload)
  return data
}

export async function remove(id: string): Promise<void> {
  await apiClient.delete(`/recurring/${id}`)
}

export async function activate(id: string): Promise<RecurringTemplate> {
  const { data } = await apiClient.post(`/recurring/${id}/activate`)
  return data
}

export async function deactivate(id: string): Promise<RecurringTemplate> {
  const { data } = await apiClient.post(`/recurring/${id}/deactivate`)
  return data
}

export async function generate(id: string): Promise<{ id: string; number: string }> {
  const { data } = await apiClient.post(`/recurring/${id}/generate`)
  return data
}
