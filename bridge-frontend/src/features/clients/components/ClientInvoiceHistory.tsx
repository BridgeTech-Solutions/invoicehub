'use client'

import Link from 'next/link'
import { FileText } from 'lucide-react'
import { ROUTES, STATUS_LABELS } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'

// Types allégés (seront alignés sur les types factures en Phase 6)
interface InvoiceRow {
  id:       string
  number:   string
  status:   string
  totalTtc: number
  issueDate: string
  dueDate:  string
}

interface ClientInvoiceHistoryProps {
  invoices:  InvoiceRow[]
  isLoading: boolean
  clientId?: string
}

const STATUS_BADGE_CLS: Record<string, string> = {
  paid:           'badge-paid',
  issued:         'badge-issued',
  overdue:        'badge-overdue',
  partially_paid: 'badge-partial',
  draft:          'badge-draft',
  cancelled:      'badge-cancelled',
}

export function ClientInvoiceHistory({ invoices, isLoading, clientId }: ClientInvoiceHistoryProps) {
  const { format } = useCurrency()
  if (isLoading) {
    return (
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ height: 14, width: 160, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16 }}>
            {[200, 120, 80, 80, 80].map((w, j) => (
              <div key={j} style={{ height: 12, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
      }}>
        <h3 className="font-display" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 7 }}>
          <FileText size={15} style={{ color: 'var(--primary)' }} />
          Historique des factures
        </h3>
        <Link
          href={clientId ? `${ROUTES.INVOICES}?clientId=${clientId}` : ROUTES.INVOICES}
          style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
        >
          Voir toutes →
        </Link>
      </div>

      {invoices.length === 0 ? (
        <div style={{ padding: '28px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucune facture pour ce client</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>N° Facture</th>
              <th>Date émission</th>
              <th>Échéance</th>
              <th>Montant TTC</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const cls   = STATUS_BADGE_CLS[inv.status] ?? 'badge-draft'
              const label = STATUS_LABELS[inv.status]    ?? inv.status
              return (
                <tr key={inv.id}>
                  <td>
                    <Link href={`${ROUTES.INVOICES}/${inv.id}`} style={{ textDecoration: 'none' }}>
                      <span className="doc-number" style={{ color: 'var(--primary)' }}>{inv.number}</span>
                    </Link>
                  </td>
                  <td style={{ color: 'var(--text-3)', fontSize: 13 }}>{formatDate(inv.issueDate)}</td>
                  <td style={{ color: 'var(--text-3)', fontSize: 13 }}>{formatDate(inv.dueDate)}</td>
                  <td>
                    <span className="amount" style={{ fontSize: 13 }}>{format(inv.totalTtc)}</span>
                  </td>
                  <td>
                    <span className={`badge ${cls}`}>
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
