'use client'

import { useState, useCallback, useId, useMemo, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Plus, Search, ArrowLeftRight, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, MinusCircle, HelpCircle,
  Loader2, Link2, Link2Off,
} from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { ActionMenu } from '@/components/ui/ActionMenu'
import {
  useTransactions, useTransactionSuggestions,
  useReconcileTransaction, useUnmatchTransaction, useIgnoreTransaction,
  useCreateTransaction, useBankAccounts,
} from '@/features/bank/hooks'
import { ReconciliationStatusBadge } from '@/features/bank/components/ReconciliationStatusBadge'
import { TransactionAmount } from '@/features/bank/components/TransactionAmount'
import { BankAccountBadge } from '@/features/bank/components/BankAccountBadge'
import { TransactionDrawer } from '@/features/bank/components/TransactionDrawer'
import { formatDate } from '@/lib/utils'
import type { BankTransaction, ReconciliationStatus, MatchingSuggestion } from '@/features/bank/types'

const PAGE_SIZE = 25

type StatusTab = 'all' | ReconciliationStatus

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'all',        label: 'Toutes' },
  { key: 'pending',    label: 'En attente' },
  { key: 'reconciled', label: 'Rapprochées' },
  { key: 'unmatched',  label: 'Non identifiées' },
  { key: 'ignored',    label: 'Ignorées' },
]

// ─── Suggestion row ────────────────────────────────────────────────────────

function SuggestionRow({ suggestion, transactionId, onReconciled }: {
  suggestion: MatchingSuggestion
  transactionId: string
  onReconciled: () => void
}) {
  const reconcileMutation = useReconcileTransaction()
  const scoreColor = suggestion.score >= 90 ? '#16a34a' : suggestion.score >= 70 ? '#d97706' : '#dc2626'

  const handleReconcile = async () => {
    await reconcileMutation.mutateAsync({
      id: transactionId,
      data: { matchedEntityType: suggestion.entityType, matchedEntityId: suggestion.entityId },
    })
    onReconciled()
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 12px',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      <span style={{
        fontSize: 11.5, fontWeight: 700, color: scoreColor,
        background: `${scoreColor}15`,
        padding: '2px 7px', borderRadius: 99,
        fontFamily: 'var(--font-mono)', flexShrink: 0,
      }}>
        {suggestion.score}%
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {suggestion.label}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
          {suggestion.reference} · {formatDate(suggestion.date)}
        </div>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', flexShrink: 0 }}>
        {suggestion.amount.toLocaleString('fr-FR')} XAF
      </span>
      <button
        type="button"
        onClick={handleReconcile}
        disabled={reconcileMutation.isPending}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 'var(--radius-sm)',
          background: 'var(--primary)', color: '#fff', border: 'none',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          opacity: reconcileMutation.isPending ? 0.7 : 1, flexShrink: 0,
        }}
      >
        {reconcileMutation.isPending
          ? <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
          : <Link2 size={11} />}
        Rapprocher
      </button>
    </div>
  )
}

// ─── Expanded suggestions panel ────────────────────────────────────────────

function SuggestionsPanel({ transaction, onClose }: { transaction: BankTransaction; onClose: () => void }) {
  const { data: suggestions = [], isLoading } = useTransactionSuggestions(transaction.id)

  return (
    <tr>
      <td colSpan={7} style={{ padding: 0, background: 'var(--surface-2)' }}>
        <div style={{ padding: '12px 20px 16px 60px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Correspondances suggérées
          </div>
          {isLoading ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
              Analyse en cours…
            </div>
          ) : suggestions.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' }}>
              Aucune correspondance automatique trouvée. Rapprochez manuellement via le menu d'actions.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 640 }}>
              {suggestions.slice(0, 3).map(s => (
                <SuggestionRow
                  key={s.entityId}
                  suggestion={s}
                  transactionId={transaction.id}
                  onReconciled={onClose}
                />
              ))}
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Transaction row ──────────────────────────────────────────────────────

function TransactionRow({ tx, accounts }: { tx: BankTransaction; accounts: import('@/features/bank/types').BankAccount[] }) {
  const [expanded, setExpanded] = useState(false)
  const unmatch = useUnmatchTransaction()
  const ignore  = useIgnoreTransaction()
  const account = accounts.find(a => a.id === tx.bankAccountId)

  const actions = [
    ...(tx.reconciliationStatus === 'pending' || tx.reconciliationStatus === 'unmatched' ? [
      { label: 'Ignorer',        icon: MinusCircle, onClick: () => ignore.mutate(tx.id) },
    ] : []),
    ...(tx.reconciliationStatus === 'reconciled' ? [
      { label: 'Dé-rapprocher', icon: Link2Off, onClick: () => unmatch.mutate(tx.id), danger: true },
    ] : []),
    ...(tx.reconciliationStatus === 'ignored' ? [
      { label: 'Réactiver',     icon: CheckCircle2, onClick: () => unmatch.mutate(tx.id) },
    ] : []),
  ]

  const canExpand = tx.reconciliationStatus === 'pending' || tx.reconciliationStatus === 'unmatched'

  return (
    <>
      <tr
        onClick={() => canExpand && setExpanded(e => !e)}
        style={{
          cursor: canExpand ? 'pointer' : 'default',
          background: expanded ? 'var(--surface-2)' : undefined,
          transition: 'background 0.1s',
        }}
      >
        {/* Expand chevron */}
        <td style={{ width: 40, padding: '13px 4px 13px 16px' }}>
          {canExpand && (
            <button
              type="button"
              aria-label={expanded ? 'Réduire' : 'Voir suggestions'}
              onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 2 }}
            >
              {expanded
                ? <ChevronUp size={14} />
                : <ChevronDown size={14} />}
            </button>
          )}
        </td>

        {/* Date */}
        <td style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
          {formatDate(tx.transactionDate)}
          {tx.valueDate && tx.valueDate !== tx.transactionDate && (
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>val. {formatDate(tx.valueDate)}</div>
          )}
        </td>

        {/* Label */}
        <td>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
            {tx.label}
          </div>
          {tx.reference && (
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
              {tx.reference}
            </div>
          )}
        </td>

        {/* Account */}
        <td>
          {account && <BankAccountBadge name={account.name} color={account.color} size="sm" />}
        </td>

        {/* Amount */}
        <td style={{ textAlign: 'right' }}>
          <TransactionAmount amount={tx.amount} type={tx.type} />
        </td>

        {/* Status */}
        <td>
          <ReconciliationStatusBadge status={tx.reconciliationStatus} />
        </td>

        {/* Actions */}
        <td onClick={e => e.stopPropagation()}>
          {actions.length > 0 && <ActionMenu items={actions} />}
        </td>
      </tr>

      {expanded && (
        <SuggestionsPanel transaction={tx} onClose={() => setExpanded(false)} />
      )}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const { can } = usePermission()
  const searchParams  = useSearchParams()
  const [tab,         setTab]         = useState<StatusTab>((searchParams.get('reconciled') === 'false' ? 'pending' : 'all') as StatusTab)
  const [accountId,   setAccountId]   = useState(searchParams.get('accountId') ?? '')
  const [search,      setSearch]      = useState('')
  const [type,        setType]        = useState('')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [page,        setPage]        = useState(1)
  const [drawerOpen,  setDrawerOpen]  = useState(false)
  const searchId = useId()

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    ...(accountId && { accountId }),
    ...(search    && { search }),
    ...(type      && { type: type as 'debit' | 'credit' }),
    ...(dateFrom  && { dateFrom }),
    ...(dateTo    && { dateTo }),
    ...(tab !== 'all' && {
      reconciled: tab === 'reconciled' ? true : false,
    }),
  }), [page, accountId, search, type, dateFrom, dateTo, tab])

  const { data, isLoading } = useTransactions(params)
  const { data: accounts = [] } = useBankAccounts()

  const transactions = data?.data ?? []
  const totalPages   = data?.meta.totalPages ?? 1
  const total        = data?.meta.total ?? 0

  const changeTab = useCallback((t: StatusTab) => { setTab(t); setPage(1) }, [])

  if (!can('bank', 'read')) return <AccessDenied message="Vous n'avez pas accès au module bancaire." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Transactions bancaires"
        description={isLoading ? undefined : `${total} transaction${total !== 1 ? 's' : ''}`}
        actions={
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 'var(--radius-md)',
              background: 'var(--primary)', color: '#fff', border: 'none',
              fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600,
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(45,125,210,0.3)',
            }}
          >
            <Plus size={15} strokeWidth={2.5} />
            Saisie manuelle
          </button>
        }
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>

        {/* Toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Compte */}
          <select
            value={accountId}
            onChange={e => { setAccountId(e.target.value); setPage(1) }}
            aria-label="Filtrer par compte"
            style={{ padding: '0 10px', height: 40, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer', outline: 'none' }}
          >
            <option value="">Tous les comptes</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          {/* Type */}
          <select
            value={type}
            onChange={e => { setType(e.target.value); setPage(1) }}
            aria-label="Filtrer par type"
            style={{ padding: '0 10px', height: 40, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer', outline: 'none' }}
          >
            <option value="">Tous types</option>
            <option value="debit">Débit</option>
            <option value="credit">Crédit</option>
          </select>

          {/* Date range */}
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            aria-label="Date de début"
            style={{ padding: '0 10px', height: 40, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', outline: 'none', cursor: 'pointer' }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>→</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
            aria-label="Date de fin"
            style={{ padding: '0 10px', height: 40, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', outline: 'none', cursor: 'pointer' }} />

          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <label htmlFor={searchId} className="sr-only">Rechercher</label>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} aria-hidden />
            <input
              id={searchId}
              type="search"
              placeholder="Rechercher un libellé…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              style={{ width: '100%', padding: '8px 12px 8px 32px', height: 40, boxSizing: 'border-box', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = 'var(--surface)' }}
              onBlur={e  => { e.target.style.borderColor = 'var(--border)';  e.target.style.background = 'var(--bg)' }}
            />
          </div>
        </div>

        {/* Status tabs */}
        <div style={{ padding: '0 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 2, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => changeTab(t.key)}
              style={{
                padding: '10px 14px', border: 'none', background: 'none',
                borderBottom: tab === t.key ? '2.5px solid var(--primary)' : '2.5px solid transparent',
                color: tab === t.key ? 'var(--primary)' : 'var(--text-3)',
                fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                fontFamily: 'var(--font-display)', cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div aria-hidden>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, padding: '13px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <div style={{ width: 24, height: 24, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                {[80, 200, 120, 100, 80].map((w, j) => (
                  <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          search || tab !== 'all'
            ? <RichEmptyState icon={ArrowLeftRight} title="Aucun résultat" description="Aucune transaction ne correspond à ces filtres." compact />
            : <RichEmptyState
                icon={ArrowLeftRight}
                title="Aucune transaction"
                description="Importez un relevé bancaire pour voir vos transactions apparaître ici."
                features={['Rapprochement automatique', 'Suggestions intelligentes', 'Matching multi-paiements']}
                cta={{ label: 'Importer un relevé', href: '/bank/import' }}
              />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Liste des transactions" aria-busy={isLoading}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}><span className="sr-only">Expand</span></th>
                  <th scope="col">Date</th>
                  <th scope="col">Libellé</th>
                  <th scope="col">Compte</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Montant</th>
                  <th scope="col">Statut</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <TransactionRow key={tx.id} tx={tx} accounts={accounts} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {data && (totalPages > 1 || transactions.length > 0) && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)' }} aria-live="polite">
              {total} transaction{total !== 1 ? 's' : ''}
            </p>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={() => setPage(p => p - 1)} disabled={page <= 1}
                  style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 80, textAlign: 'center' }}>Page {page} / {totalPages}</span>
                <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
                  style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {drawerOpen && <TransactionDrawer onClose={() => setDrawerOpen(false)} accounts={accounts} />}
    </div>
  )
}
