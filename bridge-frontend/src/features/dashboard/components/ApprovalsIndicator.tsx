'use client'

import Link from 'next/link'
import { ShieldCheck, ArrowRight } from 'lucide-react'
import { useApprovalPendingCount } from '@/features/approvals/hooks'
import { ROUTES } from '@/lib/constants'

// ─── Component ────────────────────────────────────────────────
/**
 * ApprovalsIndicator — documents en attente d'approbation par l'utilisateur.
 * N'affiche rien s'il n'y a aucune approbation en attente (pas de bruit).
 */
export function ApprovalsIndicator() {
  const { data, isLoading } = useApprovalPendingCount()
  const count = data?.count ?? 0

  // Discret : on ne montre la carte que s'il y a quelque chose à approuver.
  if (isLoading || count === 0) return null

  return (
    <Link
      href={ROUTES.APPROVALS}
      className="card"
      style={{
        padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
        textDecoration: 'none', borderLeft: '3px solid var(--s-partial)',
        transition: 'box-shadow 0.2s var(--ease-smooth)',
      }}
    >
      <span style={{
        width: 38, height: 38, borderRadius: 'var(--radius-md)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--s-partial-bg)',
      }}>
        <ShieldCheck size={19} style={{ color: 'var(--s-partial)' }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-display" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>
          {count} document{count !== 1 ? 's' : ''} à approuver
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
          En attente de votre validation
        </p>
      </div>
      <ArrowRight size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </Link>
  )
}
