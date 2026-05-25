'use client'

import { CompanyLogo } from '@/components/ui/CompanyLogo'


export function AuthLeftPanel() {
  return (
    <div className="auth-left-panel" style={{
      background: 'linear-gradient(155deg, #0f2d4a 0%, #0b2240 55%, #0d1f38 100%)',
      display: 'flex',
      flexDirection: 'column',
      padding: '48px 52px',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Grid de fond subtil */}
      <svg aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        opacity: 0.035, pointerEvents: 'none',
      }}>
        <defs>
          <pattern id="auth-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.8"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#auth-grid)" />
      </svg>

      {/* Lueur radiale haute droite */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: -120, right: -120,
        width: 440, height: 440, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(45,125,210,0.22) 0%, transparent 62%)',
        pointerEvents: 'none',
      }} />

      {/* Lueur radiale basse gauche */}
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: -80, left: -60,
        width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(45,125,210,0.10) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* ── Logo ─────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1, marginBottom: 'auto' }}>
        <CompanyLogo variant="white" height={34} alt="InvoiceHub" public style={{ opacity: 0.92 }} />
      </div>

      {/* ── Tagline ───────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1, paddingBottom: 36 }}>
        <h2 style={{
          fontSize: 'clamp(24px, 2.2vw, 34px)',
          fontWeight: 800,
          fontFamily: 'var(--font-display)',
          color: '#fff',
          lineHeight: 1.18,
          letterSpacing: '-0.03em',
          margin: '0 0 16px',
        }}>
          Pilotez toute votre<br />
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>gestion financière</span><br />
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>depuis un seul endroit.</span>
        </h2>
        <p style={{
          fontSize: 14,
          color: 'rgba(255,255,255,0.42)',
          lineHeight: 1.8,
          fontFamily: 'var(--font-body)',
          margin: 0,
          maxWidth: 320,
        }}>
          Centralisez votre activité, simplifiez vos finances et gardez le contrôle — où que vous soyez.
        </p>
      </div>

      {/* ── Footer ───────────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 1,
        paddingTop: 20,
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <CompanyLogo variant="white" height={18} alt="" public style={{ opacity: 0.22 }} />
        <span style={{
          fontSize: 11.5,
          color: 'rgba(255,255,255,0.20)',
          fontFamily: 'var(--font-body)',
        }}>
          © 2026 Bridge Technologies Solutions
        </span>
      </div>
    </div>
  )
}
