'use client'

import { AlertTriangle, RotateCcw, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

/**
 * Composant d'erreur réutilisable pour les error.tsx par route
 */
export function RouteError({
  error,
  reset,
  backHref,
  backLabel = 'Retour',
}: {
  error: Error & { digest?: string }
  reset: () => void
  backHref?: string
  backLabel?: string
}) {
  const isNotFound = error.message?.includes('404') || error.message?.includes('not found')
  const isUnauth   = error.message?.includes('401') || error.message?.includes('403')

  const title   = isNotFound ? 'Ressource introuvable' : isUnauth ? 'Accès refusé' : 'Une erreur est survenue'
  const message = isNotFound
    ? 'Cette ressource n\'existe pas ou a été supprimée.'
    : isUnauth
      ? 'Vous n\'avez pas les permissions nécessaires pour accéder à cette page.'
      : error.message || 'Impossible de charger cette page. Veuillez réessayer.'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360, gap: 20, padding: 32, fontFamily: 'var(--font-body)' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AlertTriangle size={26} style={{ color: '#ef4444' }} />
      </div>

      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>
          {title}
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
          {message}
        </p>
        {error.digest && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0', fontFamily: 'var(--font-mono)' }}>
            ID: {error.digest}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {backHref && (
          <Link
            href={backHref}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', textDecoration: 'none', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5 }}
          >
            <ArrowLeft size={14} />
            {backLabel}
          </Link>
        )}
        <button
          onClick={reset}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}
        >
          <RotateCcw size={14} />
          Réessayer
        </button>
      </div>
    </div>
  )
}
