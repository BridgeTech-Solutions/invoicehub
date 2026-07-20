import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useEffect, useState } from 'react'
import { tokenStorage } from '@/lib/api-client'
import type { AuthUser, AuthState } from './types'

interface AuthStore extends AuthState {
  // Actions
  setAuth:        (user: AuthUser, accessToken: string, refreshToken: string) => void
  setTokens:      (accessToken: string, refreshToken: string) => void
  setPermissions: (permissions: string[]) => void
  patchUser:      (partial: Partial<AuthUser>) => void
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

      // Met à jour des champs spécifiques du profil sans toucher aux tokens
      patchUser: (partial) =>
        set(state => ({
          user: state.user ? { ...state.user, ...partial } : null,
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
      onRehydrateStorage: () => (state) => {
        if (!state) return

        // Auto-réparation : le store et `tokenStorage` sont deux copies de la même
        // session. S'ils divergent — store « connecté » mais plus aucun jeton à
        // injecter — l'application affiche le tableau de bord pendant que chaque
        // requête part en 401, et les listes se vident sans erreur visible.
        // On tranche en faveur des jetons : sans eux, il n'y a pas de session.
        if (state.accessToken && !tokenStorage.getAccess()) {
          state.user         = null
          state.accessToken  = null
          state.refreshToken = null
        }

        // Si l'utilisateur a déjà ses permissions en localStorage, on est prêt.
        if (state.user?.permissions && state.user.permissions.length > 0) {
          state.permissionsLoaded = true
        }
      },
    },
  ),
)

/**
 * Indique si le store a fini de se réhydrater depuis localStorage.
 *
 * `persist` réhydrate de façon ASYNCHRONE : au premier rendu le store vaut encore
 * son état initial (`user: null, accessToken: null`), même quand une session
 * parfaitement valide existe en localStorage. Toute garde qui teste
 * `!accessToken` sans attendre l'hydratation redirige donc vers /login au
 * chargement dur d'une URL — l'utilisateur est éjecté sur un simple F5 ou en
 * ouvrant un lien profond, alors que son token est valide.
 *
 * Initialisé à `false` plutôt qu'à `persist.hasHydrated()` : la valeur doit être
 * identique au rendu serveur, sinon React signale une divergence d'hydratation.
 */
export function useAuthHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const unsubscribe = useAuthStore.persist.onFinishHydration(() => setHydrated(true))
    // Filet : l'hydratation a pu se terminer entre le premier rendu et cet effet,
    // auquel cas `onFinishHydration` ne se déclenchera plus jamais.
    if (useAuthStore.persist.hasHydrated()) setHydrated(true)
    return unsubscribe
  }, [])

  return hydrated
}
