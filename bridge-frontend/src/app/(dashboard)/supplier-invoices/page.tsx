'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, AlertTriangle, Clock, CreditCard, TrendingDown, MoreHorizontal, Pencil, CheckCircle2, Banknote, XCircle, Trash2, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useSupplierInvoices, useSupplierInvoiceStats, useDeleteSupplierInvoice, useApproveSupplierInvoice, useCancelSupplierInvoice } from '@/features/supplier-invoices/hooks'
import { formatXAF, formatDate, buildPageRange } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import type { SupplierInvoiceStatus, SupplierInvoiceListItem } from '@/features/supplier-invoices/types'

const STATUS_CONFIG: Record<SupplierInvoiceStatus, { label: string; color: string; bg: string }> = {
  draft:            { label: 'Brouillon',   color: '#64748b', bg: '#f1f5f9' },
  pending_approval: { label: 'En attente',  color: '#d97706', bg: '#fffbeb' },
  approved:         { label: 'Approuvée',   color: '#2D7DD2', bg: '#eff6ff' },
  partially_paid:   { label: 'Part. payée', color: '#d97706', bg: '#fffbeb' },
  paid:             { label: 'Payée',       color: '#16a34a', bg: '#f0fdf4' },
  overdue:          { label: 'En retard',   color: '#dc2626', bg: '#fef2f2' },
  cancelled:        { label: 'Annulée',     color: '#94a3b8', bg: '#f8fafc' },
}

function StatusBadge({ status }: { status: SupplierInvoiceStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

function KpiCard({ label, value, sub, color, icon: Icon }: { label: string; value: string; sub?: string; color: string; icon: React.ElementType }) {
  return (
    <div className="card" style={{ padding: '16px 20px', borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', letterSpacing: '-0.02em' }}>{value}</p>
      {sub && <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

function ActionMenu({ inv }: { inv: SupplierInvoiceListItem }) {
  const [open, setOpen] = useState(false)
  const router          = useRouter()
  const approveMutation = useApproveSupplierInvoice()
  const cancelMutation  = useCancelSupplierInvoice()
  const deleteMutation  = useDeleteSupplierInvoice()

  const canApprove = inv.status === 'pending_approval'
  const canCancel  = !['paid', 'cancelled'].includes(inv.status)
  const canDelete  = inv.status === 'draft'
  const canEdit    = ['draft', 'pending_approval'].includes(inv.status)

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}>
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', right: 0, top: 32, zIndex: 50, width: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[
              { show: true, icon: ExternalLink, label: 'Voir la facture', action: () => router.push(`${ROUTES.SUPPLIER_INVOICES}/${inv.id}`) },
              { show: canEdit,    icon: Pencil,       label: 'Modifier',     action: () => router.push(`${ROUTES.SUPPLIER_INVOICES}/${inv.id}/edit`) },
              { show: canApprove, icon: CheckCircle2, label: 'Approuver',    action: () => { approveMutation.mutate(inv.id); setOpen(false) } },
              { show: inv.status === 'approved' || inv.status === 'partially_paid' || inv.status === 'overdue',
                icon: Banknote,    label: 'Enregistrer paiement', action: () => router.push(`${ROUTES.SUPPLIER_INVOICES}/${inv.id}?pay=1`) },
              { show: canCancel,  icon: XCircle,      label: 'Annuler',      action: () => { cancelMutation.mutate(inv.id); setOpen(false) }, danger: true },
              { show: canDelete,  icon: Trash2,       label: 'Supprimer',    action: () => { if (confirm('Supprimer cette facture ?')) { deleteMutation.mutate(inv.id); setOpen(false) } }, danger: true },
            ].filter(a => a.show).map(({ icon: Icon, label, action, danger }) => (
              <button key={label} onClick={() => { action(); setOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: danger ? '#dc2626' : 'var(--text-1)', fontFamily: 'var(--font-body)', textAlign: 'left', width: '100%' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
      {buildPageRange(page, totalPages).map((p, i) => (
        <button key={i} onClick={() => p !== '…' && onChange(p as number)} disabled={p === '…'}
          style={{ minWidth: 32, height: 32, padding: '0 8px', borderRadius: 8, border: '1.5px solid', borderColor: p === page ? 'var(--primary)' : 'var(--border)', background: p === page ? 'var(--primary)' : 'var(--surface)', color: p === page ? '#fff' : p === '…' ? 'var(--text-3)' : 'var(--text-2)', cursor: p === '…' ? 'default' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          {p}
        </button>
      ))}
    </div>
  )
}

export default function SupplierInvoicesPage() {
  const [search,   setSearch]   = useState('')
  const [status,   setStatus]   = useState<SupplierInvoiceStatus | ''>('')
  const [page,     setPage]     = useState(1)

  const params = { search: search || undefined, status: status || undefined, page, limit: 20 }
  const { data, isLoading }  = useSupplierInvoices(params)
  const { data: stats }      = useSupplierInvoiceStats()
  const invoices             = data?.data ?? []
  const totalPages           = data?.totalPages ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'page-in 0.2s ease' }}>
      <PageHeader
        title="Factures fournisseurs"
        description="Gérez vos factures d'achats et suivez vos dettes"
        actions={
          <Link href={`${ROUTES.SUPPLIER_INVOICES}/new`}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}>
            <Plus size={15} /> Nouvelle facture
          </Link>
        }
      />

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KpiCard label="Total à payer"       value={formatXAF(stats?.totalDue ?? 0)}      color="var(--primary)"  icon={CreditCard} />
        <KpiCard label="En retard"           value={formatXAF(stats?.overdueAmount ?? 0)} color="#dc2626"          icon={AlertTriangle} sub={`${stats?.overdueCount ?? 0} facture${(stats?.overdueCount ?? 0) !== 1 ? 's' : ''}`} />
        <KpiCard label="À payer sous 7j"     value={formatXAF(stats?.dueSoon ?? 0)}       color="#d97706"          icon={Clock} />
        <KpiCard label="Total du mois"       value={formatXAF(0)}                          color="#16a34a"          icon={TrendingDown} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher une facture, fournisseur…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none' }}
            onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value as SupplierInvoiceStatus | ''); setPage(1) }}
          style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', cursor: 'pointer', outline: 'none' }}
          onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
          onBlur={e  => (e.target.style.borderColor = 'var(--border)')}>
          <option value="">Tous les statuts</option>
          {(Object.keys(STATUS_CONFIG) as SupplierInvoiceStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['N° Facture', 'Fournisseur', 'Réf. fournisseur', 'Date', 'Échéance', 'Montant TTC', 'Solde dû', 'Statut', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: h === 'Montant TTC' || h === 'Solde dû' ? 'right' : 'left', fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', background: 'var(--surface-2)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} style={{ padding: '12px 14px' }}>
                        <div style={{ height: 14, background: 'var(--border)', borderRadius: 4, width: j === 0 ? 100 : j === 1 ? 140 : 80 }} className="animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
                : invoices.length === 0
                  ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '48px 14px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
                        Aucune facture trouvée
                      </td>
                    </tr>
                  )
                  : invoices.map(inv => {
                    const isOverdue  = inv.status === 'overdue'
                    const hasDue     = inv.balanceDue > 0
                    return (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        onClick={() => window.location.href = `${ROUTES.SUPPLIER_INVOICES}/${inv.id}`}>
                        <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{inv.number}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <Link href={`${ROUTES.SUPPLIERS}/${inv.supplierId}`} onClick={e => e.stopPropagation()}
                            style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', textDecoration: 'none' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-1)')}>
                            {inv.supplier.name}
                          </Link>
                        </td>
                        <td style={{ padding: '11px 14px', color: 'var(--text-3)', fontSize: 12.5 }}>{inv.supplierRef ?? '—'}</td>
                        <td style={{ padding: '11px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(inv.invoiceDate)}</td>
                        <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', color: isOverdue ? '#dc2626' : 'var(--text-2)', fontWeight: isOverdue ? 600 : 400 }}>
                          {inv.dueDate ? formatDate(inv.dueDate) : '—'}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-1)', fontWeight: 600 }}>{formatXAF(inv.totalTtc)}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: hasDue ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                          {hasDue ? formatXAF(inv.balanceDue) : '—'}
                        </td>
                        <td style={{ padding: '11px 14px' }}><StatusBadge status={inv.status} /></td>
                        <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                          <ActionMenu inv={inv} />
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            {data?.total ?? 0} facture{(data?.total ?? 0) !== 1 ? 's' : ''}
          </span>
          <Pagination page={page} totalPages={totalPages} onChange={p => setPage(p)} />
        </div>
      </div>
    </div>
  )
}
