'use client'

import { AlertTriangle } from 'lucide-react'

export default function RolesError({ reset }: { reset: () => void }) {
  return (
    <div className="card" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
      <AlertTriangle size={32} aria-hidden="true" style={{ color: '#ef4444', display: 'block', margin: '0 auto 12px' }} />
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>
        Erreur de chargement
      </h2>
      <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '0 0 20px' }}>
        Impossible de charger les rôles. Vérifiez votre connexion et réessayez.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{ padding: '10px 20px', minHeight: 44, borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700 }}
      >
        Réessayer
      </button>
    </div>
  )
}
