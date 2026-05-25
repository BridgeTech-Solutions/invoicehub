'use client'

import { useState, useMemo } from 'react'
import { Link2, CheckCircle2, AlertCircle, Link, Unlink, ChevronDown, ChevronRight } from 'lucide-react'
import { useLetterableLines, useLetterLines, useUnletterGroup, useFiscalYears } from '@/features/accounting/hooks'
import { AccountPicker } from '@/features/accounting/components/AccountPicker'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { toast } from 'sonner'
import type { AccountListItem, LetterableEntryLine, LetteredGroup } from '@/features/accounting/types'

function LetteredGroupRow({ group, accountId, onUnletter }: { group: LetteredGroup; accountId: string; onUnletter: (code: string) => void }) {
  const { format } = useCurrency()
  const { can }   = usePermission()
  const [expanded, setExpanded] = useState(false)
  const isZero = Math.abs(group.balance) < 0.01

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button onClick={() => setExpanded(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        {expanded ? <ChevronDown size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: isZero ? 'var(--acc-credit)' : '#d97706', minWidth: 40, background: isZero ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.1)', padding: '2px 6px', borderRadius: 4 }}>{group.letterCode}</span>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{group.lines.length} ligne{group.lines.length > 1 ? 's' : ''}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: isZero ? 'var(--acc-credit)' : '#d97706' }}>
          {isZero ? 'Soldé' : `Δ ${format(Math.abs(group.balance))}`}
        </span>
        {can('accounting', 'update') && (
          <button onClick={e => { e.stopPropagation(); onUnletter(group.letterCode) }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 6, border: '1.5px solid #dc2626', background: 'rgba(220,38,38,0.06)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#dc2626' }}>
            <Unlink size={11} /> Délettrer
          </button>
        )}
      </button>
      {expanded && (
        <div style={{ background: 'var(--surface-2)', paddingLeft: 38 }}>
          {group.lines.map(line => (
            <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '90px 80px 80px 1fr 100px 100px', gap: 8, padding: '7px 14px 7px 0', alignItems: 'center', borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-2)' }}>{formatDate(line.date)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)', fontWeight: 600, fontSize: 11.5 }}>{line.entryNumber}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 6px', borderRadius: 99, background: 'var(--primary-light)', color: 'var(--primary)', textAlign: 'center' }}>{line.journalCode}</span>
              <span style={{ color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.label}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: line.debit > 0 ? 'var(--acc-debit)' : 'var(--text-3)' }}>{line.debit > 0 ? format(line.debit) : '—'}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: line.credit > 0 ? 'var(--acc-credit)' : 'var(--text-3)' }}>{line.credit > 0 ? format(line.credit) : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LetteringPage() {
  const { format } = useCurrency()
  const { can } = usePermission()
  const [selectedAccount, setSelectedAccount] = useState<AccountListItem | null>(null)
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set())
  const [showLettered, setShowLettered]       = useState(false)

  const { data: fiscalYears = [] } = useFiscalYears()
  const currentPeriod = fiscalYears.find(y => y.status === 'open' || y.status === 'current')?.periods?.find(p => p.status === 'current')

  const { data, isLoading, refetch } = useLetterableLines(selectedAccount?.id ?? null, currentPeriod?.id)

  const unlettered: LetterableEntryLine[] = data?.unlettered ?? []
  const lettered:   LetteredGroup[]       = data?.lettered ?? []

  const letter  = useLetterLines()
  const unletter = useUnletterGroup()

  const selectionBalance = useMemo(() => {
    return unlettered
      .filter(l => selectedIds.has(l.id))
      .reduce((s, l) => s + l.debit - l.credit, 0)
  }, [unlettered, selectedIds])

  const isLetterableSelection = selectedIds.size >= 2 && Math.abs(selectionBalance) < 0.01

  const remainingToBalance = -selectionBalance

  function isCandidate(line: LetterableEntryLine): boolean {
    if (selectedIds.has(line.id)) return false
    if (selectedIds.size === 0)   return false
    const lineAmount = line.debit - line.credit
    return Math.abs(lineAmount - remainingToBalance) < 0.01
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === unlettered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(unlettered.map(l => l.id)))
  }

  async function handleLetter() {
    try {
      await letter.mutateAsync(Array.from(selectedIds))
      setSelectedIds(new Set())
      toast.success('Lignes lettrées avec succès')
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  async function handleUnletter(code: string) {
    if (!selectedAccount || !confirm(`Délettrer le groupe ${code} ?`)) return
    try {
      await unletter.mutateAsync({ letterCode: code, accountId: selectedAccount.id })
      toast.success(`Groupe ${code} délettré`)
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  if (!can('accounting', 'read')) return <AccessDenied message="Vous n'avez pas accès à la comptabilité." />

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Link2 size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Lettrage des comptes</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Rapprochement débit / crédit — comptes tiers</p>
          </div>
        </div>
      </div>

      {/* Account selector + period info */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px' }}>
          <AccountPicker
            label="Compte tiers"
            value={selectedAccount?.id ?? null}
            onChange={setSelectedAccount}
            filterClass={[4]}
            placeholder="Sélectionner un compte tiers (40x, 41x)…"
          />
        </div>
        {currentPeriod && (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            Période : <strong style={{ color: 'var(--text-1)' }}>{new Date(currentPeriod.startDate).toLocaleDateString('fr-FR')} → {new Date(currentPeriod.endDate).toLocaleDateString('fr-FR')}</strong>
          </div>
        )}
      </div>

      {!selectedAccount ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <Link2 size={40} style={{ color: 'var(--text-3)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Sélectionnez un compte tiers</p>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Choisissez un compte fournisseur (40x) ou client (41x) pour voir les lignes à lettrer</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Selection balance indicator */}
          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 'var(--radius-md)', background: isLetterableSelection ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)', border: `1.5px solid ${isLetterableSelection ? 'var(--acc-credit)' : 'var(--acc-debit)'}` }}>
              {isLetterableSelection
                ? <CheckCircle2 size={18} style={{ color: 'var(--acc-credit)', flexShrink: 0 }} />
                : <AlertCircle size={18} style={{ color: 'var(--acc-debit)', flexShrink: 0 }} />}
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: isLetterableSelection ? 'var(--acc-credit)' : 'var(--acc-debit)' }}>
                  {isLetterableSelection ? `Sélection équilibrée (${selectedIds.size} lignes) — prêt à lettrer` : `Solde sélection : ${format(Math.abs(selectionBalance))} (${selectionBalance > 0 ? 'débiteur' : 'créditeur'})`}
                </span>
              </div>
              {isLetterableSelection && can('accounting', 'update') && (
                <button onClick={handleLetter} disabled={letter.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: 'var(--acc-credit)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <Link size={14} /> Lettrer
                </button>
              )}
            </div>
          )}

          {/* Unlettered lines */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
                Lignes non lettrées ({unlettered.length})
              </h2>
              {unlettered.length > 0 && (
                <button onClick={toggleAll} style={{ fontSize: 12.5, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                  {selectedIds.size === unlettered.length ? 'Désélectionner tout' : 'Tout sélectionner'}
                </button>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <th style={{ width: 40, padding: '8px 14px' }}></th>
                    {['Date', 'N° pièce', 'Journal', 'Libellé', 'Débit', 'Crédit'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === 'Débit' || h === 'Crédit' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td colSpan={7} style={{ padding: 10 }}><div style={{ height: 16, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} /></td>
                      </tr>
                    ))
                  ) : unlettered.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
                      Toutes les lignes sont lettrées ✓
                    </td></tr>
                  ) : (
                    unlettered.map(line => {
                      const sel       = selectedIds.has(line.id)
                      const candidate = isCandidate(line)
                      const rowBg = sel ? 'rgba(45,125,210,0.08)' : candidate ? 'rgba(217,119,6,0.07)' : 'transparent'
                      return (
                        <tr key={line.id} style={{ borderBottom: '1px solid var(--border)', background: rowBg, cursor: 'pointer', transition: 'background 0.1s', outline: candidate ? '1.5px solid rgba(217,119,6,0.35)' : 'none', outlineOffset: '-1px' }}
                          onClick={() => toggleSelect(line.id)}>
                          <td style={{ padding: '9px 14px' }}>
                            <input type="checkbox" checked={sel} onChange={() => toggleSelect(line.id)} onClick={e => e.stopPropagation()} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--primary)' }} />
                          </td>
                          <td style={{ padding: '9px 10px', fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(line.date)}</td>
                          <td style={{ padding: '9px 10px', fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--primary)' }}>{line.entryNumber}</td>
                          <td style={{ padding: '9px 10px' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 99, background: 'var(--primary-light)', color: 'var(--primary)' }}>{line.journalCode}</span>
                          </td>
                          <td style={{ padding: '9px 10px', fontSize: 13, color: 'var(--text-1)', maxWidth: 240 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.label}</span>
                              {candidate && (
                                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#92400e', background: 'rgba(217,119,6,0.15)', padding: '1px 6px', borderRadius: 99, letterSpacing: '0.04em', fontFamily: 'var(--font-display)' }}>
                                  Suggéré
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: line.debit > 0 ? 'var(--acc-debit)' : 'var(--text-3)' }}>{line.debit > 0 ? format(line.debit) : '—'}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: line.credit > 0 ? 'var(--acc-credit)' : 'var(--text-3)' }}>{line.credit > 0 ? format(line.credit) : '—'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lettered groups */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <button onClick={() => setShowLettered(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'transparent', border: 'none', borderBottom: showLettered ? '1px solid var(--border)' : 'none', cursor: 'pointer', textAlign: 'left' }}>
              {showLettered ? <ChevronDown size={15} style={{ color: 'var(--text-3)' }} /> : <ChevronRight size={15} style={{ color: 'var(--text-3)' }} />}
              <h2 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
                Lignes lettrées ({lettered.length} groupe{lettered.length > 1 ? 's' : ''})
              </h2>
            </button>
            {showLettered && (
              lettered.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Aucune ligne lettrée pour ce compte</div>
              ) : (
                lettered.map(group => (
                  <LetteredGroupRow key={group.letterCode} group={group} accountId={selectedAccount.id} onUnletter={handleUnletter} />
                ))
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
