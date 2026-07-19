'use client'

import { useState, useId } from 'react'
import { Plus, GitMerge, ChevronLeft, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { useReconciliations, useOpenReconciliation, useBankAccounts } from '@/features/bank/hooks'
import type { BankReconciliation, OpenReconciliationPayload } from '@/features/bank/types'
import { formatDate } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import { OverlayPortal } from '@/components/ui/OverlayPortal'

const STATUS_CONFIG = {
  in_progress: { label: 'En cours',  color: '#3b82f6', bg: '#dbeafe' },
  completed:   { label: 'Terminé',   color: '#16a34a', bg: '#dcfce7' },
  cancelled:   { label: 'Annulé',    color: '#64748b', bg: '#f1f5f9' },
}

function SessionStatusBadge({ status }: { status: BankReconciliation['status'] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.cancelled
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-display)', color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

// ─── New session modal ─────────────────────────────────────────────────────

function NewSessionModal({ onClose, accounts }: { onClose: () => void; accounts: import('@/features/bank/types').BankAccount[] }) {
  const openMutation = useOpenReconciliation()
  const idAccount    = useId()
  const idStart      = useId()
  const idEnd        = useId()
  const idBalance    = useId()

  const [form, setForm] = useState<OpenReconciliationPayload>({
    bankAccountId:  accounts[0]?.id ?? '',
    periodStart:    '',
    periodEnd:      '',
    openingBalance: 0,
  })

  const INPUT_STYLE: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13.5,
    border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)',
    background: 'var(--surface)', color: 'var(--text-1)', outline: 'none',
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await openMutation.mutateAsync(form)
    onClose()
  }

  return (
    <OverlayPortal>
      <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(10,20,35,0.5)', backdropFilter: 'blur(2px)' }} aria-hidden />
        <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 'var(--radius-xl)', border: '1.5px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: '100%', maxWidth: 460, padding: '28px 28px 24px', zIndex: 1 }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg,#0f2d4a 0%,#2D7DD2 100%)', borderRadius: '99px 99px 0 0', position: 'absolute', top: 0, left: 0, right: 0 }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 20px' }}>
            Nouvelle session de rapprochement
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label htmlFor={idAccount} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
                Compte <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select id={idAccount} required value={form.bankAccountId}
                onChange={e => setForm(f => ({ ...f, bankAccountId: e.target.value }))}
                style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label htmlFor={idStart} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
                  Début <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input id={idStart} type="date" required value={form.periodStart}
                  onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))} style={INPUT_STYLE} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label htmlFor={idEnd} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
                  Fin <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input id={idEnd} type="date" required value={form.periodEnd}
                  onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} style={INPUT_STYLE} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label htmlFor={idBalance} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
                Solde de clôture du relevé (XAF) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input id={idBalance} type="number" step="1" required value={form.openingBalance || ''}
                onChange={e => setForm(f => ({ ...f, openingBalance: parseFloat(e.target.value) || 0 }))}
                placeholder="ex: 2 450 000"
                style={{ ...INPUT_STYLE, fontFamily: 'var(--font-mono)' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
                Annuler
              </button>
              <button type="submit" disabled={openMutation.isPending} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: openMutation.isPending ? 'wait' : 'pointer', opacity: openMutation.isPending ? 0.75 : 1, boxShadow: '0 4px 12px rgba(45,125,210,0.25)' }}>
                {openMutation.isPending && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
                Ouvrir la session
              </button>
            </div>
          </form>
        </div>
      </div>
    </OverlayPortal>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ReconciliationsPage() {
  const { can } = usePermission()
  const [page,        setPage]       = useState(1)
  const [accountId,   setAccountId]  = useState('')
  const [modalOpen,   setModalOpen]  = useState(false)

  const { data, isLoading } = useReconciliations({ page, limit: 20, ...(accountId && { accountId }) })
  const { data: accounts = [] } = useBankAccounts()
  const sessions    = data?.data ?? []
  const totalPages  = data?.meta.totalPages ?? 1
  const total       = data?.meta.total ?? 0

  if (!can('bank', 'read')) return <AccessDenied message="Vous n'avez pas accès au module bancaire." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Rapprochements bancaires"
        description={isLoading ? undefined : `${total} session${total !== 1 ? 's' : ''}`}
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}
          >
            <Plus size={15} strokeWidth={2.5} />
            Nouvelle session
          </button>
        }
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Filter */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={accountId} onChange={e => { setAccountId(e.target.value); setPage(1) }}
            aria-label="Filtrer par compte"
            style={{ padding: '0 10px', height: 40, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer', outline: 'none' }}>
            <option value="">Tous les comptes</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div aria-hidden>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                {[120, 160, 100, 100, 80, 70].map((w, j) => (
                  <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <RichEmptyState
            icon={GitMerge}
            title="Aucun rapprochement"
            description="Créez votre première session de rapprochement pour valider vos transactions bancaires."
            features={['Auto-matching intelligent', 'Balance relevé vs système', 'Rapport complet']}
            cta={{ label: '+ Nouvelle session', onClick: () => setModalOpen(true) }}
            compact
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Liste des sessions de rapprochement">
              <thead>
                <tr>
                  <th>Compte</th>
                  <th>Période</th>
                  <th style={{ textAlign: 'right' }}>Solde relevé</th>
                  <th style={{ textAlign: 'right' }}>Solde système</th>
                  <th style={{ textAlign: 'right' }}>Écart</th>
                  <th>Statut</th>
                  <th>Créée le</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(session => {
                  const diff = session.closingBalanceStatement - session.closingBalanceSystem
                  const account = accounts.find(a => a.id === session.bankAccountId)
                  return (
                    <tr key={session.id}>
                      <td>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>
                          {account?.name ?? session.bankAccountId}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {formatDate(session.periodStart)} → {formatDate(session.periodEnd)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                        {session.closingBalanceStatement.toLocaleString('fr-FR')}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                        {session.openingBalance.toLocaleString('fr-FR')}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: diff === 0 ? '#16a34a' : '#dc2626' }}>
                        {diff === 0
                          ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}><CheckCircle2 size={13} />0</span>
                          : `${diff > 0 ? '+' : ''}${diff.toLocaleString('fr-FR')}`}
                      </td>
                      <td><SessionStatusBadge status={session.status} /></td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{formatDate(session.createdAt)}</td>
                      <td>
                        <Link
                          href={`${ROUTES.BANK_RECONCILIATIONS}/${session.id}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', color: 'var(--text-2)', textDecoration: 'none', fontSize: 12.5, fontWeight: 500, fontFamily: 'var(--font-display)', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)';  e.currentTarget.style.color = 'var(--text-2)' }}
                        >
                          {session.status === 'in_progress' ? 'Continuer' : 'Voir'}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={() => setPage(p => p - 1)} disabled={page <= 1}
              style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', minWidth: 80, justifyContent: 'center' }}>
              Page {page} / {totalPages}
            </span>
            <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
              style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <NewSessionModal onClose={() => setModalOpen(false)} accounts={accounts} />
      )}
    </div>
  )
}
