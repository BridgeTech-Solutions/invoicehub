'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { Plus, Search, TrendingDown, Clock, RefreshCw, BarChart2, MoreHorizontal, Pencil, CheckCircle2, XCircle, Banknote, Trash2, ExternalLink, Send } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useExpenses, useExpenseStats, useExpenseCategories,
  useSubmitExpense, useApproveExpense, useMarkExpensePaid, useDeleteExpense,
} from '@/features/expenses/hooks'
import { formatDate, buildPageRange } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'
import type { ExpenseStatus, ExpenseListItem } from '@/features/expenses/types'

const STATUS_CONFIG: Record<ExpenseStatus, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Brouillon', color: '#64748b', bg: '#f1f5f9' },
  submitted: { label: 'En attente',color: '#d97706', bg: '#fffbeb' },
  approved:  { label: 'Approuvée', color: '#2D7DD2', bg: '#eff6ff' },
  paid:      { label: 'Payée',     color: '#16a34a', bg: '#f0fdf4' },
  rejected:  { label: 'Rejetée',   color: '#dc2626', bg: '#fef2f2' },
}

const PM_LABELS: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', mobile_money: 'Mobile Money', card: 'Carte', check: 'Chèque',
}

function StatusBadge({ status }: { status: ExpenseStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

function CategoryTag({ name, color }: { name: string; color: string | null }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 10, background: `${color ?? '#94a3b8'}18`, fontSize: 11.5, color: color ?? '#64748b', fontWeight: 600, fontFamily: 'var(--font-display)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color ?? '#94a3b8', flexShrink: 0 }} />
      {name}
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

function ActionMenu({ exp }: { exp: ExpenseListItem }) {
  const [open, setOpen]     = useState(false)
  const router              = useRouter()
  const submitMutation      = useSubmitExpense()
  const approveMutation     = useApproveExpense()
  const markPaidMutation    = useMarkExpensePaid()
  const deleteMutation      = useDeleteExpense()

  const canEdit    = ['draft', 'rejected'].includes(exp.status)
  const canSubmit  = exp.status === 'draft'
  const canApprove = exp.status === 'submitted'
  const canMarkPaid = exp.status === 'approved'
  const canDelete  = exp.status === 'draft'

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
              { show: true,      icon: ExternalLink, label: 'Voir',         action: () => router.push(`${ROUTES.EXPENSES}/${exp.id}`) },
              { show: canEdit,   icon: Pencil,       label: 'Modifier',     action: () => router.push(`${ROUTES.EXPENSES}/${exp.id}/edit`) },
              { show: canSubmit, icon: Send,         label: 'Soumettre',    action: () => { submitMutation.mutate(exp.id) } },
              { show: canApprove,icon: CheckCircle2, label: 'Approuver',   action: () => { approveMutation.mutate(exp.id) } },
              { show: canMarkPaid,icon: Banknote,    label: 'Marquer payé', action: () => { markPaidMutation.mutate(exp.id) } },
              { show: canDelete, icon: Trash2,       label: 'Supprimer',    action: () => { if (confirm('Supprimer cette dépense ?')) deleteMutation.mutate(exp.id) }, danger: true },
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

type Tab = 'all' | 'submitted' | 'recurring'

export default function ExpensesPage() {
  const { can } = usePermission()
  const { format } = useCurrency()
  const [tab,        setTab]       = useState<Tab>('all')
  const [search,     setSearch]    = useState('')
  const [status,     setStatus]    = useState<ExpenseStatus | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [page,       setPage]      = useState(1)

  const tabParams = tab === 'recurring' ? { isRecurring: true } : tab === 'submitted' ? { status: 'submitted' as ExpenseStatus } : {}
  const params = { search: search || undefined, status: status || undefined, categoryId: categoryId || undefined, page, limit: 20, ...tabParams }

  const { data, isLoading }    = useExpenses(params)
  const { data: stats }        = useExpenseStats()
  const { data: categories }   = useExpenseCategories()
  const expenses               = data?.data ?? []
  const totalPages             = data?.totalPages ?? 1

  const tabs: { id: Tab; label: string }[] = [
    { id: 'all',       label: 'Toutes' },
    { id: 'submitted', label: `En attente${(stats?.pendingCount ?? 0) > 0 ? ` (${stats?.pendingCount})` : ''}` },
    { id: 'recurring', label: 'Récurrentes' },
  ]

  if (!can('expense', 'read')) return <AccessDenied message="Vous n'avez pas accès au module de dépenses." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'page-in 0.2s ease' }}>
      <PageHeader
        title="Notes de frais"
        description="Gérez et approuvez vos dépenses opérationnelles"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={ROUTES.EXPENSE_CATEGORIES}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', textDecoration: 'none', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <BarChart2 size={13} /> Catégories
            </Link>
            <Link href={`${ROUTES.EXPENSES}/new`}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}>
              <Plus size={15} /> Nouvelle dépense
            </Link>
          </div>
        }
      />

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KpiCard label="Ce mois"          value={format(stats?.currentMonth ?? 0)}    color="var(--primary)" icon={TrendingDown} />
        <KpiCard label="Ce trimestre"     value={format(stats?.currentQuarter ?? 0)}  color="#7c3aed"        icon={BarChart2} />
        <KpiCard label="En attente"       value={format(stats?.pendingAmount ?? 0)}   color="#d97706"        icon={Clock} sub={`${stats?.pendingCount ?? 0} dépense${(stats?.pendingCount ?? 0) !== 1 ? 's' : ''}`} />
        <KpiCard label="Récurrentes/mois" value={format(stats?.recurringMonthly ?? 0)} color="#0891b2"       icon={RefreshCw} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setPage(1) }}
            style={{ padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? 'var(--primary)' : 'var(--text-3)', borderBottom: `2px solid ${tab === t.id ? 'var(--primary)' : 'transparent'}`, marginBottom: -1, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher une dépense…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none' }}
            onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
        </div>
        {tab === 'all' && (
          <select value={status} onChange={e => { setStatus(e.target.value as ExpenseStatus | ''); setPage(1) }}
            style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', cursor: 'pointer', outline: 'none' }}
            onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={e  => (e.target.style.borderColor = 'var(--border)')}>
            <option value="">Tous les statuts</option>
            {(Object.keys(STATUS_CONFIG) as ExpenseStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        )}
        {(categories?.length ?? 0) > 0 && (
          <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setPage(1) }}
            style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', cursor: 'pointer', outline: 'none' }}
            onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={e  => (e.target.style.borderColor = 'var(--border)')}>
            <option value="">Toutes les catégories</option>
            {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Désignation', 'Catégorie', 'Date', 'Paiement', 'Montant TTC', 'Soumis par', 'Statut', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: h === 'Montant TTC' ? 'right' : 'left', fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', background: 'var(--surface-2)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} style={{ padding: '12px 14px' }}>
                        <div style={{ height: 14, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
                : expenses.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '48px 14px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
                        Aucune dépense trouvée
                      </td>
                    </tr>
                  )
                  : expenses.map(exp => (
                    <tr key={exp.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => window.location.href = `${ROUTES.EXPENSES}/${exp.id}`}>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{exp.designation}</span>
                          {exp.isRecurring && (
                            <span title="Récurrente">
                              <RefreshCw size={11} style={{ color: '#0891b2' }} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        {exp.category
                          ? <CategoryTag name={exp.category.name} color={exp.category.color} />
                          : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(exp.expenseDate)}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>{PM_LABELS[exp.paymentMethod] ?? exp.paymentMethod}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-1)' }}>{format(exp.amountTtc)}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{exp.submittedBy.firstName} {exp.submittedBy.lastName}</td>
                      <td style={{ padding: '11px 14px' }}><StatusBadge status={exp.status} /></td>
                      <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                        <ActionMenu exp={exp} />
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            {data?.total ?? 0} dépense{(data?.total ?? 0) !== 1 ? 's' : ''}
          </span>
          <Pagination page={page} totalPages={totalPages} onChange={p => setPage(p)} />
        </div>
      </div>
    </div>
  )
}
