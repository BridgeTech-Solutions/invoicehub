'use client'
import { TriangleAlert } from 'lucide-react'
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12 }}>
      <TriangleAlert size={40} style={{ color: '#dc2626' }} />
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Erreur de chargement</p>
      <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{error.message}</p>
      <button onClick={reset} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Réessayer</button>
    </div>
  )
}
