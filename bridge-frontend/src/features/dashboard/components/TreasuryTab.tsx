'use client'

import Link from 'next/link'
import { Landmark } from 'lucide-react'
import { CashflowForecast } from './CashflowForecast'
import { ReconciliationIndicator } from './ReconciliationIndicator'
import { useDashboardKpis } from '../hooks'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'

// ─── Carte position de trésorerie ──────────────────────────────
function CashPositionCard() {
  const { format } = useCurrency()
  const { data, isLoading } = useDashboardKpis()

  if (isLoading || !data) {
    return (
      <div className="card" style={{ padding: '22px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ height: 11, width: 160, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--border)' }} className="animate-pulse" />
        </div>
        <div style={{ height: 30, width: 200, background: 'var(--border)', borderRadius: 4, marginBottom: 10 }} className="animate-pulse" />
        <div style={{ height: 11, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      </div>
    )
  }

  const { total, accountCount } = data.cashPosition

  return (
    <div className="card" style={{ padding: '22px 24px', borderLeft: '3px solid var(--j-bank)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{
          fontSize: 11,
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-3)',
        }}>
          Position de trésorerie
        </p>
        <span
          className="flex items-center justify-center"
          style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--j-bank-bg)', flexShrink: 0 }}
          aria-hidden="true"
        >
          <Landmark size={18} style={{ color: 'var(--j-bank)' }} strokeWidth={2} />
        </span>
      </div>

      <p className="amount" style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.15, marginBottom: 10 }}>
        {format(total)}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 500 }}>
          Solde consolidé sur {accountCount} compte{accountCount !== 1 ? 's' : ''} bancaire{accountCount !== 1 ? 's' : ''}
        </p>
        <Link
          href={ROUTES.BANK}
          aria-label="Voir la trésorerie"
          style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          Voir →
        </Link>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
/**
 * TreasuryTab — onglet « Trésorerie » du dashboard dirigeant.
 * Prévision de trésorerie 30 jours + position consolidée des comptes.
 */
export function TreasuryTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Position de trésorerie + opérations à rapprocher */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]" style={{ alignItems: 'stretch' }}>
        <CashPositionCard />
        <ReconciliationIndicator />
      </div>

      {/* Prévision de trésorerie — pleine largeur */}
      <CashflowForecast />
    </div>
  )
}
