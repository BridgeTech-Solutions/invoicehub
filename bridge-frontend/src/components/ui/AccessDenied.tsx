'use client'

import { ShieldOff } from 'lucide-react'
import Link from 'next/link'
import { ROUTES } from '@/lib/constants'

/**
 * Displayed when the current user lacks the required permission to view a page.
 * Use at the top of a page component, before any data fetching renders.
 */
export function AccessDenied({ message }: { message?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 360, gap: 16, textAlign: 'center', padding: '48px 24px',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'rgba(239,68,68,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ShieldOff size={28} style={{ color: '#ef4444' }} />
      </div>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 6px' }}>
          Accès refusé
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: 0, maxWidth: 380 }}>
          {message ?? "Vous n'avez pas les permissions nécessaires pour accéder à cette page."}
        </p>
      </div>
      <Link
        href={ROUTES.DASHBOARD}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '9px 20px', borderRadius: 'var(--radius-md)',
          background: 'var(--primary)', color: '#fff',
          fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-display)', textDecoration: 'none',
        }}
      >
        Retour au tableau de bord
      </Link>
    </div>
  )
}
