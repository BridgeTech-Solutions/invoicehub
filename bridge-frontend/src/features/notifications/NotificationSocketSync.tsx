'use client'

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useSocket } from '@/hooks/useSocket'
import { useNotificationSettings } from './hooks'
import type { NotificationType, NotificationSetting } from './types'

interface NotificationPayload {
  type:    string
  title:   string
  message: string
  data?:   Record<string, unknown>
}

export function NotificationSocketSync() {
  const qc = useQueryClient()
  // Déjà en cache (staleTime 60s) — pas de requête supplémentaire
  const { data: settings } = useNotificationSettings()

  const handleNew = useCallback((payload: NotificationPayload) => {
    // 1. Invalide le cache → badge cloche + liste se rafraîchissent
    qc.invalidateQueries({ queryKey: ['notifications'] })

    // 2. Toast uniquement si le canal in_app est actif pour ce type
    const pref = settings?.find(
      (s: NotificationSetting) => s.type === (payload.type as NotificationType),
    )
    // Afficher si : pas de préférence trouvée (type inconnu → toujours montrer)
    //              ou préférence active ET canal inclut in_app
    const showToast =
      !pref ||
      (pref.enabled && (pref.channel === 'in_app' || pref.channel === 'both'))

    if (showToast) {
      toast(payload.title, {
        description: payload.message || undefined,
        duration:    6000,
      })
    }
  }, [qc, settings])

  useSocket<NotificationPayload>('notification:new', handleNew)

  return null
}
