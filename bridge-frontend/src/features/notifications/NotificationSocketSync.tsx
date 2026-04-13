'use client'

/**
 * NotificationSocketSync — écoute notification:new globalement.
 *
 * Monté une seule fois dans AppShell, met à jour :
 *  1. Le cache TanStack Query → badge cloche se rafraîchit
 *  2. Un toast Sonner → l'utilisateur voit la notification immédiatement
 */
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useSocket } from '@/hooks/useSocket'

interface NotificationPayload {
  type:    string
  title:   string
  message: string
  data?:   Record<string, unknown>
}

export function NotificationSocketSync() {
  const qc = useQueryClient()

  const handleNew = useCallback((payload: NotificationPayload) => {
    // 1. Invalide le cache → badge cloche + liste se rafraîchissent
    qc.invalidateQueries({ queryKey: ['notifications'] })

    // 2. Toast visible immédiatement
    toast(payload.title, {
      description: payload.message,
      duration:    6000,
    })
  }, [qc])

  useSocket<NotificationPayload>('notification:new', handleNew)

  return null
}
