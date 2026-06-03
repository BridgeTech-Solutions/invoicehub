'use client'

import Link from 'next/link'
import { ClipboardList, ArrowRight } from 'lucide-react'
import { usePurchaseOrderStats } from '@/features/purchase-orders/hooks'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'

// ─── Skeleton ─────────────────────────────────────────────────
function PipelineSkeleton() {
  return (
    <div className="card" style={{ padding: '18px 20px', height: 150 }}>
      <div style={{ height: 14, width: 200, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div style={{ height: 90, marginTop: 16, background: 'var(--border)', borderRadius: 8, opacity: 0.4 }} className="animate-pulse" />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
/**
 * PurchaseOrderPipeline — bons de commande en cours (cycle achat amont).
 * Envoyés → Confirmés → Réceptionnés, + montant commandé du mois.
 */
export function PurchaseOrderPipeline() {
  const { format } = useCurrency()
  const { data, isLoading } = usePurchaseOrderStats()
  if (isLoading) return <PipelineSkeleton />

  const s = data ?? { total: 0, pending: 0, approved: 0, received: 0, totalAmountMonth: 0 }

  const steps: { label: string; value: number; color: string }[] = [
    { label: 'Envoyés',       value: s.pending,  color: 'var(--s-po-pending)' },
    { label: 'Confirmés',     value: s.approved, color: 'var(--s-po-approved)' },
    { label: 'Réceptionnés',  value: s.received, color: 'var(--s-po-received)' },
  ]

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--j-purchase-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={15} style={{ color: 'var(--j-purchase)' }} />
          </span>
          <h3 className="font-display" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>Bons de commande en cours</h3>
        </div>
        <Link href={ROUTES.PURCHASE_ORDERS} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
          Voir <ArrowRight size={12} />
        </Link>
      </div>

      {/* Pipeline steps */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {steps.map((step) => (
          <div key={step.label} style={{ borderLeft: `3px solid ${step.color}`, paddingLeft: 10 }}>
            <p className="amount" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{step.value}</p>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{step.label}</p>
          </div>
        ))}
      </div>

      {/* Footer : montant commandé du mois */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Commandé ce mois</span>
        <span className="amount" style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--j-purchase)' }}>{format(s.totalAmountMonth)}</span>
      </div>
    </div>
  )
}
