'use client'

/**
 * Hook de déconnexion automatique par inactivité.
 *
 * - Récupère `sessionTimeoutMinutes` depuis l'API settings (une fois au montage).
 * - Si la valeur est > 0, démarre un timer qui se réinitialise à chaque événement
 *   utilisateur (souris, clavier, touch, scroll).
 * - À l'expiration du timer : révoque le refresh token, vide le store et redirige
 *   vers /login avec un toast d'information.
 * - Nettoie les écouteurs et le timer au démontage.
 */
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuthStore } from '@/features/auth/store'
import { settingsApi } from '@/features/settings/api'
import * as authApi from '@/features/auth/api'

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'] as const

export function useInactivityLogout() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const router = useRouter()

  // Ref vers la fonction reset pour pouvoir la retirer proprement lors du cleanup
  const resetRef = useRef<(() => void) | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!accessToken) return

    let mounted = true

    settingsApi.get().then((settings) => {
      if (!mounted) return

      const minutes = settings.sessionTimeoutMinutes ?? 0
      if (minutes <= 0) return // 0 = timeout désactivé

      const ms = minutes * 60 * 1000

      const handleTimeout = async () => {
        // Lire le store au moment du timeout pour avoir le refresh token à jour
        const { refreshToken, clearAuth } = useAuthStore.getState()
        if (refreshToken) {
          try { await authApi.logout(refreshToken) } catch { /* silencieux */ }
        }
        clearAuth()
        toast.info('Session expirée', {
          description: `Vous avez été déconnecté après ${minutes} minute${minutes > 1 ? 's' : ''} d'inactivité.`,
          duration: 6000,
        })
        router.replace('/login')
      }

      const reset = () => {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(handleTimeout, ms)
      }

      resetRef.current = reset
      reset() // démarrer le timer initial

      ACTIVITY_EVENTS.forEach((e) =>
        window.addEventListener(e, reset, { passive: true })
      )
    }).catch(() => { /* settings inaccessibles — pas de timeout */ })

    return () => {
      mounted = false
      if (timerRef.current) clearTimeout(timerRef.current)
      if (resetRef.current) {
        const fn = resetRef.current
        ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, fn))
        resetRef.current = null
      }
    }
  }, [accessToken, router])
}
