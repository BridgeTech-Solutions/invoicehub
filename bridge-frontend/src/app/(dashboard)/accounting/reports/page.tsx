'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BarChart3, Download, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useBalance, useGeneralLedger, useFiscalYears } from '@/features/accounting/hooks'
import { AccountPicker } from '@/features/accounting/components/AccountPicker'
import { BilanReport, CompteResultatReport } from '@/features/accounting/components/FinancialStatements'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { ROUTES } from '@/lib/constants'
import type { AccountBalance, AccountClass, AccountListItem } from '@/features/accounting/types'

const ACCOUNT_TYPE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  asset:     { label: 'Actif',     color: '#2D7DD2', bg: 'rgba(45,125,210,0.1)' },
  liability: { label: 'Passif',    color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  equity:    { label: 'Capitaux',  color: '#0891b2', bg: 'rgba(8,145,178,0.1)' },
  revenue:   { label: 'Produit',   color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
  expense:   { label: 'Charge',    color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
}

const CLASSES: { id: AccountClass; label: string }[] = [
  { id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' }, { id: 4, label: '4' },
  { id: 5, label: '5' }, { id: 6, label: '6' }, { id: 7, label: '7' }, { id: 8, label: '8' },
]

// ─── Balance Tab ──────────────────────────────────────────────
function BalanceTab({ periodId, onAccountSelect }: { periodId?: string; onAccountSelect: (account: AccountListItem) => void }) {
  const { format } = useCurrency()
  const [classFilter, setClassFilter]       = useState<AccountClass | null>(null)
  const [includeEmpty, setIncludeEmpty]     = useState(false)
  const [searchTerm, setSearchTerm]         = useState('')

  const { data: balances = [], isLoading } = useBalance({ periodId, class: classFilter ?? undefined, includeEmpty })

  const byClass = useMemo(() => {
    const filtered = balances.filter(b => {
      if (!searchTerm) return true
      const s = searchTerm.toLowerCase()
      return b.account.number.includes(s) || b.account.name.toLowerCase().includes(s)
    })
    const groups: Record<number, AccountBalance[]> = {}
    filtered.forEach(b => {
      const cls = b.account.class
      if (!groups[cls]) groups[cls] = []
      groups[cls].push(b)
    })
    return groups
  }, [balances, searchTerm])

  const grandDebit  = balances.reduce((s, b) => s + b.debitTotal, 0)
  const grandCredit = balances.reduce((s, b) => s + b.creditTotal, 0)

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setClassFilter(null)}
          style={{ height: 30, padding: '0 12px', borderRadius: 99, border: `1.5px solid ${!classFilter ? 'var(--primary)' : 'var(--border)'}`, background: !classFilter ? 'var(--primary-light)' : 'transparent', color: !classFilter ? 'var(--primary)' : 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
          Toutes
        </button>
        {CLASSES.map(c => (
          <button key={c.id} onClick={() => setClassFilter(c.id === classFilter ? null : c.id)}
            style={{ height: 30, padding: '0 10px', borderRadius: 99, border: `1.5px solid ${classFilter === c.id ? 'var(--primary)' : 'var(--border)'}`, background: classFilter === c.id ? 'var(--primary-light)' : 'transparent', color: classFilter === c.id ? 'var(--primary)' : 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
            Cl.{c.id}
          </button>
        ))}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Compte ou intitulé…"
            style={{ width: '100%', height: 30, paddingLeft: 28, paddingRight: 10, borderRadius: 99, border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 12.5, color: 'var(--text-1)', outline: 'none' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={includeEmpty} onChange={e => setIncludeEmpty(e.target.checked)} style={{ accentColor: 'var(--primary)', width: 14, height: 14 }} />
          Inclure les comptes nuls
        </label>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              {['Compte', 'Intitulé', 'Type', 'Mvt Débit', 'Mvt Crédit', 'Solde'].map((h, i) => (
                <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i >= 3 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} style={{ padding: '9px 10px' }}><div style={{ height: 13, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', width: j === 1 ? '70%' : '50%' }} /></td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {Object.entries(byClass).sort(([a], [b]) => Number(a) - Number(b)).map(([cls, items]) => {
                  const clsDebit  = items.reduce((s, b) => s + b.debitTotal, 0)
                  const clsCredit = items.reduce((s, b) => s + b.creditTotal, 0)
                  return (
                    <>
                      {/* Class row */}
                      <tr key={`cls-${cls}`} style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border-strong)' }}>
                        <td colSpan={3} style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
                          Classe {cls}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--acc-debit)' }}>{format(clsDebit)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--acc-credit)' }}>{format(clsCredit)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{format(Math.abs(clsDebit - clsCredit))}</td>
                      </tr>
                      {/* Account rows */}
                      {items.map((b, i) => {
                        const solde  = b.debitTotal - b.creditTotal
                        // Comptes bifonctionnels SYSCOHADA (tiers cl.4, trésorerie cl.5) :
                        // leur nature Actif/Passif dépend du SENS du solde, pas de la classe.
                        // Ex. 411 Clients débiteur = créance (Actif) ; banque créditrice = découvert (Passif).
                        const accCls   = parseInt(String(b.account.number).charAt(0), 10)
                        const dispType = (accCls === 4 || accCls === 5)
                          ? (solde >= 0 ? 'asset' : 'liability')
                          : b.account.type
                        const typCfg = ACCOUNT_TYPE_CFG[dispType]
                        return (
                          <tr key={b.accountId} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)', cursor: 'pointer', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(45,125,210,0.04)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)'}
                            onDoubleClick={() => onAccountSelect({ ...b.account, parentId: null } as AccountListItem)}>
                            <td style={{ padding: '7px 10px', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--primary)' }}>{b.account.number}</td>
                            <td style={{ padding: '7px 10px', fontSize: 12.5, color: 'var(--text-1)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.account.name}</td>
                            <td style={{ padding: '7px 10px' }}>
                              {typCfg && <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: typCfg.bg, color: typCfg.color }}>{typCfg.label}</span>}
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: b.debitTotal > 0 ? 'var(--acc-debit)' : 'var(--text-3)' }}>{b.debitTotal > 0 ? format(b.debitTotal) : '—'}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: b.creditTotal > 0 ? 'var(--acc-credit)' : 'var(--text-3)' }}>{b.creditTotal > 0 ? format(b.creditTotal) : '—'}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: solde > 0 ? 'var(--acc-debit)' : solde < 0 ? 'var(--acc-credit)' : 'var(--text-3)' }}>{format(Math.abs(solde))}</td>
                          </tr>
                        )
                      })}
                    </>
                  )
                })}
                {/* Grand total */}
                <tr style={{ background: '#0c234012', borderTop: '2px solid var(--border-strong)' }}>
                  <td colSpan={3} style={{ padding: '10px 10px', fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>TOTAUX GÉNÉRAUX</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 800, color: 'var(--acc-debit)' }}>{format(grandDebit)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 800, color: 'var(--acc-credit)' }}>{format(grandCredit)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{format(Math.abs(grandDebit - grandCredit))}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      {balances.length > 0 && (
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8, padding: '0 4px' }}>Double-cliquez sur un compte pour ouvrir son grand livre</p>
      )}
    </div>
  )
}

// ─── General Ledger Tab ───────────────────────────────────────
function LedgerTab({ periodId, initialAccountId }: { periodId?: string; initialAccountId?: string }) {
  const { format } = useCurrency()
  const [account, setAccount] = useState<AccountListItem | null>(null)

  const { data: lines = [], isLoading } = useGeneralLedger(account?.id ?? initialAccountId ?? null, { periodId })

  const totalDebit  = lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <AccountPicker
          label="Compte"
          value={account?.id ?? initialAccountId ?? null}
          onChange={setAccount}
          placeholder="Sélectionner un compte…"
        />
      </div>

      {!(account?.id ?? initialAccountId) ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>
          <BarChart3 size={36} style={{ margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Sélectionnez un compte</p>
          <p style={{ fontSize: 13 }}>pour afficher le détail de ses écritures</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Date', 'N° Pièce', 'Journal', 'Libellé', 'Débit', 'Crédit', 'Solde progressif', 'Lettre'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td colSpan={8} style={{ padding: 10 }}><div style={{ height: 14, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} /></td>
                  </tr>
                ))
              ) : lines.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Aucun mouvement pour ce compte sur la période sélectionnée</td></tr>
              ) : (
                lines.map((line, i) => (
                  <tr key={`${line.entryId}-${i}`} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 1 ? 'var(--surface-2)' : 'transparent' }}>
                    <td style={{ padding: '7px 10px', fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(line.date)}</td>
                    <td style={{ padding: '7px 10px', fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>{line.entryNum}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 99, background: 'var(--primary-light)', color: 'var(--primary)' }}>{line.journalCode}</span>
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 13, color: 'var(--text-1)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.label}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: line.debit > 0 ? 'var(--acc-debit)' : 'var(--text-3)' }}>{line.debit > 0 ? format(line.debit) : '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: line.credit > 0 ? 'var(--acc-credit)' : 'var(--text-3)' }}>{line.credit > 0 ? format(line.credit) : '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: line.runningBal >= 0 ? 'var(--acc-debit)' : 'var(--acc-credit)' }}>{format(Math.abs(line.runningBal))}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                      {line.letterCode ? (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--acc-credit)', background: 'rgba(22,163,74,0.1)', padding: '1px 6px', borderRadius: 4 }}>{line.letterCode}</span>
                      ) : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                ))
              )}
              {lines.length > 0 && (
                <tr style={{ background: '#0c234012', borderTop: '2px solid var(--border-strong)' }}>
                  <td colSpan={4} style={{ padding: '8px 10px', fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>TOTAL</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: 'var(--acc-debit)' }}>{format(totalDebit)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: 'var(--acc-credit)' }}>{format(totalCredit)}</td>
                  <td colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

type ReportTab = 'balance' | 'ledger' | 'bilan' | 'compte-resultat'

// ─── Main page ────────────────────────────────────────────────
export default function ReportsPage() {
  const { can } = usePermission()
  const searchParams     = useSearchParams()
  const router           = useRouter()
  const [tab, setTab]    = useState<ReportTab>((searchParams.get('tab') as ReportTab) ?? 'balance')
  const [ledgerAccount, setLedgerAccount] = useState<AccountListItem | null>(null)
  const [periodId, setPeriodId]           = useState<string | undefined>(undefined)
  // Bilan & compte de résultat : périmètre = exercice (année). 'all' = tous les
  // exercices ; undefined = pas encore choisi -> on prend le plus récent par défaut.
  const [yearSel, setYearSel]             = useState<number | 'all' | undefined>(undefined)

  const { data: fiscalYears = [] } = useFiscalYears()
  const allPeriods = fiscalYears.flatMap(y => y.periods ?? [])
  const years = useMemo(() => fiscalYears.map(y => y.year).sort((a, b) => b - a), [fiscalYears])
  // Défaut = exercice courant s'il existe (là où sont les écritures), sinon le plus récent.
  const currentYear = new Date().getFullYear()
  const defaultYear = years.includes(currentYear) ? currentYear : years[0]
  const effectiveYear = yearSel === undefined ? defaultYear : yearSel === 'all' ? undefined : yearSel
  const isStatement = tab === 'bilan' || tab === 'compte-resultat'

  function handleAccountSelect(account: AccountListItem) {
    setLedgerAccount(account)
    setTab('ledger')
  }

  if (!can('accounting', 'read')) return <AccessDenied message="Vous n'avez pas accès à la comptabilité." />

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart3 size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Balance & Grand livre</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>États financiers SYSCOHADA</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isStatement ? (
            // Bilan / Compte de résultat : filtre par EXERCICE (annuel, + colonne N-1)
            <select value={yearSel === 'all' ? 'all' : String(effectiveYear ?? '')}
              onChange={e => setYearSel(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              aria-label="Exercice"
              style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', cursor: 'pointer', outline: 'none' }}>
              {years.map(y => <option key={y} value={y}>Exercice {y}</option>)}
              <option value="all">Tous les exercices</option>
            </select>
          ) : (
            // Balance / Grand livre : filtre par PÉRIODE (mois)
            <select value={periodId ?? ''} onChange={e => setPeriodId(e.target.value || undefined)}
              aria-label="Période"
              style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', cursor: 'pointer', outline: 'none' }}>
              <option value="">Toutes les périodes</option>
              {allPeriods.map(p => (
                <option key={p.id} value={p.id}>{p.month < 10 ? `0${p.month}` : p.month}/{p.year}</option>
              ))}
            </select>
          )}
          <Link href={`${ROUTES.ACCOUNTING_REPORTS}/sage`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
            <Download size={14} /> Export Sage
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
        {[
          { id: 'balance' as const,         label: 'Balance des comptes' },
          { id: 'ledger'  as const,         label: 'Grand livre' },
          { id: 'bilan'   as const,         label: 'Bilan' },
          { id: 'compte-resultat' as const, label: 'Compte de résultat' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ height: 40, padding: '0 20px', border: 'none', background: 'transparent', fontSize: 13.5, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? 'var(--primary)' : 'var(--text-2)', cursor: 'pointer', borderBottom: `2px solid ${tab === t.id ? 'var(--primary)' : 'transparent'}`, marginBottom: -2, fontFamily: 'var(--font-display)', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card" style={{ padding: '20px 24px' }}>
        {tab === 'balance'         && <BalanceTab periodId={periodId} onAccountSelect={handleAccountSelect} />}
        {tab === 'ledger'          && <LedgerTab periodId={periodId} initialAccountId={ledgerAccount?.id} />}
        {/* Bilan & compte de résultat : périmètre = exercice (année), nécessaire pour le N-1 */}
        {tab === 'bilan'           && <BilanReport year={effectiveYear} />}
        {tab === 'compte-resultat' && <CompteResultatReport year={effectiveYear} />}
      </div>
    </div>
  )
}
