'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Plus, Search, FileText, Clock, Copy, Trash2, FileDown, Send, Eye, Download } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useProformas, useSendProforma, useDuplicateProforma, useDeleteProforma, useDownloadProformaPdf } from '@/features/proformas/hooks'
import { proformasApi } from '@/features/proformas/api'
import { toast } from 'sonner'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePermission } from '@/hooks/usePermission'
import { formatDate, formatXAF, getInitials } from '@/lib/utils'
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
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft
  return (
    <span style={{
      ...s, fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
      letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 20,
      textTransform: 'uppercase',
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
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

  const canSend   = (p.status === 'draft' || p.status === 'rejected') && can('client', 'create')
  const canDelete = p.status === 'draft' && can('client', 'create')

  const items = [
    { label: 'Voir détail',     icon: Eye,      onClick: () => router.push(`${ROUTES.PROFORMAS}/${p.id}`) },
    { label: 'Télécharger PDF', icon: FileDown, onClick: () => pdfM.mutate({ id: p.id, filename: `${p.number.replace(/\//g, '-')}.pdf` }) },
    { label: 'Dupliquer',       icon: Copy,     onClick: () => dupM.mutate(p.id) },
    ...(canSend   ? [{ label: 'Envoyer au client', icon: Send,   onClick: () => sendM.mutate(p.id), separator: true }] : []),
    ...(canDelete ? [{ label: 'Supprimer',          icon: Trash2, onClick: () => { if (confirm(`Supprimer ${p.number} ?`)) delM.mutate(p.id) }, danger: true, separator: !canSend }] : []),
  ]

  return <ActionMenu items={items} />
}

// ─── Skeleton row ───────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[180, 120, 70, 70, 100, 100, 80, 100, 60].map((w, i) => (
        <td key={i} style={{ padding: '14px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

// ─── Page ───────────────────────────────────────────────────────

type StatusTab = ProformaStatus | 'all'

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'all',      label: 'Tous'      },
  { key: 'draft',    label: 'Brouillon' },
  { key: 'sent',     label: 'Envoyées'  },
  { key: 'accepted', label: 'Acceptées' },
  { key: 'rejected', label: 'Rejetées'  },
  { key: 'expired',  label: 'Expirées'  },
]

export default function ProformasPage() {
  const [tab,       setTab]       = useState<StatusTab>('all')
  const [search,    setSearch]    = useState('')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [page,      setPage]      = useState(1)
  const [exporting, setExporting] = useState(false)
  const { can } = usePermission()

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
      toast.error('Erreur lors de l\'export')
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Proformas"
        description={data ? `${data.total} proforma${data.total !== 1 ? 's' : ''}` : undefined}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.7 : 1 }}
            >
              <Download size={14} /> {exporting ? 'Export…' : 'Exporter CSV'}
            </button>
            {can('client', 'create') && (
              <Link
                href={`${ROUTES.PROFORMAS}/new`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 16px', borderRadius: 'var(--radius-md)',
                  background: 'var(--primary)', color: '#fff',
                  textDecoration: 'none', fontSize: 13.5,
                  fontFamily: 'var(--font-display)', fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(45,125,210,0.3)',
                }}
              >
                <Plus size={15} strokeWidth={2.5} /> Nouvelle proforma
              </Link>
            )}
          </div>
        }
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Toolbar */}
        <div style={{ padding: '12px 16px' }}>
          {/* Ligne 1 : recherche + dates */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180, maxWidth: 320 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input
                type="text" placeholder="Rechercher N°, client, objet…"
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--primary)' }}
                onBlur={(e)  => { e.target.style.borderColor = 'var(--border)' }}
              />
            </div>
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

          {/* Ligne 2 : onglets statut */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setPage(1) }}
                style={{
                  padding: '7px 16px', borderRadius: 20, fontSize: 13,
                  fontFamily: 'var(--font-display)', fontWeight: 600,
                  cursor: 'pointer', border: 'none',
                  background: tab === t.key ? 'var(--primary)' : 'transparent',
                  color: tab === t.key ? '#fff' : 'var(--text-3)',
                  transition: 'all 0.15s',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* Table */}
        {isLoading ? (
          <table className="data-table">
            <tbody>{[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}</tbody>
          </table>
        ) : proformas.length === 0 ? (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <FileText size={40} style={{ color: 'var(--border)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 4 }}>
              {search ? `Aucun résultat pour « ${search} »` : 'Aucune proforma pour le moment'}
            </p>
            {can('client', 'create') && !search && (
              <Link href={`${ROUTES.PROFORMAS}/new`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 13.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
                <Plus size={13} /> Créer la première proforma
              </Link>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>N° Proforma</th>
                <th>Client</th>
                <th>Date</th>
                <th>Validité</th>
                <th style={{ textAlign: 'right' }}>Total HT</th>
                <th style={{ textAlign: 'right' }}>Total TTC</th>
                <th>Statut</th>
                <th>Créé par</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {proformas.map((p) => {
                const isExpired = p.status !== 'accepted' && p.status !== 'rejected' && new Date(p.validUntil) < new Date()
                return (
                  <tr key={p.id}>
                    {/* N° */}
                    <td>
                      <Link href={`${ROUTES.PROFORMAS}/${p.id}`} style={{ textDecoration: 'none' }}>
                        <span className="doc-number" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--primary)' }}>
                          {p.number}
                        </span>
                      </Link>
                      {p.subject && (
                        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 0', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.subject}
                        </p>
                      )}
                    </td>

                    {/* Client */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                          {getInitials(p.client.name)}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{p.client.name}</span>
                      </div>
                    </td>

                    {/* Date */}
                    <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{formatDate(p.issueDate)}</td>

                    {/* Validité */}
                    <td>
                      <span style={{ fontSize: 12.5, color: isExpired ? '#ef4444' : 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isExpired && <Clock size={11} />}
                        {formatDate(p.validUntil)}
                      </span>
                    </td>

                    {/* Totaux */}
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                        {new Intl.NumberFormat('fr-FR').format(Math.round(Number(p.totalHt)))} XAF
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>
                        {formatXAF(Number(p.totalTtc))}
                      </span>
                    </td>

                    {/* Statut */}
                    <td><StatusBadge status={p.status} /></td>

                    {/* Créé par */}
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {p.createdBy.firstName} {p.createdBy.lastName[0]}.
                    </td>

                    {/* Actions */}
                    <td><RowActions p={p} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              Page {page} sur {totalPages} · {total} proformas
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
