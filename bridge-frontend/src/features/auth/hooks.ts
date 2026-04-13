import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuthStore } from './store'
import * as authApi from './api'
import { ROUTES } from '@/lib/constants'
import type { LoginPayload } from './types'
import { AxiosError } from 'axios'

// ─── useLogin ─────────────────────────────────────────────────
export function useLogin() {
  const { setAuth, setLoading } = useAuthStore()
  const router = useRouter()

  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),

    onMutate: () => setLoading(true),

    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken)

      if (data.user.mustChangePassword) {
        router.push(`${ROUTES.PROFILE}?force=1`)
        return
      }

      router.push(ROUTES.DASHBOARD)
    },

    onError: (error: AxiosError<{ error?: string; code?: string }>) => {
      setLoading(false)
      const code    = error.response?.data?.code
      const message = error.response?.data?.error

      // Code spécial : le backend demande le TOTP → rediriger vers /2fa
      if (code === 'TOTP_REQUIRED') {
        return  // géré dans le composant login
      }

      toast.error(message ?? 'Email ou mot de passe incorrect')
    },
  })
}

// ─── useLogout ────────────────────────────────────────────────
export function useLogout() {
  const { clearAuth, refreshToken } = useAuthStore()
  const router = useRouter()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: () => authApi.logout(refreshToken ?? ''),
    onSettled: () => {
      clearAuth()
      qc.clear()
      router.push(ROUTES.LOGIN)
    },
  })
}

// ─── useForgotPassword ────────────────────────────────────────
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
    onSuccess: () => {
      toast.success('Email de réinitialisation envoyé si le compte existe')
    },
    onError: () => {
      toast.error('Une erreur est survenue. Réessayez.')
    },
  })
}

// ─── useResetPassword ─────────────────────────────────────────
export function useResetPassword() {
  const router = useRouter()
  return useMutation({
    mutationFn: ({ token, newPassword }: { token: string; newPassword: string }) =>
      authApi.resetPassword(token, newPassword),
    onSuccess: () => {
      toast.success('Mot de passe réinitialisé. Vous pouvez vous connecter.')
      router.push(ROUTES.LOGIN)
    },
    onError: (error: AxiosError<{ error?: string }>) => {
      toast.error(error.response?.data?.error ?? 'Token invalide ou expiré')
    },
  })
}

// ─── use2FAEnable ─────────────────────────────────────────────
export function use2FAEnable() {
  return useMutation({
    mutationFn: () => authApi.twoFAEnable(),
  })
}

// ─── use2FAVerify ─────────────────────────────────────────────
export function use2FAVerify() {
  const { user, setAuth, accessToken, refreshToken } = useAuthStore()

  return useMutation({
    mutationFn: ({ token }: { token: string }) =>
      authApi.twoFAVerify(token),
    onSuccess: () => {
      // Met à jour twoFactorEnabled dans le store
      if (user && accessToken && refreshToken) {
        useAuthStore.getState().setAuth(
          { ...user, twoFactorEnabled: true },
          accessToken,
          refreshToken,
        )
      }
      toast.success('Authentification à deux facteurs activée')
    },
    onError: (error: AxiosError<{ error?: string }>) => {
      toast.error(error.response?.data?.error ?? 'Code invalide')
    },
  })
}

// ─── use2FARegenerateBackupCodes ──────────────────────────────
export function use2FARegenerateBackupCodes() {
  return useMutation({
    mutationFn: (token: string) => authApi.twoFARegenerateBackupCodes(token),
    onSuccess: () => {
      toast.success('Codes de secours régénérés')
    },
    onError: (error: AxiosError<{ error?: string }>) => {
      toast.error(error.response?.data?.error ?? 'Code invalide')
    },
  })
}

// ─── use2FADisable ────────────────────────────────────────────
export function use2FADisable() {
  const { user, accessToken, refreshToken } = useAuthStore()

  return useMutation({
    mutationFn: (token: string) => authApi.twoFADisable(token),
    onSuccess: () => {
      if (user && accessToken && refreshToken) {
        useAuthStore.getState().setAuth(
          { ...user, twoFactorEnabled: false },
          accessToken,
          refreshToken,
        )
      }
      toast.success('Authentification à deux facteurs désactivée')
    },
    onError: (error: AxiosError<{ error?: string }>) => {
      toast.error(error.response?.data?.error ?? 'Code invalide')
    },
  })
}

// ─── useSessions ──────────────────────────────────────────────
export function useSessions() {
  return useQuery({
    queryKey:  ['auth', 'sessions'],
    queryFn:   authApi.listSessions,
    staleTime: 30_000,
  })
}

export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => authApi.revokeSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] })
      toast.success('Session révoquée')
    },
  })
}

export function useRevokeAllSessions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: authApi.revokeAllSessions,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] })
      toast.success('Toutes les autres sessions ont été révoquées')
    },
  })
}
