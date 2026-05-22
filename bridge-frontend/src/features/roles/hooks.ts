import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { rolesApi } from './api'
import type { CreateRolePayload, UpdateRolePayload } from './types'

const KEYS = {
  all:         ['roles'] as const,
  list:        ['roles', 'list'] as const,
  one:         (id: string) => ['roles', id] as const,
  permissions: ['roles', 'permissions'] as const,
}

export function useRoles() {
  return useQuery({
    queryKey:  KEYS.list,
    queryFn:   rolesApi.list,
    staleTime: 5 * 60_000,
  })
}

export function useRole(id: string) {
  return useQuery({
    queryKey: KEYS.one(id),
    queryFn:  () => rolesApi.get(id),
    enabled:  !!id,
  })
}

export function usePermissions() {
  return useQuery({
    queryKey:  KEYS.permissions,
    queryFn:   rolesApi.listPermissions,
    staleTime: 10 * 60_000,
  })
}

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateRolePayload) => rolesApi.create(payload),
    onSuccess: (role) => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success(`Rôle "${role.displayName}" créé`)
    },
    onError: (e: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(e.response?.data?.message ?? e.response?.data?.error ?? 'Erreur lors de la création')
    },
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRolePayload }) =>
      rolesApi.update(id, data),
    onSuccess: (_role, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      qc.invalidateQueries({ queryKey: KEYS.one(id) })
      toast.success('Rôle mis à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rolesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Rôle supprimé')
    },
    onError: (e: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(
        e.response?.data?.message ??
        e.response?.data?.error ??
        'Impossible de supprimer ce rôle',
      )
    },
  })
}
