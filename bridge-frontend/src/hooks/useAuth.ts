import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuthStore } from '@/features/auth/store'
import { ROUTES } from '@/lib/constants'

/**
 * useAuth — accès au store auth + redirects
 * Redirige vers /login si l'utilisateur n'est pas authentifié
 */
export function useAuth(requireAuth = true) {
  const { user, accessToken, isLoading, clearAuth } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (requireAuth && !isLoading && !accessToken) {
      router.push(ROUTES.LOGIN)
    }
  }, [accessToken, isLoading, requireAuth, router])

  const logout = () => {
    clearAuth()
    router.push(ROUTES.LOGIN)
  }

  return {
    user,
    isAuthenticated: !!accessToken,
    isLoading,
    logout,
  }
}
