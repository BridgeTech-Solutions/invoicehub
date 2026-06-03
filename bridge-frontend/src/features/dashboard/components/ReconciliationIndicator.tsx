'use client'

import Link from 'next/link'
import { Link2, CheckCircle2, ArrowRight } from 'lucide-react'
import { useBankSummary } from '@/features/bank/hooks'
import { ROUTES } from '@/lib/constants'

// ─── Component ────────────────────────────────────────────────
/**
 * ReconciliationIndicator — opérations bancaires à rapprocher.
 * La trésorerie affichée dépend du rapprochement : cet indicateur signale
 * combien d'opérations restent à lettrer.
 */
export function ReconciliationIndicator() {
  const { data, isLoading } = useBankSummary()

  if (isLoading) {
    return (
      <div className="card" style={{ padding: '16px 18px', height: 76 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 8, opacity: 0.4 }} className="animate-pulse" />
      </div>
    )
  }

  const count = data?.unreconciledCount ?? 0
  const clean = count === 0

  return (
    <Link
      href={clean ? ROUTES.BANK_TRANSACTIONS : `${ROUTES.BANK_TRANSACTIONS}?reconciled=false`}
      className="card"
      style={{
        padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
        textDecoration: 'none', transition: 'box-shadow 0.2s var(--ease-smooth)',
      }}
    >
      <span style={{
        width: 40, height: 40, borderRadius: 'var(--radius-md)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: clean ? 'var(--acc-credit-bg)' : 'var(--s-partial-bg)',
      }}>
        {clean
          ? <CheckCircle2 size={20} style={{ color: 'var(--acc-credit)' }} />
          : <Link2 size={20} style={{ color: 'var(--s-partial)' }} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-display" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>
          {clean ? 'Tout est rapproché' : 'Opérations à rapprocher'}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
          {clean
            ? 'Aucune opération bancaire en attente'
            : <><span className="amount" style={{ fontWeight: 700, color: 'var(--s-partial)' }}>{count}</span> opération{count !== 1 ? 's' : ''} non lettrée{count !== 1 ? 's' : ''}</>}
        </p>
      </div>
      {!clean && <ArrowRight size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
    </Link>
  )
}
