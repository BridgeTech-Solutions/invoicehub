'use client'

import { useState, useMemo, useId, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Plus, Search, FileText, Clock, Copy, Trash2,
  FileDown, Send, Eye, Download, X, ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { DocListItem, SkeletonDocItem } from '@/components/ui/DocListItem'
import { useRouter } from 'next/navigation'
import {
  useProformas, useSendProforma, useDuplicateProforma,
  useDeleteProforma, useDownloadProformaPdf,
} from '@/features/proformas/hooks'
import { proformasApi } from '@/features/proformas/api'
import { toast } from 'sonner'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePermission } from '@/hooks/usePermission'
import { formatDate, buildPageRange } from '@/lib/utils'
import { ROUTES, STATUS_LABELS, PROFORMA_STATUSES } from '@/lib/constants'
import type { ProformaListItem, ProformaStatus } from '@/features/proformas/types'

// ─── Status badge ───────────────────────────────────────────────

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  draft:    { background: 'rgba(148,163,184,0.15)', color: '#64748b' },
  sent:     { background: 'rgba(59,130,246,0.1)',   color: '#2563eb' },
  accepted: { background: 'rgba(16,185,129,0.1)',   color: '#059669' },
  rejected: { background: 'rgba(244,63,94,0.1)',    color: '#e11d48' },
  expired:  { background: 'rgba(249,115,22,0.1)',   color: '#ea580c' },
}

function StatusBadge({ status }: { status: ProformaStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft!
  return (
    <span
      aria-label={`Statut : ${STATUS_LABELS[status] ?? status}`}
      style={{
        ...s, fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
        letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 20,
        textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── Confirm delete modal ───────────────────────────────────────

function ConfirmDeleteModal({
  number, onConfirm, onCancel, isPending,
}: { number: string; onConfirm: () => void; onCancel: () => void; isPending: boolean }) {
  const titleId    = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { confirmRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <h2 id={titleId} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 10px' }}>
          Supprimer la proforma
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 22px', lineHeight: 1.6 }}>
          Supprimer <strong>«&nbsp;{number}&nbsp;»</strong> ? Cette action est irréversible.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, minHeight: 44 }}>
            Annuler
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={isPending}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: '#ef4444', color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: isPending ? 0.65 : 1, display: 'flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
            {isPending && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Row actions ────────────────────────────────────────────────

function RowActions({ p }: { p: ProformaListItem }) {
  const router  = useRouter()
  const { can } = usePermission()
  const sendM   = useSendProforma()
  const dupM    = useDuplicateProforma()
  const delM    = useDeleteProforma()
  const pdfM    = useDownloadProformaPdf()
  const [deleteTarget, setDeleteTarget] = useState<ProformaListItem | null>(null)

  const canSend   = (p.status === 'draft' || p.status === 'rejected') && can('client', 'create')
  const canDelete = p.status === 'draft' && can('client', 'create')

  const items = [
    { label: 'Voir détail',     icon: Eye,      onClick: () => router.push(`${ROUTES.PROFORMAS}/${p.id}`) },
    { label: 'Télécharger PDF', icon: FileDown, onClick: () => pdfM.mutate({ id: p.id, filename: `${p.number.replace(/\//g, '-')}.pdf` }) },
    { label: 'Dupliquer',       icon: Copy,     onClick: () => dupM.mutate(p.id) },
    ...(canSend   ? [{ label: 'Envoyer au client', icon: Send,   onClick: () => sendM.mutate(p.id), separator: true }] : []),
    ...(canDelete ? [{ label: 'Supprimer',          icon: Trash2, onClick: () => setDeleteTarget(p), danger: true, separator: !canSend }] : []),
  ]

  return (
    <>
      <ActionMenu items={items} />
      {deleteTarget && (
        <ConfirmDeleteModal
          number={deleteTarget.number}
          onConfirm={() => delM.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
          onCancel={() => setDeleteTarget(null)}
          isPending={delM.isPending}
        />
      )}
    </>
  )
}

// ─── Tab config ─────────────────────────────────────────────────

type StatusTab = ProformaStatus | 'all'

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'all',      label: 'Tous'      },
  { key: 'draft',    label: 'Brouillon' },
  { key: 'sent',     label: 'Envoyées'  },
  { key: 'accepted', label: 'Acceptées' },
  { key: 'rejected', label: 'Rejetées'  },
  { key: 'expired',  label: 'Expirées'  },
]

// ─── Page ───────────────────────────────────────────────────────

export default function ProformasPage() {
  const [tab,       setTab]       = useState<StatusTab>('all')
  const [search,    setSearch]    = useState('')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [page,      setPage]      = useState(1)
  const [exporting, setExporting] = useState(false)
  const { can } = usePermission()

  const searchId  = useId()
  const dateGrpId = useId()

  async function handleExport() {
    setExporting(true)
    try {
      await proformasApi.exportCsv({
        ...(tab !== 'all' && { status: tab }),
        ...(search   && { search }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo   && { dateTo }),
      })
      toast.success('Export CSV téléchargé')
    } catch {
      toast.error("Erreur lors de l'export")
    } finally {
      setExporting(false)
    }
  }

  const params = useMemo(() => ({
    page,
    limit: 20,
    ...(tab !== 'all' && { status: tab }),
    ...(search   && { search }),
    ...(dateFrom && { dateFrom }),
    ...(dateTo   && { dateTo }),
  }), [tab, search, dateFrom, dateTo, page])

  const { data, isLoading } = useProformas(params)
  const proformas  = data?.data       ?? []
  const total      = data?.total      ?? 0
  const totalPages = data?.totalPages ?? 1
  const pageRange  = buildPageRange(page, totalPages)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Proformas"
        description={data ? `${data.total} proforma${data.total !== 1 ? 's' : ''}` : undefined}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              aria-label={exporting ? 'Export en cours…' : 'Exporter en CSV'}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.65 : 1, minHeight: 44 }}
            >
              <Download size={14} aria-hidden="true" /> {exporting ? 'Export…' : 'Exporter CSV'}
            </button>
            {can('client', 'create') && (
              <Link
                href={`${ROUTES.PROFORMAS}/new`}
                style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}
              >
                <Plus size={15} strokeWidth={2.5} aria-hidden="true" /> Nouvelle proforma
              </Link>
            )}
          </div>
        }
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>

        {/* ── Toolbar ── */}
        <div style={{ padding: '12px 16px' }}>
          {/* Recherche + dates */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180, maxWidth: 320 }}>
              <label htmlFor={searchId} className="sr-only">Rechercher par numéro, client ou objet</label>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} aria-hidden="true" />
              <input
                id={searchId}
                type="search"
                placeholder="Rechercher N°, client, objet…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                style={{ width: '100%', padding: '8px 12px 8px 32px', height: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--primary)' }}
                onBlur={(e)  => { e.target.style.borderColor = 'var(--border)' }}
              />
            </div>

            <div role="group" aria-labelledby={dateGrpId} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span id={dateGrpId} className="sr-only">Période</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }} aria-hidden="true">Du</span>
              <input type="date" value={dateFrom} aria-label="Date de début"
                onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                style={{ height: 44, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12.5, color: 'var(--text-3)' }} aria-hidden="true">au</span>
              <input type="date" value={dateTo} aria-label="Date de fin"
                onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                style={{ height: 44, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
              />
              {(dateFrom || dateTo) && (
                <button type="button" aria-label="Effacer la période"
                  onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}
                  style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Onglets statut */}
          <div role="tablist" aria-label="Filtrer par statut"
            style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            {TABS.map(t => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                onClick={() => { setTab(t.key); setPage(1) }}
                style={{ padding: '7px 16px', minHeight: 44, borderRadius: 20, fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', border: 'none', background: tab === t.key ? 'var(--primary)' : 'transparent', color: tab === t.key ? '#fff' : 'var(--text-3)', transition: 'all 0.15s' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* ── Liste ── */}
        <div aria-label="Liste des proformas" aria-busy={isLoading}>
          {isLoading ? (
            Array.from({ length: 7 }).map((_, i) => <SkeletonDocItem key={i} />)
          ) : proformas.length === 0 ? (
            search
              ? <RichEmptyState icon={FileText} title={`Aucun résultat pour « ${search} »`} description="Essayez un autre numéro, nom de client ou sujet." compact />
              : tab !== 'all'
                ? <RichEmptyState icon={FileText} title={`Aucune proforma ${TABS.find(t => t.key === tab)?.label?.toLowerCase() ?? ''}`} description="Aucune proforma ne correspond à ce filtre." compact />
                : <RichEmptyState
                    icon={FileText}
                    title="Envoyez votre premier devis"
                    description="Créez des proformas, envoyez-les à vos clients et convertissez-les en factures en un clic. Suivi des statuts en temps réel."
                    features={['Conversion 1 clic', 'Suivi statut', 'PDF avec cachet']}
                    cta={can('client', 'create') ? { label: '+ Nouvelle proforma', href: `${ROUTES.PROFORMAS}/new` } : undefined}
                    secondaryCta={{ label: 'Voir le guide', href: ROUTES.GUIDE }}
                  />
          ) : (
            proformas.map((p) => {
              const isExpired = p.status !== 'accepted' && p.status !== 'rejected' && new Date(p.validUntil) < new Date()
              const isAlertBg = isExpired || p.status === 'rejected'
              return (
                <DocListItem
                  key={p.id}
                  id={p.id}
                  number={p.number}
                  subject={p.subject}
                  clientName={p.client.name}
                  issueDate={formatDate(p.issueDate)}
                  limitDate={formatDate(p.validUntil)}
                  limitLabel="Val."
                  limitAlert={isExpired}
                  totalTtc={Number(p.totalTtc)}
                  statusBadge={<StatusBadge status={p.status} />}
                  href={`${ROUTES.PROFORMAS}/${p.id}`}
                  actions={<RowActions p={p} />}
                  alertBg={isAlertBg}
                />
              )
            })
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <nav aria-label="Pagination des proformas"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              Page {page}/{totalPages} · <strong aria-live="polite">{total}</strong> proformas
            </p>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
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
  )
}
