'use client'

import Link from 'next/link'
import { useDashboardKpis } from '../hooks'
import { formatXAF, formatDate } from '@/lib/utils'
import { ROUTES, STATUS_LABELS } from '@/lib/constants'

// ─── Status badge config ───────────────────────────────────────
const STATUS_BADGE_CLS: Record<string, string> = {
  paid:           'badge-paid',
  issued:         'badge-issued',
  overdue:        'badge-overdue',
  partially_paid: 'badge-partial',
  draft:          'badge-draft',
  cancelled:      'badge-cancelled',
}

// ─── Skeleton ─────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ height: 16, width: 140, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ height: 14, width: 60, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 100px', gap: 16, padding: '13px 20px', borderBottom: '1px solid var(--border)' }}>
          {[220, 140, 120, 80, 80].map((w, j) => (
            <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
export function RecentInvoicesTable() {
  const { data, isLoading } = useDashboardKpis()

  if (isLoading) return <TableSkeleton />
  if (!data) return null

  const invoices = data.recentInvoices.slice(0, 10)

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
      }}>
        <h2 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
          Factures récentes
        </h2>
        <Link
          href={ROUTES.INVOICES}
          style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
        >
          Voir tout →
        </Link>
      </div>

      {invoices.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucune facture pour le moment</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>N° Facture</th>
              <th>Client</th>
              <th>Date</th>
              <th>Montant TTC</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const badgeCls = STATUS_BADGE_CLS[inv.status] ?? 'badge-draft'
              const label    = STATUS_LABELS[inv.status]    ?? inv.status
              return (
                <tr key={inv.id}>
                  <td>
                    <Link
                      href={`${ROUTES.INVOICES}/${inv.id}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <span className="doc-number" style={{ color: 'var(--primary)' }}>
                        {inv.number}
                      </span>
                    </Link>
                  </td>
                  <td style={{ fontWeight: 500, color: 'var(--text-1)' }}>
                    {inv.client.name}
                  </td>
                  <td style={{ color: 'var(--text-3)', fontSize: 13 }}>
                    {formatDate(inv.issueDate)}
                  </td>
                  <td>
                    <span className="amount" style={{ fontSize: 13 }}>
                      {formatXAF(inv.totalTtc)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${badgeCls}`}>
                      <span className="badge-dot" style={{ background: 'currentColor' }} />
                      {label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
