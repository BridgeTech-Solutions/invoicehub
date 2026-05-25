import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { tokenStorage } from '@/lib/api-client'
import type { AuthUser, AuthState } from './types'

interface AuthStore extends AuthState {
  // Actions
  setAuth:        (user: AuthUser, accessToken: string, refreshToken: string) => void
  setTokens:      (accessToken: string, refreshToken: string) => void
  setPermissions: (permissions: string[]) => void
  clearAuth:      () => void
  setLoading:     (loading: boolean) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      // État initial
      user:              null,
      accessToken:       null,
      refreshToken:      null,
      isLoading:         false,
      permissionsLoaded: false,

      // Définit l'utilisateur + tokens après login réussi
      // Les permissions viennent directement dans la réponse login → ready immédiatement
      setAuth: (user, accessToken, refreshToken) => {
        tokenStorage.setAccess(accessToken)
        tokenStorage.setRefresh(refreshToken)
        set({ user, accessToken, refreshToken, isLoading: false, permissionsLoaded: true })
      },

      // Met à jour uniquement les tokens (après refresh)
      setTokens: (accessToken, refreshToken) => {
        tokenStorage.setAccess(accessToken)
        tokenStorage.setRefresh(refreshToken)
        set({ accessToken, refreshToken })
      },

      // Met à jour les permissions (bootstrap ou après changement de rôle via Socket.io)
      setPermissions: (permissions) =>
        set(state => ({
          user:              state.user ? { ...state.user, permissions } : null,
          permissionsLoaded: true,
        })),

      // Efface tout (logout)
      clearAuth: () => {
        tokenStorage.clear()
        set({ user: null, accessToken: null, refreshToken: null, isLoading: false, permissionsLoaded: false })
      },

      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name:    'bts-auth',
      storage: createJSONStorage(() => localStorage),
      // Ne persister que les données nécessaires (pas isLoading ni permissionsLoaded)
      partialize: (state) => ({
        user:         state.user,
        accessToken:  state.accessToken,
        refreshToken: state.refreshToken,
      }),
      // Au démarrage : si l'utilisateur a déjà des permissions en localStorage, on est prêt
      onRehydrateStorage: () => (state) => {
        if (state?.user?.permissions && state.user.permissions.length > 0) {
          state.permissionsLoaded = true
        }
      },
    },
  ),
)
