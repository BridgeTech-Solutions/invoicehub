import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { usersApi, rolesApi, type AuditLogEntry } from './api'
import { useAuthStore } from '@/features/auth/store'
import type {
  ListUsersParams, CreateUserPayload,
  UpdateUserPayload, UpdateMePayload, ChangePasswordPayload,
} from './types'

const KEYS = {
  all:   ['users'] as const,
  list:  (p: ListUsersParams) => ['users', 'list', p] as const,
  one:   (id: string) => ['users', id] as const,
  me:    ['users', 'me'] as const,
  roles: ['roles'] as const,
}

// ─── Roles ────────────────────────────────────────────────────
export function useRoles() {
  return useQuery({
    queryKey:  KEYS.roles,
    queryFn:   rolesApi.list,
    staleTime: 5 * 60_000,
  })
}

// ─── List (admin) ─────────────────────────────────────────────
export function useUsers(params: ListUsersParams = {}) {
  return useQuery({
    queryKey:  KEYS.list(params),
    queryFn:   () => usersApi.list(params),
    staleTime: 30_000,
  })
}

// ─── Single (admin) ───────────────────────────────────────────
export function useUser(id: string) {
  return useQuery({
    queryKey: KEYS.one(id),
    queryFn:  () => usersApi.get(id),
    enabled:  !!id,
  })
}

// ─── Create (admin) ───────────────────────────────────────────
export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => usersApi.create(payload),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success(`Compte créé pour ${user.firstName} ${user.lastName}`)
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast.error(e.response?.data?.error ?? 'Erreur lors de la création')
    },
  })
}

// ─── Update (admin) ───────────────────────────────────────────
export function useUpdateUser(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateUserPayload) => usersApi.update(id, payload),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      qc.setQueryData(KEYS.one(id), user)
      toast.success('Utilisateur mis à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

// ─── Delete (admin) ───────────────────────────────────────────
export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Utilisateur suspendu')
    },
    onError: () => toast.error('Impossible de suspendre cet utilisateur'),
  })
}

// ─── Reactivate (admin) ───────────────────────────────────────
export function useReactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => usersApi.reactivate(id),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      qc.invalidateQueries({ queryKey: KEYS.one(id) })
      toast.success('Compte réactivé')
    },
    onError: () => toast.error('Impossible de réactiver ce compte'),
  })
}

// ─── Reset password (admin) ───────────────────────────────────
export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      usersApi.resetPassword(id, newPassword),
    onSuccess: () => toast.success('Mot de passe réinitialisé — l\'utilisateur devra le changer à sa prochaine connexion'),
    onError:   () => toast.error('Erreur lors de la réinitialisation'),
  })
}

// ─── Activity (admin) ─────────────────────────────────────────
export function useUserActivity(id: string) {
  return useQuery<AuditLogEntry[]>({
    queryKey:  [...KEYS.one(id), 'activity'],
    queryFn:   () => usersApi.getActivity(id),
    enabled:   !!id,
    staleTime: 30_000,
  })
}

// ─── Me ───────────────────────────────────────────────────────
export function useMe() {
  return useQuery({
    queryKey:  KEYS.me,
    queryFn:   usersApi.getMe,
    staleTime: 60_000,
  })
}

// ─── UpdateMe ─────────────────────────────────────────────────
export function useUpdateMe() {
  const qc = useQueryClient()
  const { user, accessToken, refreshToken } = useAuthStore()

  return useMutation({
    mutationFn: (payload: UpdateMePayload) => usersApi.updateMe(payload),
    onSuccess: (updated) => {
      qc.setQueryData(KEYS.me, updated)
      // Sync auth store if name changed
      if (user && accessToken && refreshToken) {
        useAuthStore.getState().setAuth(
          { ...user, firstName: updated.firstName, lastName: updated.lastName },
          accessToken,
          refreshToken,
        )
      }
      toast.success('Profil mis à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour du profil'),
  })
}

// ─── ChangePassword ───────────────────────────────────────────
export function useChangePassword() {
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) => usersApi.changePassword(payload),
    onSuccess: () => toast.success('Mot de passe modifié avec succès'),
    onError:   (e: { response?: { data?: { error?: string } } }) => {
      toast.error(e.response?.data?.error ?? 'Erreur lors du changement de mot de passe')
    },
  })
}

// ─── Avatar ───────────────────────────────────────────────────
export function useUploadAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => usersApi.uploadAvatar(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.me })
      toast.success('Avatar mis à jour')
    },
    onError: () => toast.error('Erreur lors de l\'upload (max 2MB, PNG/JPEG/WebP)'),
  })
}

export function useDeleteAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => usersApi.deleteAvatar(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.me })
      toast.success('Avatar supprimé')
    },
  })
}
