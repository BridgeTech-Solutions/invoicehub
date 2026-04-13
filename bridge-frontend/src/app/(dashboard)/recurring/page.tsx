'use client'

import { useState, useId, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw, Play, Pause, Trash2, Eye, Zap, ChevronLeft, ChevronRight, AlertTriangle, Search, SlidersHorizontal, ChevronDown, X } from 'lucide-react'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { useRecurringList, useActivateRecurring, useDeactivateRecurring, useDeleteRecurring, useGenerateRecurring } from '@/features/recurring/hooks'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePermission } from '@/hooks/usePermission'
import { formatDate, formatXAF, getInitials } from '@/lib/utils'
import { computeLineValues } from '@/lib/document-math'
import { ROUTES } from '@/lib/constants'
import type { RecurringTemplate, RecurringInterval, ListRecurringParams } from '@/features/recurring/types'
import type { DiscountType } from '@/features/proformas/types'

const PAGE_SIZE = 20

// ─── Constantes ────────────────────────────────────────────────

const INTERVAL_LABELS: Record<RecurringInterval, string> = {
  monthly:   'Mensuelle',
  quarterly: 'Trimestrielle',
  biannual:  'Semestrielle',
  annual:    'Annuelle',
}

const INTERVAL_STYLE: Record<RecurringInterval, React.CSSProperties> = {
  monthly:   { background: 'rgba(45,125,210,0.1)',  color: '#2563eb' },
  quarterly: { background: 'rgba(16,185,129,0.1)',  color: '#059669' },
  biannual:  { background: 'rgba(139,92,246,0.1)',  color: '#7c3aed' },
  annual:    { background: 'rgba(245,158,11,0.1)',  color: '#d97706' },
}

// ─── Badge intervalle ──────────────────────────────────────────

function IntervalBadge({ interval }: { interval: RecurringInterval }) {
  const s = INTERVAL_STYLE[interval]
  return (
    <span
      aria-label={`Fréquence : ${INTERVAL_LABELS[interval]}`}
      style={{
        ...s, fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
        letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 20,
        textTransform: 'uppercase',
      }}
    >
      {INTERVAL_LABELS[interval]}
    </span>
  )
}

// ─── Badge statut ──────────────────────────────────────────────

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      aria-label={isActive ? 'Gabarit actif' : 'Gabarit inactif'}
      style={{
        fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
        letterSpacing: '0.05em', textTransform: 'uppercase',
        padding: '3px 8px', borderRadius: 20,
        background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.15)',
        color:      isActive ? '#16a34a'             : '#64748b',
      }}
    >
      {isActive ? 'Actif' : 'Inactif'}
    </span>
  )
}

// ─── Confirm suppression modal ─────────────────────────────────

function ConfirmDeleteModal({
  templateName,
  onConfirm,
  onCancel,
  isPending,
}: {
  templateName: string
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
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
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: '28px 28px 24px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={18} aria-hidden style={{ color: '#ef4444' }} />
          </div>
          <div>
            <h3 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6, fontFamily: 'var(--font-display)' }}>
              Supprimer ce gabarit ?
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
              {templateName
                ? <><strong>« {templateName} »</strong> sera supprimé définitivement. Les factures déjà générées ne seront pas affectées.</>
                : 'Ce gabarit sera supprimé définitivement. Les factures déjà générées ne seront pas affectées.'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={isPending} aria-disabled={isPending}
            style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', background: '#ef4444', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.65 : 1, transition: 'opacity 0.15s' }}>
            {isPending ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Actions ligne ─────────────────────────────────────────────

function RowActions({ t, onDeleteRequest }: { t: RecurringTemplate; onDeleteRequest: (t: RecurringTemplate) => void }) {
  const { can }      = usePermission()
  const router       = useRouter()
  const activateM    = useActivateRecurring()
  const deactivateM  = useDeactivateRecurring()
  const generateM    = useGenerateRecurring()
  const canEdit      = can('invoice', 'create')

  const items = [
    { label: 'Voir détail',         icon: Eye,    onClick: () => router.push(`${ROUTES.RECURRING}/${t.id}`) },
    ...(canEdit && !t.isActive ? [{ label: 'Activer',             icon: Play,   onClick: () => activateM.mutate(t.id),   separator: true }] : []),
    ...(canEdit &&  t.isActive ? [{ label: 'Désactiver',          icon: Pause,  onClick: () => deactivateM.mutate(t.id), separator: true }] : []),
    ...(canEdit                ? [{ label: 'Générer maintenant',  icon: Zap,    onClick: () => generateM.mutate(t.id) }] : []),
    ...(can('invoice', 'delete')   ? [{ label: 'Supprimer',       icon: Trash2, onClick: () => onDeleteRequest(t), danger: true, separator: true }] : []),
  ]

  return <ActionMenu items={items} />
}

// ─── Skeleton ──────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[160, 120, 100, 90, 100, 80, 60].map((w, i) => (
        <td key={i} style={{ padding: '14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

// ─── Pagination ────────────────────────────────────────────────

function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (p: number) => void
}) {
  if (totalPages <= 1) return null
  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-2)', cursor: 'pointer', transition: 'all 0.15s',
  }
  return (
    <nav aria-label="Pagination des gabarits" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Page précédente"
        style={{ ...btn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>
        <ChevronLeft size={16} aria-hidden />
      </button>
      <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 80, textAlign: 'center' }}>
        <span aria-live="polite">Page {page} / {totalPages}</span>
      </span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Page suivante"
        style={{ ...btn, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>
        <ChevronRight size={16} aria-hidden />
      </button>
    </nav>
  )
}

// ─── Page ──────────────────────────────────────────────────────

export default function RecurringPage() {
  const [activeFilter,   setActiveFilter]   = useState<boolean | undefined>(undefined)
  const [search,         setSearch]         = useState('')
  const [interval,       setInterval]       = useState<RecurringInterval | ''>('')
  const [filtersOpen,    setFiltersOpen]    = useState(false)
  const [page,           setPage]           = useState(1)
  const [deleteTarget,   setDeleteTarget]   = useState<RecurringTemplate | null>(null)
  const { can } = usePermission()
  const deleteM = useDeleteRecurring()

  const hasActiveFilters = !!(interval)

  const handleFilterChange = (value: boolean | undefined) => {
    setActiveFilter(value)
    setPage(1)
  }

  function resetFilters() {
    setInterval('')
    setPage(1)
  }

  const params: ListRecurringParams = {
    limit: PAGE_SIZE,
    page,
    ...(activeFilter !== undefined && { isActive: activeFilter }),
    ...(search   && { search }),
    ...(interval && { interval }),
  }

  const { data, isLoading } = useRecurringList(params)

  const templates = data?.data ?? []

  const totalHt = templates.reduce((sum, t) =>
    sum + t.lines.reduce((s, l) => s + computeLineValues(
      Number(l.quantity), Number(l.unitPriceHt),
      l.discountType as DiscountType, Number(l.discountValue), Number(l.taxRate),
    ).netHt, 0), 0)

  const FILTERS = [
    { label: 'Tous',     value: undefined as boolean | undefined },
    { label: 'Actifs',   value: true  as boolean | undefined },
    { label: 'Inactifs', value: false as boolean | undefined },
  ]

  const totalShown = data && data.totalPages > 1
    ? `${((page - 1) * PAGE_SIZE) + 1}–${Math.min(page * PAGE_SIZE, data.total)} sur ${data.total} gabarit${data.total !== 1 ? 's' : ''}`
    : data ? `${data.total} gabarit${data.total !== 1 ? 's' : ''}` : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Factures récurrentes"
        description={totalShown ? <span aria-live="polite">{totalShown}</span> : undefined}
        actions={
          can('invoice', 'create') ? (
            <Link
              href={`${ROUTES.RECURRING}/new`}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 'var(--radius-md)',
                background: 'var(--primary)', color: '#fff',
                textDecoration: 'none', fontSize: 13.5,
                fontFamily: 'var(--font-display)', fontWeight: 600,
                boxShadow: '0 4px 12px rgba(45,125,210,0.3)',
              }}
            >
              <Plus size={15} strokeWidth={2.5} aria-hidden /> Nouveau gabarit
            </Link>
          ) : undefined
        }
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>

          {/* Ligne principale : recherche + onglets actif/inactif + toggle filtres */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Recherche */}
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
              <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <label htmlFor="rec-search" className="sr-only">Rechercher un gabarit</label>
              <input id="rec-search" type="search" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Client, objet…"
                style={{ width: '100%', paddingLeft: 32, paddingRight: 10, height: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Onglets Actif/Inactif */}
            <div role="tablist" aria-label="Filtrer par statut" style={{ display: 'flex', gap: 4 }}>
              {FILTERS.map(({ label, value }) => (
                <button key={label} type="button" role="tab" aria-selected={activeFilter === value}
                  onClick={() => handleFilterChange(value)}
                  style={{ padding: '0 13px', minHeight: 44, borderRadius: 'var(--radius-md)', border: activeFilter === value ? '1.5px solid var(--primary)' : '1.5px solid transparent', background: activeFilter === value ? 'rgba(45,125,210,0.08)' : 'transparent', color: activeFilter === value ? 'var(--primary)' : 'var(--text-3)', fontSize: 12.5, fontWeight: activeFilter === value ? 600 : 400, fontFamily: 'var(--font-display)', cursor: 'pointer', transition: 'all 0.15s' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Toggle filtres avancés */}
            <button type="button"
              aria-expanded={filtersOpen}
              aria-controls="rec-advanced-filters"
              onClick={() => setFiltersOpen(o => !o)}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, height: 44, padding: '0 14px', borderRadius: 'var(--radius-md)', border: `1.5px solid ${hasActiveFilters ? 'var(--primary)' : 'var(--border)'}`, background: hasActiveFilters ? 'rgba(45,125,210,0.06)' : 'transparent', color: hasActiveFilters ? 'var(--primary)' : 'var(--text-2)', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}>
              <SlidersHorizontal size={14} aria-hidden="true" />
              Filtres
              {hasActiveFilters && (
                <span aria-label="Filtres actifs" style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)' }} />
              )}
              <ChevronDown size={13} aria-hidden="true" style={{ transition: 'transform 0.2s', transform: filtersOpen ? 'rotate(180deg)' : 'none', marginLeft: 2 }} />
            </button>

            {/* Reset */}
            {hasActiveFilters && (
              <button type="button" onClick={resetFilters} aria-label="Réinitialiser les filtres"
                style={{ display: 'flex', alignItems: 'center', gap: 5, height: 44, padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                <X size={12} aria-hidden="true" />
                Réinitialiser
              </button>
            )}
          </div>

          {/* Filtres avancés — collapsibles */}
          <div
            id="rec-advanced-filters"
            style={{ overflow: 'hidden', maxHeight: filtersOpen ? 100 : 0, opacity: filtersOpen ? 1 : 0, transition: 'max-height 0.25s ease, opacity 0.2s ease' }}
          >
            <div style={{ paddingTop: 10, marginTop: 10, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }} aria-hidden="true">Fréquence :</span>
              <label htmlFor="rec-interval" className="sr-only">Filtrer par fréquence</label>
              <select id="rec-interval" value={interval}
                onChange={(e) => { setInterval(e.target.value as RecurringInterval | ''); setPage(1) }}
                style={{ height: 44, padding: '0 12px', borderRadius: 'var(--radius-md)', border: `1.5px solid ${interval ? 'var(--primary)' : 'var(--border)'}`, background: 'var(--bg)', fontSize: 13.5, color: interval ? 'var(--primary)' : 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer', fontWeight: interval ? 600 : 400 }}>
                <option value="">Toutes les fréquences</option>
                {Object.entries(INTERVAL_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Gabarits de facturation récurrente" aria-busy="true">
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Objet</th>
                  <th scope="col">Fréquence</th>
                  <th scope="col">Prochaine facture</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Montant HT</th>
                  <th scope="col">Statut</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody aria-hidden="true">
                {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
              </tbody>
            </table>
          </div>
        ) : templates.length === 0 ? (
          activeFilter !== undefined
            ? <RichEmptyState icon={RefreshCw} title={`Aucun gabarit ${activeFilter ? 'actif' : 'inactif'}`} description="Aucun gabarit ne correspond à ce filtre pour le moment." compact />
            : <RichEmptyState
                icon={RefreshCw}
                title="Automatisez votre facturation"
                description="Configurez des gabarits et laissez InvoiceHub générer vos factures récurrentes automatiquement chaque mois."
                features={['Génération automatique', 'Fréquence personnalisable', 'Notification à l\'émission']}
                cta={can('invoice', 'create') ? { label: '+ Nouveau gabarit', href: `${ROUTES.RECURRING}/new` } : undefined}
                secondaryCta={{ label: 'Voir le guide', href: ROUTES.GUIDE }}
              />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              className="data-table"
              aria-label="Gabarits de facturation récurrente"
              aria-busy={isLoading}
            >
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Objet</th>
                  <th scope="col">Fréquence</th>
                  <th scope="col">Prochaine facture</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Montant HT</th>
                  <th scope="col">Statut</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => {
                  const lineTotal = t.lines.reduce((s, l) => s + Number(l.unitPriceHt) * Number(l.quantity), 0)
                  const isOverdue = t.isActive && new Date(t.nextInvoiceDate) < new Date()
                  return (
                    <tr key={t.id}>
                      {/* Client */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span aria-hidden="true" style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'rgba(45,125,210,0.1)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, color: 'var(--primary)',
                            fontFamily: 'var(--font-display)', flexShrink: 0,
                          }}>
                            {getInitials(t.client.name)}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{t.client.name}</span>
                        </div>
                      </td>

                      {/* Objet */}
                      <td>
                        <Link href={`${ROUTES.RECURRING}/${t.id}`} style={{ textDecoration: 'none' }}>
                          <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 500 }}>
                            {t.subject ?? `${t.lines.length} ligne${t.lines.length > 1 ? 's' : ''}`}
                          </span>
                        </Link>
                        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                          {t.lines.length} ligne{t.lines.length > 1 ? 's' : ''}
                        </p>
                      </td>

                      {/* Fréquence */}
                      <td><IntervalBadge interval={t.interval} /></td>

                      {/* Prochaine facture */}
                      <td>
                        <time
                          dateTime={t.nextInvoiceDate}
                          style={{ fontSize: 12.5, color: isOverdue ? '#ef4444' : 'var(--text-2)', fontWeight: isOverdue ? 600 : 400, display: 'block' }}
                        >
                          {formatDate(t.nextInvoiceDate)}
                        </time>
                        {isOverdue && (
                          <p style={{ fontSize: 11, color: '#ef4444', margin: '1px 0 0' }}>
                            <span aria-label="Génération en retard">En retard</span>
                          </p>
                        )}
                        {t.endDate && (
                          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '1px 0 0' }}>
                            Fin : <time dateTime={t.endDate}>{formatDate(t.endDate)}</time>
                          </p>
                        )}
                      </td>

                      {/* Montant HT */}
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>
                          {new Intl.NumberFormat('fr-FR').format(Math.round(lineTotal))} XAF
                        </span>
                      </td>

                      {/* Statut */}
                      <td><StatusBadge isActive={t.isActive} /></td>

                      {/* Actions */}
                      <td><RowActions t={t} onDeleteRequest={setDeleteTarget} /></td>
                    </tr>
                  )
                })}
              </tbody>
              {templates.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td colSpan={4} style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Total affiché
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13.5, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-1)' }}>
                      {new Intl.NumberFormat('fr-FR').format(Math.round(totalHt))} XAF
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Footer: count + pagination */}
        {data && (data.totalPages > 1 || templates.length > 0) && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)' }} aria-live="polite">
              {totalShown}
            </p>
            {data.totalPages > 1 && (
              <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
            )}
          </div>
        )}
      </div>

      {/* Confirm delete modal */}
      {deleteTarget && (
        <ConfirmDeleteModal
          templateName={deleteTarget.subject ?? deleteTarget.client.name}
          onConfirm={() => deleteM.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteM.isPending}
        />
      )}
    </div>
  )
}
