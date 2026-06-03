'use client'

import { TrendingUp, ShoppingCart } from 'lucide-react'
import { CashflowForecast } from './CashflowForecast'
import { ApprovalsIndicator } from './ApprovalsIndicator'
import { useDashboardKpis } from '../hooks'
import { useCurrency } from '@/hooks/useCurrency'

// ─── Mini summary card ─────────────────────────────────────────
interface MiniCardProps {
  label:  string
  amount: number
  count:  number
  noun:   string         // ex. "facture", "achat"
  icon:   React.ElementType
  color:  string
  bg:     string
}

function MiniCard({ label, amount, count, noun, icon: Icon, color, bg }: MiniCardProps) {
  const { format } = useCurrency()
  return (
    <div className="card" style={{ padding: '18px 22px', borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{
          fontSize: 11,
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-3)',
        }}>
          {label}
        </p>
        <span
          className="flex items-center justify-center"
          style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: bg, flexShrink: 0 }}
          aria-hidden="true"
        >
          <Icon size={16} style={{ color }} strokeWidth={2} />
        </span>
      </div>
      <p className="amount" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.2, marginBottom: 6 }}>
        {format(amount)}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
        {count} {noun}{count !== 1 ? 's' : ''} ce mois
      </p>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────
function MiniSkeleton() {
  return (
    <div className="card" style={{ padding: '18px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ height: 11, width: 110, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--border)' }} className="animate-pulse" />
      </div>
      <div style={{ height: 24, width: 150, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} className="animate-pulse" />
      <div style={{ height: 11, width: 90, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
/**
 * OverviewTab — onglet « Vue d'ensemble » du dashboard dirigeant.
 * Prévision de trésorerie pleine largeur + résumé Ventes/Achats du mois.
 */
export function OverviewTab() {
  const { data, isLoading } = useDashboardKpis()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Approbations en attente (s'affiche seulement s'il y en a) */}
      <ApprovalsIndicator />

      {/* Prévision de trésorerie — pleine largeur */}
      <CashflowForecast />

      {/* Résumé Ventes / Achats du mois */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {isLoading || !data ? (
          <>
            <MiniSkeleton />
            <MiniSkeleton />
          </>
        ) : (
          <>
            <MiniCard
              label="Ventes du mois"
              amount={data.invoices.thisMonthAmount}
              count={data.invoices.thisMonthCount}
              noun="facture"
              icon={TrendingUp}
              color="var(--primary)"
              bg="rgba(45,125,210,0.08)"
            />
            <MiniCard
              label="Achats du mois"
              amount={data.purchases.thisMonthAmount}
              count={data.purchases.thisMonthCount}
              noun="achat"
              icon={ShoppingCart}
              color="var(--j-purchase)"
              bg="var(--j-purchase-bg)"
            />
          </>
        )}
      </div>
    </div>
  )
}
