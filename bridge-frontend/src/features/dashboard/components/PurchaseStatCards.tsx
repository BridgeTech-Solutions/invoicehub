'use client'

import { ShoppingCart, Receipt, CreditCard } from 'lucide-react'
import { useDashboardKpis } from '../hooks'
import { useCurrency } from '@/hooks/useCurrency'

// ─── Mini stat card ────────────────────────────────────────────
interface MiniCardProps {
  label:  string
  amount: number
  sub:    string
  icon:   React.ElementType
  color:  string
  bg:     string
}

function MiniCard({ label, amount, sub, icon: Icon, color, bg }: MiniCardProps) {
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
        {sub}
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
 * PurchaseStatCards — 3 mini-stats achats en ligne :
 * Achats du mois, Dépenses du mois, Dettes fournisseurs.
 */
export function PurchaseStatCards() {
  const { data, isLoading } = useDashboardKpis()

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniSkeleton />
        <MiniSkeleton />
        <MiniSkeleton />
      </div>
    )
  }

  const purchaseCount = data.purchases.thisMonthCount
  const expenseCount  = data.expenses.thisMonthCount
  const payableCount  = data.payables.count

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <MiniCard
        label="Achats du mois"
        amount={data.purchases.thisMonthAmount}
        sub={`${purchaseCount} achat${purchaseCount !== 1 ? 's' : ''} ce mois`}
        icon={ShoppingCart}
        color="var(--j-purchase)"
        bg="var(--j-purchase-bg)"
      />
      <MiniCard
        label="Dépenses du mois"
        amount={data.expenses.thisMonthAmount}
        sub={`${expenseCount} dépense${expenseCount !== 1 ? 's' : ''} ce mois`}
        icon={Receipt}
        color="#d97706"
        bg="rgba(217,119,6,0.08)"
      />
      <MiniCard
        label="Dettes fournisseurs"
        amount={data.payables.outstandingAmount}
        sub={`${payableCount} facture${payableCount !== 1 ? 's' : ''} à régler`}
        icon={CreditCard}
        color="var(--s-overdue)"
        bg="var(--s-overdue-bg)"
      />
    </div>
  )
}
