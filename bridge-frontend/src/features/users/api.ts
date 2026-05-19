import apiClient from '@/lib/api-client'
import type {
  User, ListUsersParams, PaginatedUsers,
  CreateUserPayload, UpdateUserPayload, UpdateMePayload, ChangePasswordPayload,
} from './types'

export interface RoleEntry {
  id:          string
  name:        string
  displayName: string
  isSystem:    boolean
  permissions: string[]
  _count?:     { users: number }
}

export interface AuditLogEntry {
  id:         string
  action:     string
  entityType: string | null
  entityId:   string | null
  createdAt:  string
}

export const rolesApi = {
  async list(): Promise<RoleEntry[]> {
    const { data } = await apiClient.get<RoleEntry[]>('/roles')
    return data
  },
}

export const usersApi = {
  // ─── Admin CRUD ──────────────────────────────────────────────

  /** GET /users — liste paginée (admin) */
  async list(params: ListUsersParams = {}): Promise<PaginatedUsers> {
    const { data } = await apiClient.get<PaginatedUsers>('/users', { params })
    return data
  },

  /** GET /users/:id — détail (admin) */
  async get(id: string): Promise<User> {
    const { data } = await apiClient.get<User>(`/users/${id}`)
    return data
  },

  /** POST /users — créer un utilisateur (admin) */
  async create(payload: CreateUserPayload): Promise<User> {
    const { data } = await apiClient.post<User>('/users', payload)
    return data
  },

  /** PUT /users/:id — mettre à jour (admin) */
  async update(id: string, payload: UpdateUserPayload): Promise<User> {
    const { data } = await apiClient.put<User>(`/users/${id}`, payload)
    return data
  },

  /** DELETE /users/:id — soft-delete (admin) */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/users/${id}`)
  },

  /** POST /users/:id/reactivate — réactiver un compte suspendu/archivé (admin) */
  async reactivate(id: string): Promise<void> {
    await apiClient.post(`/users/${id}/reactivate`)
  },

  /** POST /users/:id/reset-password — réinitialiser le mot de passe (admin) */
  async resetPassword(id: string, newPassword: string): Promise<void> {
    await apiClient.post(`/users/${id}/reset-password`, { newPassword })
  },

  /** GET /users/:id/activity — 30 derniers audit logs de cet utilisateur (admin) */
  async getActivity(id: string): Promise<AuditLogEntry[]> {
    const { data } = await apiClient.get<{ success: boolean; data: AuditLogEntry[] }>(`/users/${id}/activity`)
    return data.data
  },

  // ─── Me ──────────────────────────────────────────────────────

  /** GET /users/me — profil courant */
  async getMe(): Promise<User> {
    const { data } = await apiClient.get<User>('/users/me')
    return data
  },

  /** PUT /users/me — modifier le profil courant */
  async updateMe(payload: UpdateMePayload): Promise<User> {
    const { data } = await apiClient.put<User>('/users/me', payload)
    return data
  },

  /** PUT /users/me/password — changer le mot de passe */
  async changePassword(payload: ChangePasswordPayload): Promise<void> {
    await apiClient.put('/users/me/password', payload)
  },

  /** PUT /users/me/avatar — uploader un avatar */
  async uploadAvatar(file: File): Promise<User> {
    const form = new FormData()
    form.append('file', file)
    const { data } = await apiClient.put<User>('/users/me/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  /** DELETE /users/me/avatar — supprimer l'avatar */
  async deleteAvatar(): Promise<User> {
    const { data } = await apiClient.delete<User>('/users/me/avatar')
    return data
  },
}
