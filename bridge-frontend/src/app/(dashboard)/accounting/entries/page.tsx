'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Search, PenLine, XCircle, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useEntries, useCancelEntry, useJournals, useFiscalYears } from '@/features/accounting/hooks'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { ROUTES } from '@/lib/constants'
import { toast } from 'sonner'
import type { ListEntriesParams, JournalType, EntrySource } from '@/features/accounting/types'

const JOURNAL_COLOR: Record<JournalType, string> = {
  purchases:  '#7c3aed',
  sales:      '#16a34a',
  bank:       '#2D7DD2',
  cash:       '#d97706',
  operations: '#0891b2',
  misc:       '#64748b',
  opening:    '#94a3b8',
  closing:    '#475569',
}

const SOURCE_LABEL: Record<EntrySource, string> = {
  manual: 'Manuel', invoice: 'Facture', payment: 'Paiement',
  expense: 'Dépense', purchase_order: 'BC',
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="card" style={{ padding: '14px 16px', borderLeft: `3px solid ${color}` }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', letterSpacing: '-0.02em', margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 0' }}>{sub}</p>}
    </div>
  )
}

export default function EntriesPage() {
  const { format } = useCurrency()
  const { can } = usePermission()
  const [params, setParams] = useState<ListEntriesParams>({ page: 1, limit: 25 })
  const [search, setSearch] = useState('')

  const { data, isLoading } = useEntries({ ...params, search: search || undefined })
  const { data: journals = [] } = useJournals()
  const cancel = useCancelEntry()

  const entries = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

  const totalDebit  = entries.reduce((s, e) => s + e.totalDebit, 0)
  const totalCredit = entries.reduce((s, e) => s + e.totalCredit, 0)
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01

  if (!can('accounting', 'read')) return <AccessDenied message="Vous n'avez pas accès à la comptabilité." />

  async function handleCancel(id: string, num: string) {
    if (!confirm(`Annuler l'écriture ${num} ? Une contre-écriture sera générée.`)) return
    try {
      await cancel.mutateAsync(id)
      toast.success('Écriture annulée')
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PenLine size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Écritures comptables</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>{data?.total ?? 0} écriture{(data?.total ?? 0) > 1 ? 's' : ''}</p>
          </div>
        </div>
        {can('accounting', 'create') && (
          <Link href={`${ROUTES.ACCOUNTING_ENTRIES}/new`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-display)', textDecoration: 'none' }}>
            <Plus size={15} /> Nouvelle écriture
          </Link>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Débit total" value={format(totalDebit)} color="var(--acc-debit)" sub="Mouvements débiteurs" />
        <KpiCard label="Crédit total" value={format(totalCredit)} color="var(--acc-credit)" sub="Mouvements créditeurs" />
        <div className="card" style={{ padding: '14px 16px', borderLeft: `3px solid ${isBalanced ? 'var(--acc-credit)' : 'var(--acc-debit)'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          {isBalanced
            ? <CheckCircle2 size={18} style={{ color: 'var(--acc-credit)', flexShrink: 0 }} />
            : <AlertCircle size={18} style={{ color: 'var(--acc-debit)', flexShrink: 0 }} />}
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Équilibre</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: isBalanced ? 'var(--acc-credit)' : 'var(--acc-debit)', margin: 0 }}>
              {isBalanced ? 'Équilibré' : `Diff. ${format(Math.abs(totalDebit - totalCredit))}`}
            </p>
          </div>
        </div>
        <KpiCard label="Écritures" value={String(data?.total ?? 0)} color="var(--primary)" sub={`Page ${params.page} / ${totalPages}`} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setParams(p => ({ ...p, page: 1 })) }}
            placeholder="Rechercher libellé, n° pièce…"
            style={{ width: '100%', height: 36, paddingLeft: 32, paddingRight: 10, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none' }} />
        </div>
        <select value={params.journalId ?? ''} onChange={e => setParams(p => ({ ...p, journalId: e.target.value || undefined, page: 1 }))}
          style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', cursor: 'pointer', outline: 'none' }}>
          <option value="">Tous les journaux</option>
          {journals.map(j => <option key={j.id} value={j.id}>{j.code} — {j.name}</option>)}
        </select>
        <input type="date" value={params.dateFrom ?? ''} onChange={e => setParams(p => ({ ...p, dateFrom: e.target.value || undefined, page: 1 }))}
          style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none' }} />
        <input type="date" value={params.dateTo ?? ''} onChange={e => setParams(p => ({ ...p, dateTo: e.target.value || undefined, page: 1 }))}
          style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none' }} />
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Date', 'N° Pièce', 'Journal', 'Libellé', 'Source', 'Débit', 'Crédit', ''].map((h, i) => (
                  <th key={i} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i >= 5 && i <= 6 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} style={{ padding: '9px 10px' }}>
                        <div style={{ height: 13, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', width: j === 3 ? '70%' : '50%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px', textAlign: 'center' }}>
                    <PenLine size={32} style={{ color: 'var(--text-3)', margin: '0 auto 10px' }} />
                    <p style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 600 }}>Aucune écriture trouvée</p>
                    <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
                      <Link href={`${ROUTES.ACCOUNTING_ENTRIES}/new`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>Créer la première écriture</Link>
                    </p>
                  </td>
                </tr>
              ) : (
                entries.map((entry, i) => {
                  const jCfg = journals.find(j => j.id === entry.journalId)
                  const jColor = JOURNAL_COLOR[entry.journal.type] ?? 'var(--primary)'
                  return (
                    <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 1 ? 'var(--surface-2)' : 'transparent', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(45,125,210,0.04)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 1 ? 'var(--surface-2)' : 'transparent'}>
                      <td style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(entry.date)}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>{entry.number}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: `${jColor}18`, color: jColor, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                          {entry.journal.code}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-1)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.label}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{entry.source ? (SOURCE_LABEL[entry.source as EntrySource] ?? entry.source) : '—'}</span>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: entry.totalDebit > 0 ? 'var(--acc-debit)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {entry.totalDebit > 0 ? format(entry.totalDebit) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: entry.totalCredit > 0 ? 'var(--acc-credit)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {entry.totalCredit > 0 ? format(entry.totalCredit) : '—'}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                        <ActionMenu items={[
                          ...(can('accounting', 'update') ? [{ label: 'Annuler', icon: XCircle, onClick: () => handleCancel(entry.id, entry.number), danger: true }] : []),
                        ]} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
              {data?.total ?? 0} écriture{(data?.total ?? 0) > 1 ? 's' : ''} · Page {params.page}/{totalPages}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button disabled={(params.page ?? 1) <= 1} onClick={() => setParams(p => ({ ...p, page: (p.page ?? 1) - 1 }))}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', opacity: (params.page ?? 1) <= 1 ? 0.4 : 1 }}>
                <ChevronLeft size={14} />
              </button>
              <button disabled={(params.page ?? 1) >= totalPages} onClick={() => setParams(p => ({ ...p, page: (p.page ?? 1) + 1 }))}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', opacity: (params.page ?? 1) >= totalPages ? 0.4 : 1 }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
