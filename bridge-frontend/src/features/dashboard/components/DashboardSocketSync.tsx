'use client'

import { useState } from 'react'
import { useDashboardSocketSync } from '../hooks'

/**
 * DashboardSocketSync — invisible client component.
 * Écoute l'événement 'dashboard:refresh' (émis par le backend après mutations)
 * et invalide le cache TanStack Query du dashboard.
 *
 * Rend également une région aria-live pour annoncer les mises à jour
 * aux lecteurs d'écran (WCAG 2.1 — 4.1.3 Status Messages).
 */
export function DashboardSocketSync() {
  const [announcement, setAnnouncement] = useState('')

  useDashboardSocketSync(() => {
    setAnnouncement(`Tableau de bord mis à jour à ${new Date().toLocaleTimeString('fr-FR')}`)
    // Réinitialiser après 5s pour que le prochain refresh soit bien annoncé
    setTimeout(() => setAnnouncement(''), 5000)
  })

  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        width: 1, height: 1,
        padding: 0, margin: -1,
        overflow: 'hidden',
        clip: 'rect(0,0,0,0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {announcement}
    </span>
  )
}
