'use client'

import { AlertCircle } from 'lucide-react'

export default function CustomFieldsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
          Champs personnalisés
        </h1>
      </div>
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <AlertCircle size={36} style={{ color: '#ef4444', margin: '0 auto 12px' }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
          Impossible de charger les champs personnalisés
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 16px' }}>
          {error.message ?? 'Une erreur inattendue est survenue.'}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '8px 20px', borderRadius: 'var(--radius-md)',
            border: 'none', background: 'var(--primary)', color: '#fff',
            cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600,
          }}
        >
          Réessayer
        </button>
      </div>
    </div>
  )
}
