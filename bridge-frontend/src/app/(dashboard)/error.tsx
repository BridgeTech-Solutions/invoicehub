'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[DashboardError]', error)
  }, [error])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        gap: 16,
        fontFamily: 'var(--font-body)',
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'rgba(239,68,68,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AlertTriangle size={24} style={{ color: '#ef4444' }} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <h2
          className="font-display"
          style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}
        >
          Une erreur est survenue
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', maxWidth: 340 }}>
          {error.message || 'Impossible de charger cette page. Veuillez réessayer.'}
        </p>
      </div>

      <button
        onClick={reset}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 18px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--primary)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 13.5,
        }}
      >
        <RotateCcw size={14} />
        Réessayer
      </button>
    </div>
  )
}
