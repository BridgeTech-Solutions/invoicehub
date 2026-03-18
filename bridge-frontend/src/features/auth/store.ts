import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { tokenStorage } from '@/lib/api-client'
import type { AuthUser, AuthState } from './types'

interface AuthStore extends AuthState {
  // Actions
  setAuth:      (user: AuthUser, accessToken: string, refreshToken: string) => void
  setTokens:    (accessToken: string, refreshToken: string) => void
  clearAuth:    () => void
  setLoading:   (loading: boolean) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      // État initial
      user:         null,
      accessToken:  null,
      refreshToken: null,
      isLoading:    false,

      // Définit l'utilisateur + tokens après login réussi
      setAuth: (user, accessToken, refreshToken) => {
        tokenStorage.setAccess(accessToken)
        tokenStorage.setRefresh(refreshToken)
        set({ user, accessToken, refreshToken, isLoading: false })
      },

      // Met à jour uniquement les tokens (après refresh)
      setTokens: (accessToken, refreshToken) => {
        tokenStorage.setAccess(accessToken)
        tokenStorage.setRefresh(refreshToken)
        set({ accessToken, refreshToken })
      },

      // Efface tout (logout)
      clearAuth: () => {
        tokenStorage.clear()
        set({ user: null, accessToken: null, refreshToken: null, isLoading: false })
      },

      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name:    'bts-auth',
      storage: createJSONStorage(() => localStorage),
      // Ne persister que les données nécessaires (pas isLoading)
      partialize: (state) => ({
        user:         state.user,
        accessToken:  state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
)
