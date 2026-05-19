'use client'

import { useEffect } from 'react'
import { BarChart3 } from 'lucide-react'

export default function StockError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 16 }}>
      <span style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <BarChart3 size={24} style={{ color: '#dc2626' }} />
      </span>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>Erreur de chargement</p>
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Impossible de charger les données de stock.</p>
      </div>
      <button
        type="button"
        onClick={reset}
        style={{
          padding: '8px 20px', borderRadius: 'var(--radius-md)',
          background: 'var(--primary)', color: '#fff', border: 'none',
          fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600,
        }}
      >
        Réessayer
      </button>
    </div>
  )
}
