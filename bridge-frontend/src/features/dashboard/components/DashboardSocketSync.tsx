'use client'

import { useDashboardSocketSync } from '../hooks'

/**
 * DashboardSocketSync — invisible client component.
 * Écoute l'événement 'dashboard:refresh' (émis par le backend après mutations)
 * et invalide le cache TanStack Query du dashboard.
 */
export function DashboardSocketSync() {
  useDashboardSocketSync()
  return null
}
