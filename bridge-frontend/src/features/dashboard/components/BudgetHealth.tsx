'use client'

import Link from 'next/link'
import { useBudgetSummary } from '@/features/expenses/hooks'
import { usePermission } from '@/hooks/usePermission'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'

// ─── Skeleton ─────────────────────────────────────────────────
function BudgetSkeleton() {
  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ height: 16, width: 160, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ height: 34, background: 'var(--border)', borderRadius: 6, opacity: 0.4 }} className="animate-pulse" />
      ))}
    </div>
  )
}

/**
 * BudgetHealth — santé des budgets de charges de l'année : les enveloppes les plus
 * consommées (réalisé + engagé), les dépassements en tête. Onglet Achats du dashboard.
 */
export function BudgetHealth() {
  const { can } = usePermission()
  const { format } = useCurrency()
  const year = new Date().getFullYear()
  const { data, isLoading } = useBudgetSummary(year)

  if (!can('expense', 'read')) return null
  if (isLoading) return <BudgetSkeleton />

  // Budgets de charge, triés par consommation décroissante — on remonte les tensions.
  const charges = (data?.lines ?? [])
    .filter((l) => l.kind === 'charge')
    .sort((a, b) => b.percentUsed - a.percentUsed)
  const top = charges.slice(0, 5)
  const totals = data?.totals.charge

  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Suivi budgétaire {year}</h2>
          {totals && totals.count > 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Consommé <span className="amount" style={{ color: 'var(--text-1)', fontWeight: 600 }}>{format(totals.realized + totals.engaged)}</span> sur <span className="amount" style={{ fontWeight: 600 }}>{format(totals.budget)}</span>
            </p>
          )}
        </div>
        <Link href={`${ROUTES.EXPENSES}/budgets`} style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500, flexShrink: 0 }}>
          Voir les budgets →
        </Link>
      </div>

      {top.length === 0 ? (
        <div style={{ padding: '28px 0', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucun budget de charges défini pour {year}.</p>
          <Link href={`${ROUTES.EXPENSES}/budgets`} style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>Définir un budget</Link>
        </div>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, listStyle: 'none', padding: 0, margin: 0 }}>
          {top.map((b) => {
            const over = b.consumed > b.amount
            const warn = !over && b.percentUsed >= 80
            const color = over ? '#dc2626' : warn ? '#d97706' : '#16a34a'
            const rPct = b.amount > 0 ? Math.min(100, (b.realized / b.amount) * 100) : 0
            const ePct = b.amount > 0 ? Math.min(100 - rPct, (b.engaged / b.amount) * 100) : 0
            return (
              <li key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{b.percentUsed}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', display: 'flex' }} aria-hidden="true">
                  <div style={{ width: `${rPct}%`, background: color, transition: 'width 0.3s' }} />
                  <div style={{ width: `${ePct}%`, background: 'repeating-linear-gradient(45deg,#94a3b8,#94a3b8 3px,#cbd5e1 3px,#cbd5e1 6px)', transition: 'width 0.3s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)' }}>
                  <span>{over ? `dépassé de ${format(b.consumed - b.amount)}` : `dispo ${format(b.available)}`}</span>
                  <span className="amount">{format(b.amount)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <table className="sr-only" aria-label={`Suivi budgétaire ${year}`}>
        <thead><tr><th scope="col">Budget</th><th scope="col">Consommé</th><th scope="col">Budget total</th><th scope="col">%</th></tr></thead>
        <tbody>
          {top.map((b) => (
            <tr key={b.id}><td>{b.label}</td><td>{format(b.consumed)}</td><td>{format(b.amount)}</td><td>{b.percentUsed}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
