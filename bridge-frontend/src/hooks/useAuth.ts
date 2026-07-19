import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuthStore, useAuthHydrated } from '@/features/auth/store'
import { ROUTES } from '@/lib/constants'

/**
 * useAuth — accès au store auth + redirects
 * Redirige vers /login si l'utilisateur n'est pas authentifié
 */
export function useAuth(requireAuth = true) {
  const { user, accessToken, isLoading, clearAuth } = useAuthStore()
  const hydrated = useAuthHydrated()
  const router = useRouter()

  // `hydrated` est indispensable : `isLoading` vaut false au premier rendu, donc
  // sans lui la condition passe avant que le store n'ait relu localStorage et
  // éjecte une session valide vers /login.
  useEffect(() => {
    if (requireAuth && hydrated && !isLoading && !accessToken) {
      router.push(ROUTES.LOGIN)
    }
  }, [accessToken, hydrated, isLoading, requireAuth, router])

  const logout = () => {
    clearAuth()
    router.push(ROUTES.LOGIN)
  }

  return {
    user,
    isAuthenticated: !!accessToken,
    // Tant que le store n'est pas réhydraté, l'état d'authentification est inconnu :
    // les appelants doivent attendre plutôt que de conclure « non connecté ».
    isLoading: isLoading || !hydrated,
    logout,
  }
}
