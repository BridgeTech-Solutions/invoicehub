import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Catégories' }
export default function Page() {
  return (
    <div style={{ padding: 8 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>Catégories</h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>Implémentation en Phase 4</p>
    </div>
  )
}
