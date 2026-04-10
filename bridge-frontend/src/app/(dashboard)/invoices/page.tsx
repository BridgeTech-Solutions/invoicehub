'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, FileDown, Copy, Pencil, Zap, CreditCard,
  Download, Trash2, X, ChevronLeft, ChevronRight,
  Loader2, Receipt,
} from 'lucide-react'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { DocListItem, SkeletonDocItem } from '@/components/ui/DocListItem'
import {
  useInvoices, useIssueInvoice, useDuplicateInvoice,
  useDownloadInvoicePdf, useDeleteInvoice,
} from '@/features/invoices/hooks'
import { invoicesApi } from '@/features/invoices/api'
import { toast } from 'sonner'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { formatDate, buildPageRange } from '@/lib/utils'
import { ROUTES, STATUS_LABELS, INVOICE_TYPES } from '@/lib/constants'
import type { InvoiceType, InvoiceStatus, InvoiceListItem } from '@/features/invoices/types'

// ─── Badges ───────────────────────────────────────────────────

const STATUS_BADGE_CLASS: Record<string, string> = {
  draft:          'badge-draft',
  issued:         'badge-issued',
  partially_paid: 'badge-partial',
  paid:           'badge-paid',
  overdue:        'badge-overdue',
  cancelled:      'badge-cancelled',
}

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  standard:  { bg: 'rgba(45,125,210,0.1)',  color: 'var(--primary)' },
  acompte:   { bg: 'rgba(124,58,237,0.1)',  color: '#7c3aed'        },
  solde:     { bg: 'rgba(8,145,178,0.1)',   color: '#0891b2'        },
  avoir:     { bg: 'rgba(244,63,94,0.1)',   color: '#e11d48'        },
  recurring: { bg: 'rgba(22,163,74,0.1)',   color: '#16a34a'        },
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cls = STATUS_BADGE_CLASS[status] ?? 'badge-draft'
  return (
    <span className={`badge ${cls}`} style={{ textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0 }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function TypeBadge({ type }: { type: InvoiceType }) {
  const t = TYPE_STYLE[type] ?? TYPE_STYLE['standard']!
  return (
    <span
      aria-label={`Type : ${INVOICE_TYPES[type as keyof typeof INVOICE_TYPES] ?? type}`}
      style={{ background: t.bg, color: t.color, fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}
    >
      {INVOICE_TYPES[type as keyof typeof INVOICE_TYPES] ?? type}
    </span>
  )
}

// ─── Confirm delete modal ─────────────────────────────────────

function ConfirmDeleteModal({
  invoice, onConfirm, onCancel,
}: {
  invoice: InvoiceListItem
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog" aria-modal="true"
      aria-labelledby="confirm-title" aria-describedby="confirm-desc"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', padding: 16 }}
      onClick={onCancel}
    >
      <div
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Trash2 size={16} style={{ color: '#ef4444' }} aria-hidden="true" />
          </div>
          <h2 id="confirm-title" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0, fontFamily: 'var(--font-display)' }}>
            Supprimer la facture
          </h2>
        </div>
        <p id="confirm-desc" style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 20px' }}>
          Voulez-vous vraiment supprimer <strong>{invoice.number}</strong> ? Cette action est irréversible.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '10px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
            Annuler
          </button>
          <button type="button" onClick={onConfirm}
            style={{ padding: '10px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Row actions ─────────────────────────────────────────────

function RowActions({ invoice, onDeleteRequest }: { invoice: InvoiceListItem; onDeleteRequest: () => void }) {
  const router   = useRouter()
  const issueMut = useIssueInvoice()
  const dupMut   = useDuplicateInvoice()
  const pdfMut   = useDownloadInvoicePdf()

  const canEdit = invoice.status === 'draft'
  const canPay  = ['issued', 'partially_paid', 'overdue'].includes(invoice.status)

  const items = [
    ...(canEdit ? [{ label: 'Modifier',             icon: Pencil,    onClick: () => router.push(`${ROUTES.INVOICES}/${invoice.id}?mode=edit`) }] : []),
    ...(canEdit ? [{ label: 'Émettre',              icon: Zap,       onClick: () => issueMut.mutate(invoice.id) }] : []),
    ...(canPay  ? [{ label: 'Enregistrer paiement', icon: CreditCard, onClick: () => router.push(`${ROUTES.INVOICES}/${invoice.id}`) }] : []),
    { label: 'Télécharger PDF', icon: FileDown, onClick: () => pdfMut.mutate({ id: invoice.id, filename: `${invoice.number.replace(/\//g, '-')}.pdf` }) },
    { label: 'Dupliquer',       icon: Copy,     onClick: () => dupMut.mutate(invoice.id), separator: true },
    ...(canEdit ? [{ label: 'Supprimer', icon: Trash2, onClick: onDeleteRequest, danger: true }] : []),
  ]

  return <ActionMenu items={items} />
}

// ─── Tab config ───────────────────────────────────────────────

type Tab = { key: string; label: string; status?: InvoiceStatus; overdue?: boolean }

const TABS: Tab[] = [
  { key: 'all',       label: 'Tous'         },
  { key: 'draft',     label: 'Brouillon',   status: 'draft'          },
  { key: 'issued',    label: 'Émise',       status: 'issued'         },
  { key: 'partially', label: 'Part. payée', status: 'partially_paid' },
  { key: 'overdue',   label: 'En retard',   overdue: true            },
  { key: 'paid',      label: 'Payée',       status: 'paid'           },
  { key: 'cancelled', label: 'Annulée',     status: 'cancelled'      },
]

// ─── Empty state ──────────────────────────────────────────────

function EmptyState({ search, activeTab }: { search: string; activeTab: string }) {
  if (search) return (
    <div style={{ padding: '52px 24px', textAlign: 'center' }}>
      <Search size={28} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block' }} aria-hidden="true" />
      <p style={{ fontSize: 14, color: 'var(--text-2)', margin: '0 0 4px', fontWeight: 600 }}>Aucun résultat pour « {search} »</p>
      <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Essayez un autre numéro, nom de client ou sujet.</p>
    </div>
  )
  if (activeTab !== 'all') {
    const label = TABS.find(t => t.key === activeTab)?.label ?? activeTab
    return (
      <RichEmptyState icon={Receipt} title={`Aucune facture ${label.toLowerCase()}`}
        description="Aucune facture ne correspond à ce filtre pour le moment." compact />
    )
  }
  return (
    <RichEmptyState
      icon={Receipt}
      title="Commencez à facturer vos clients"
      description="Créez des factures standard, d'acompte ou de solde en quelques clics. Avoirs automatiques à l'annulation, numérotation SYSCOHADA, PDF professionnel."
      features={['Standard', 'Acompte & Solde', 'Avoir auto', 'PDF BTS']}
      cta={{ label: '+ Nouvelle facture', href: `${ROUTES.INVOICES}/new` }}
      secondaryCta={{ label: 'Voir le guide', href: ROUTES.GUIDE }}
    />
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function InvoicesPage() {
  const [activeTab,    setActiveTab]    = useState('all')
  const [search,       setSearch]       = useState('')
  const [typeFilter,   setTypeFilter]   = useState<InvoiceType | ''>('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [page,         setPage]         = useState(1)
  const [exporting,    setExporting]    = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<InvoiceListItem | null>(null)

  const deleteMutation = useDeleteInvoice()
  const currentTab     = TABS.find(t => t.key === activeTab)!

  const { data, isLoading } = useInvoices({
    page, limit: 20,
    search:   search   || undefined,
    dateFrom: dateFrom || undefined,
    dateTo:   dateTo   || undefined,
    ...(currentTab.status  && { status: currentTab.status }),
    ...(currentTab.overdue && { overdue: true }),
    ...(typeFilter         && { type: typeFilter }),
  })

  const invoices   = data?.data       ?? []
  const total      = data?.total      ?? 0
  const totalPages = data?.totalPages ?? 1
  const pageRange  = buildPageRange(page, totalPages)

  async function handleExport() {
    setExporting(true)
    try {
      await invoicesApi.exportCsv({
        search: search || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
        ...(currentTab.status  && { status: currentTab.status }),
        ...(currentTab.overdue && { overdue: true }),
        ...(typeFilter         && { type: typeFilter }),
      })
      toast.success('Export CSV téléchargé')
    } catch {
      toast.error("Erreur lors de l'export")
    } finally { setExporting(false) }
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id)
    setDeleteTarget(null)
  }

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 'var(--radius-md)', cursor: 'pointer',
    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
    transition: 'all 0.15s', minHeight: 44, padding: '0 16px',
  }

  return (
    <>
      {deleteTarget && (
        <ConfirmDeleteModal
          invoice={deleteTarget}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              Factures
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '2px 0 0' }} aria-live="polite" aria-atomic="true">
              {isLoading ? 'Chargement…' : total > 0 ? `${total} facture${total > 1 ? 's' : ''}` : 'Aucune facture'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleExport} disabled={exporting}
              aria-label="Exporter la liste en CSV"
              style={{ ...btnBase, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', opacity: exporting ? 0.7 : 1, cursor: exporting ? 'not-allowed' : 'pointer' }}>
              {exporting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
              {exporting ? 'Export…' : 'Exporter CSV'}
            </button>
            <Link href={ROUTES.PAYMENTS} aria-label="Aller à la page Paiements"
              style={{ ...btnBase, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', textDecoration: 'none' }}>
              <CreditCard size={14} aria-hidden="true" />
              Paiements
            </Link>
            <Link href={`${ROUTES.INVOICES}/new`} aria-label="Créer une nouvelle facture"
              style={{ ...btnBase, background: 'var(--primary)', color: '#fff', border: 'none', boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}>
              <Plus size={14} aria-hidden="true" />
              Nouvelle facture
            </Link>
          </div>
        </div>

        {/* ── Filtres ── */}
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Recherche */}
            <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160 }}>
              <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <label htmlFor="inv-search" className="sr-only">Rechercher une facture</label>
              <input id="inv-search" type="search" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="N°, client, sujet…"
                style={{ width: '100%', paddingLeft: 32, paddingRight: 10, height: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Filtre type */}
            <label htmlFor="inv-type" className="sr-only">Type de facture</label>
            <select id="inv-type" value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value as InvoiceType | ''); setPage(1) }}
              style={{ height: 44, padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}>
              <option value="">Tous les types</option>
              {Object.entries(INVOICE_TYPES).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>

            {/* Période */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
              role="group" aria-label="Filtrer par période">
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }} aria-hidden="true">Période :</span>
              <label htmlFor="inv-date-from" className="sr-only">Date de début</label>
              <input id="inv-date-from" type="date" value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                style={{ height: 44, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12.5, color: 'var(--text-3)' }} aria-hidden="true">→</span>
              <label htmlFor="inv-date-to" className="sr-only">Date de fin</label>
              <input id="inv-date-to" type="date" value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                style={{ height: 44, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
              />
              {(dateFrom || dateTo) && (
                <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}
                  aria-label="Réinitialiser les dates"
                  style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Tabs statut */}
          <div role="tablist" aria-label="Filtrer par statut"
            style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            {TABS.map(tab => {
              const active = activeTab === tab.key
              return (
                <button key={tab.key} type="button" role="tab" aria-selected={active}
                  onClick={() => { setActiveTab(tab.key); setPage(1) }}
                  style={{ padding: '7px 16px', minHeight: 44, borderRadius: 20, fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', border: 'none', background: active ? 'var(--primary)' : 'transparent', color: active ? '#fff' : 'var(--text-3)', transition: 'all 0.15s' }}>
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Liste ── */}
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div aria-label="Liste des factures" aria-busy={isLoading}>
            {isLoading ? (
              Array.from({ length: 7 }).map((_, i) => <SkeletonDocItem key={i} />)
            ) : invoices.length === 0 ? (
              <EmptyState search={search} activeTab={activeTab} />
            ) : (
              invoices.map(inv => {
                const isOverdue  = inv.status === 'overdue'
                const amountPaid = Number(inv.amountPaid)
                const totalTtc   = Number(inv.totalTtc)
                const showPayBar = ['partially_paid', 'overdue'].includes(inv.status) && amountPaid > 0
                return (
                  <DocListItem
                    key={inv.id}
                    id={inv.id}
                    number={inv.number}
                    subject={inv.subject}
                    clientName={inv.client.name}
                    issueDate={formatDate(inv.issueDate)}
                    limitDate={formatDate(inv.dueDate)}
                    limitLabel="Éch."
                    limitAlert={isOverdue}
                    totalTtc={totalTtc}
                    statusBadge={<StatusBadge status={inv.status} />}
                    typeBadge={<TypeBadge type={inv.type} />}
                    href={`${ROUTES.INVOICES}/${inv.id}`}
                    actions={<RowActions invoice={inv} onDeleteRequest={() => setDeleteTarget(inv)} />}
                    amountPaid={amountPaid}
                    showPayBar={showPayBar}
                    alertBg={isOverdue}
                  />
                )
              })
            )}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <nav aria-label="Pagination des factures"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
                Page {page}/{totalPages} · {total} facture{total > 1 ? 's' : ''}
              </p>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  aria-label="Page précédente"
                  style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'transparent', color: page === 1 ? 'var(--text-3)' : 'var(--text-2)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                {pageRange.map((p, i) =>
                  p === '…'
                    ? <span key={`e-${i}`} aria-hidden="true" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-3)' }}>…</span>
                    : (
                      <button key={p} type="button" onClick={() => setPage(p)}
                        aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined}
                        style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', border: '1.5px solid', borderColor: p === page ? 'var(--primary)' : 'var(--border)', background: p === page ? 'var(--primary)' : 'transparent', color: p === page ? '#fff' : 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {p}
                      </button>
                    )
                )}
                <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  aria-label="Page suivante"
                  style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'transparent', color: page === totalPages ? 'var(--text-3)' : 'var(--text-2)', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </nav>
          )}
        </div>
      </div>
    </>
  )
}
