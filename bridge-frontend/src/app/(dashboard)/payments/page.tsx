'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, FileDown, Trash2, Loader2, ChevronRight } from 'lucide-react'
import { usePayments, useDeletePayment, useDownloadReceipt } from '@/features/invoices/hooks'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES, PAYMENT_METHODS } from '@/lib/constants'
import { usePermission } from '@/hooks/usePermission'
import type { PaymentMethod } from '@/features/invoices/types'

// ─── Skeleton ───────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[100, 140, 120, 90, 100, 60].map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div style={{ height: 12, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

// ─── Page ────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const { format } = useCurrency()
  const router = useRouter()
  const { can } = usePermission()

  const [search,      setSearch]      = useState('')
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | ''>('')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [page,        setPage]        = useState(1)

  const { data, isLoading } = usePayments({
    page,
    limit: 25,
    method: methodFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const deleteMutation  = useDeletePayment()
  const receiptMutation = useDownloadReceipt()

  const payments   = data?.data ?? []
  const total      = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  // Client-side search filter (number / client name / reference)
  const filtered = search.trim()
    ? payments.filter(p =>
        p.invoice?.number.toLowerCase().includes(search.toLowerCase()) ||
        p.invoice?.client.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.reference ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : payments

  const inputCss: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Link href={ROUTES.INVOICES} style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>Factures</Link>
            <ChevronRight size={12} style={{ color: 'var(--text-3)' }} />
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Paiements</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            Paiements reçus
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '2px 0 0' }}>
            {total > 0 ? `${total} paiement${total > 1 ? 's' : ''}` : 'Aucun paiement'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180, maxWidth: 280 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° facture, client, référence…"
              style={{ ...inputCss, paddingLeft: 32, width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Method */}
          <select
            value={methodFilter}
            onChange={(e) => { setMethodFilter(e.target.value as PaymentMethod | ''); setPage(1) }}
            style={{ ...inputCss, cursor: 'pointer' }}
          >
            <option value="">Tous les modes</option>
            {Object.entries(PAYMENT_METHODS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          {/* Date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Du</label>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} style={{ ...inputCss, fontSize: 13 }} />
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Au</label>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} style={{ ...inputCss, fontSize: 13 }} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ background: 'var(--surface)' }}>
                {['Date', 'Facture', 'Client', 'Mode', 'Référence', 'Montant', ''].map((h, i) => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: i === 5 ? 'right' : 'left', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '48px 24px', textAlign: 'center' }}>
                        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>Aucun paiement trouvé</p>
                      </td>
                    </tr>
                  )
                  : filtered.map((pay) => (
                    <tr
                      key={pay.id}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s', cursor: 'pointer' }}
                      onClick={() => pay.invoiceId && router.push(`${ROUTES.INVOICES}/${pay.invoiceId}`)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--text-2)' }}>
                        {formatDate(pay.paymentDate)}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        {pay.invoice ? (
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                            {pay.invoice.number}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '13px 16px', fontSize: 13.5, color: 'var(--text-1)', fontWeight: 600 }}>
                        {pay.invoice?.client.name ?? '—'}
                      </td>
                      <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--text-2)' }}>
                        {PAYMENT_METHODS[pay.method as keyof typeof PAYMENT_METHODS] ?? pay.method}
                      </td>
                      <td style={{ padding: '13px 16px', fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                        {pay.reference ?? '—'}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap' }}>
                        +{format(Number(pay.amount))}
                      </td>
                      <td style={{ padding: '13px 10px', width: 72 }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button type="button" title="Reçu PDF" disabled={receiptMutation.isPending}
                            onClick={() => receiptMutation.mutate({ id: pay.id, filename: `recu-${pay.id.slice(0,8)}.pdf` })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--primary)' }}>
                            {receiptMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                          </button>
                          {can('payment', 'delete') && (
                            <button type="button" title="Annuler" disabled={deleteMutation.isPending}
                              onClick={() => { if (confirm('Annuler ce paiement ? Le solde de la facture sera recalculé.')) deleteMutation.mutate(pay.id) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}>
                              {deleteMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Page {page} sur {totalPages}</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                const p = i + 1
                return (
                  <button key={p} type="button" onClick={() => setPage(p)}
                    style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', border: '1.5px solid', borderColor: p === page ? 'var(--primary)' : 'var(--border)', background: p === page ? 'var(--primary)' : 'transparent', color: p === page ? '#fff' : 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                    {p}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
