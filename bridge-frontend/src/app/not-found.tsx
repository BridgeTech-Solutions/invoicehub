import Link from 'next/link'
import { ROUTES } from '@/lib/constants'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', fontFamily: 'var(--font-body)', padding: 24,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        {/* Large 404 with logo overlay */}
        <div style={{ position: 'relative', marginBottom: 32, display: 'inline-block' }}>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 'clamp(72px,14vw,120px)',
            fontWeight: 900, color: 'var(--border)', lineHeight: 1, margin: 0,
            letterSpacing: '-0.04em', userSelect: 'none',
          }}>
            404
          </p>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{
              width: 60, height: 60, borderRadius: 16,
              background: 'linear-gradient(135deg, var(--primary) 0%, #1a5fa8 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 12px 32px rgba(45,125,210,0.35)',
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
          </div>
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 10px' }}>
          Page introuvable
        </h1>
        <p style={{ fontSize: 14.5, color: 'var(--text-3)', margin: '0 0 32px', lineHeight: 1.6 }}>
          Cette page n&apos;existe pas ou a été déplacée.<br />
          Vérifiez l&apos;URL ou revenez au tableau de bord.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href={ROUTES.DASHBOARD}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 22px', borderRadius: 'var(--radius-md)',
              background: 'var(--primary)', color: '#fff', textDecoration: 'none',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
              boxShadow: '0 4px 14px rgba(45,125,210,0.3)',
            }}
          >
            Tableau de bord
          </Link>
          <Link
            href={ROUTES.INVOICES}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 22px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-2)', textDecoration: 'none',
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14,
            }}
          >
            Factures
          </Link>
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 40 }}>
          InvoiceHub v2.0 — Bridge Technologies Solutions
        </p>
      </div>
    </div>
  )
}
