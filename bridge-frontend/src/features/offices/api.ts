import apiClient from '@/lib/api-client'
import type { Office, CreateOfficePayload, UpdateOfficePayload } from './types'

export const officesApi = {
  async list(): Promise<Office[]> {
    const { data } = await apiClient.get<Office[]>('/offices')
    return data
  },
  async create(payload: CreateOfficePayload): Promise<Office> {
    const { data } = await apiClient.post<Office>('/offices', payload)
    return data
  },
  async update(id: string, payload: UpdateOfficePayload): Promise<Office> {
    const { data } = await apiClient.patch<Office>(`/offices/${id}`, payload)
    return data
  },
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/offices/${id}`)
  },
}
