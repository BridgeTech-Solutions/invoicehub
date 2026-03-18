'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, FileDown, Copy, Pencil, Zap, CreditCard, Download } from 'lucide-react'
import { useInvoices, useIssueInvoice, useDuplicateInvoice, useDownloadInvoicePdf } from '@/features/invoices/hooks'
import { invoicesApi } from '@/features/invoices/api'
import { toast } from 'sonner'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { formatDate, formatXAF } from '@/lib/utils'
import { ROUTES, STATUS_LABELS, INVOICE_TYPES, PAYMENT_METHODS } from '@/lib/constants'
import type { InvoiceType, InvoiceStatus, InvoiceListItem } from '@/features/invoices/types'

// ─── Status badge ────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  draft:          { bg: 'rgba(148,163,184,0.15)', color: '#64748b' },
  issued:         { bg: 'rgba(59,130,246,0.1)',   color: '#2563eb' },
  partially_paid: { bg: 'rgba(245,158,11,0.1)',   color: '#d97706' },
  paid:           { bg: 'rgba(16,185,129,0.1)',   color: '#059669' },
  overdue:        { bg: 'rgba(249,115,22,0.1)',   color: '#ea580c' },
  cancelled:      { bg: 'rgba(239,68,68,0.1)',    color: '#dc2626' },
}

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  standard:  { bg: 'rgba(45,125,210,0.1)',  color: 'var(--primary)' },
  acompte:   { bg: 'rgba(124,58,237,0.1)',  color: '#7c3aed'        },
  solde:     { bg: 'rgba(8,145,178,0.1)',   color: '#0891b2'        },
  avoir:     { bg: 'rgba(244,63,94,0.1)',   color: '#e11d48'        },
  recurring: { bg: 'rgba(22,163,74,0.1)',   color: '#16a34a'        },
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11.5, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.05em', padding: '4px 11px', borderRadius: 20, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function TypeBadge({ type }: { type: InvoiceType }) {
  const t = TYPE_STYLE[type] ?? TYPE_STYLE.standard
  return (
    <span style={{ background: t.bg, color: t.color, fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 20, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {INVOICE_TYPES[type as keyof typeof INVOICE_TYPES] ?? type}
    </span>
  )
}

// ─── Row actions dropdown ────────────────────────────────────────

function RowActions({ invoice }: { invoice: InvoiceListItem }) {
  const router        = useRouter()
  const issueMutation = useIssueInvoice()
  const dupMutation   = useDuplicateInvoice()
  const pdfMutation   = useDownloadInvoicePdf()

  const canEdit = invoice.status === 'draft'
  const canPay  = ['issued', 'partially_paid', 'overdue'].includes(invoice.status)

  const items = [
    ...(canEdit ? [{ label: 'Modifier', icon: Pencil, onClick: () => router.push(`${ROUTES.INVOICES}/${invoice.id}?mode=edit`) }] : []),
    ...(canEdit ? [{ label: 'Émettre',  icon: Zap,    onClick: () => issueMutation.mutate(invoice.id) }] : []),
    ...(canPay  ? [{ label: 'Paiement', icon: CreditCard, onClick: () => router.push(`${ROUTES.INVOICES}/${invoice.id}`) }] : []),
    { label: 'Télécharger PDF', icon: FileDown, onClick: () => pdfMutation.mutate({ id: invoice.id, filename: `${invoice.number.replace(/\//g, '-')}.pdf` }) },
    { label: 'Dupliquer',       icon: Copy,     onClick: () => dupMutation.mutate(invoice.id), separator: true },
  ]

  return <ActionMenu items={items} />
}

// ─── Skeleton rows ───────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[120, 80, 160, 100, 100, 80, 80].map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div style={{ height: 12, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

// ─── Tab config ──────────────────────────────────────────────────

type Tab = { key: string; label: string; status?: InvoiceStatus; overdue?: boolean }

const TABS: Tab[] = [
  { key: 'all',           label: 'Tous'           },
  { key: 'draft',         label: 'Brouillon',     status: 'draft'         },
  { key: 'issued',        label: 'Émise',         status: 'issued'        },
  { key: 'partially',     label: 'Part. payée',   status: 'partially_paid' },
  { key: 'overdue',       label: 'En retard',     overdue: true           },
  { key: 'paid',          label: 'Payée',         status: 'paid'          },
  { key: 'cancelled',     label: 'Annulée',       status: 'cancelled'     },
]

// ─── Main page ───────────────────────────────────────────────────

export default function InvoicesPage() {
  const router = useRouter()

  const [activeTab,   setActiveTab]   = useState('all')
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState<InvoiceType | ''>('')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [page,        setPage]        = useState(1)
  const [exporting,   setExporting]   = useState(false)

  const currentTab = TABS.find(t => t.key === activeTab)!

  async function handleExport() {
    setExporting(true)
    try {
      await invoicesApi.exportCsv({
        search:   search   || undefined,
        dateFrom: dateFrom || undefined,
        dateTo:   dateTo   || undefined,
        ...(currentTab.status  && { status: currentTab.status }),
        ...(currentTab.overdue && { overdue: true }),
        ...(typeFilter         && { type: typeFilter }),
      })
      toast.success('Export CSV téléchargé')
    } catch {
      toast.error('Erreur lors de l\'export')
    } finally {
      setExporting(false)
    }
  }

  const { data, isLoading } = useInvoices({
    page,
    limit: 20,
    search:   search   || undefined,
    dateFrom: dateFrom || undefined,
    dateTo:   dateTo   || undefined,
    ...(currentTab.status  && { status: currentTab.status }),
    ...(currentTab.overdue && { overdue: true }),
    ...(typeFilter         && { type: typeFilter }),
  })

  const invoices = data?.data ?? []
  const total    = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const tabStyle = (key: string): React.CSSProperties => ({
    padding: '7px 16px', borderRadius: 20, fontSize: 13,
    fontFamily: 'var(--font-display)', fontWeight: 600,
    cursor: 'pointer', border: 'none',
    background: activeTab === key ? 'var(--primary)' : 'transparent',
    color: activeTab === key ? '#fff' : 'var(--text-3)',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Factures</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '2px 0 0' }}>
            {total > 0 ? `${total} facture${total > 1 ? 's' : ''}` : 'Aucune facture'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.7 : 1 }}
          >
            <Download size={14} /> {exporting ? 'Export…' : 'Exporter CSV'}
          </button>
          <Link
            href={`${ROUTES.PAYMENTS}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, textDecoration: 'none' }}
          >
            <CreditCard size={14} /> Paiements
          </Link>
          <Link
            href={`${ROUTES.INVOICES}/new`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, textDecoration: 'none', boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}
          >
            <Plus size={14} /> Nouvelle facture
          </Link>
        </div>
      </div>

      {/* Filters row */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200, maxWidth: 320 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Rechercher par n°, client, sujet…"
              style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as InvoiceType | ''); setPage(1) }}
            style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">Tous les types</option>
            {Object.entries(INVOICE_TYPES).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          {/* Date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Du</span>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }} />
            <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>au</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }} />
            {(dateFrom || dateTo) && (
              <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}
                style={{ padding: '6px 8px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          {TABS.map(tab => (
            <button key={tab.key} type="button" onClick={() => { setActiveTab(tab.key); setPage(1) }} style={tabStyle(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'var(--surface)' }}>
                {['N° FACTURE', 'TYPE', 'CLIENT', 'ÉCHÉANCE', 'TOTAL TTC', 'PAYÉ', 'STATUT', ''].map((h, i) => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: i >= 4 && i <= 5 ? 'right' : 'left', whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                : invoices.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '48px 24px', textAlign: 'center' }}>
                        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>Aucune facture trouvée</p>
                        {!search && activeTab === 'all' && (
                          <Link href={`${ROUTES.INVOICES}/new`} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', marginTop: 8, display: 'inline-block', fontWeight: 500 }}>
                            Créer la première facture →
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                  : invoices.map((inv) => {
                    const isOverdue = !['paid', 'cancelled'].includes(inv.status) && new Date(inv.dueDate) < new Date()
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => router.push(`${ROUTES.INVOICES}/${inv.id}`)}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: 0, fontFamily: 'var(--font-mono)' }}>
                            {inv.number}
                          </p>
                          {inv.subject && (
                            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {inv.subject}
                            </p>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <TypeBadge type={inv.type} />
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{inv.client.name}</p>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <p style={{ fontSize: 13, color: isOverdue ? '#ef4444' : 'var(--text-2)', margin: 0, fontWeight: isOverdue ? 600 : 400 }}>
                            {formatDate(inv.dueDate)} {isOverdue && '⚠'}
                          </p>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', margin: 0, whiteSpace: 'nowrap' }}>
                            {formatXAF(Number(inv.totalTtc))}
                          </p>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          {Number(inv.amountPaid) > 0 ? (
                            <p style={{ fontSize: 13, fontWeight: 600, color: '#10b981', fontFamily: 'var(--font-mono)', margin: 0, whiteSpace: 'nowrap' }}>
                              {formatXAF(Number(inv.amountPaid))}
                            </p>
                          ) : (
                            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>—</p>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <StatusBadge status={isOverdue && inv.status === 'issued' ? 'overdue' : inv.status} />
                        </td>
                        <td style={{ padding: '14px 10px' }} onClick={(e) => e.stopPropagation()}>
                          <RowActions invoice={inv} />
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              Page {page} sur {totalPages} · {total} factures
            </p>
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
