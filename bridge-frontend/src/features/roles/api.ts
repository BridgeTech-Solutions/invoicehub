import apiClient from '@/lib/api-client'
import type { RoleEntry, RoleDetail, CreateRolePayload, UpdateRolePayload } from './types'

export const rolesApi = {
  async list(): Promise<RoleEntry[]> {
    const { data } = await apiClient.get<RoleEntry[]>('/roles')
    return data
  },

  async get(id: string): Promise<RoleDetail> {
    const { data } = await apiClient.get<RoleDetail>(`/roles/${id}`)
    return data
  },

  async create(payload: CreateRolePayload): Promise<RoleEntry> {
    const { data } = await apiClient.post<RoleEntry>('/roles', payload)
    return data
  },

  async update(id: string, payload: UpdateRolePayload): Promise<RoleEntry> {
    const { data } = await apiClient.patch<RoleEntry>(`/roles/${id}`, payload)
    return data
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/roles/${id}`)
  },

  async listPermissions(): Promise<string[]> {
    const { data } = await apiClient.get<string[]>('/roles/permissions')
    return data
  },
}
