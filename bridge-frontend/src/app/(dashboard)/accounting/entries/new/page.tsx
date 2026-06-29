'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useCreateEntry, useJournals, useFiscalYears } from '@/features/accounting/hooks'
import { AccountPicker } from '@/features/accounting/components/AccountPicker'
import { useCurrency } from '@/hooks/useCurrency'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { ROUTES } from '@/lib/constants'
import { toast } from 'sonner'
import type { FormEntryLine, AccountListItem } from '@/features/accounting/types'

function makeBlankLine(): FormEntryLine {
  return { accountId: '', accountNum: '', accountName: '', label: '', debit: 0, credit: 0 }
}

export default function NewEntryPage() {
  const { format } = useCurrency()
  const { can } = usePermission()
  const router = useRouter()
  const [journalId, setJournalId]   = useState('')
  const [entryDate, setEntryDate]   = useState(new Date().toISOString().slice(0, 10))
  const [label, setLabel]           = useState('')
  const [lines, setLines]           = useState<FormEntryLine[]>([makeBlankLine(), makeBlankLine()])

  const { data: journals = [] }     = useJournals()
  const { data: fiscalYears = [] }  = useFiscalYears()
  const create = useCreateEntry()

  const totalDebit   = lines.reduce((s, l) => s + (l.debit || 0), 0)
  const totalCredit  = lines.reduce((s, l) => s + (l.credit || 0), 0)
  const diff         = Math.abs(totalDebit - totalCredit)
  const isBalanced   = diff < 0.01

  function updateLine(idx: number, patch: Partial<FormEntryLine>) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function addLine() { setLines(prev => [...prev, makeBlankLine()]) }

  function removeLine(idx: number) {
    if (lines.length <= 2) return
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  // Choix d'un journal : pré-remplit la 1re ligne vide avec son compte de
  // contrepartie par défaut (ex. journal Banque -> 521), pour gagner du temps.
  function handleJournalChange(id: string) {
    setJournalId(id)
    const acc = journals.find(j => j.id === id)?.defaultAccountId
    if (!acc) return
    setLines(prev => {
      const firstEmpty = prev.findIndex(l => !l.accountNum && l.debit === 0 && l.credit === 0)
      if (firstEmpty === -1) return prev
      return prev.map((l, i) => i === firstEmpty ? { ...l, accountId: acc, accountNum: acc } : l)
    })
  }

  function handleAccountSelect(idx: number, account: AccountListItem | null) {
    if (!account) {
      updateLine(idx, { accountId: '', accountNum: '', accountName: '' })
      return
    }
    updateLine(idx, { accountId: account.id, accountNum: account.number, accountName: account.name })
  }

  const handleSubmit = useCallback(async () => {
    if (!journalId)    { toast.error('Sélectionnez un journal'); return }
    if (!entryDate)    { toast.error('Sélectionnez une date'); return }
    if (!label.trim()) { toast.error('Saisissez un libellé'); return }
    if (!isBalanced)   { toast.error(`Déséquilibre de ${format(diff)} — corrigez avant d'enregistrer`); return }
    const invalidLines = lines.filter(l => !l.accountNum || (l.debit === 0 && l.credit === 0))
    if (invalidLines.length) { toast.error('Chaque ligne doit avoir un compte et un montant (débit ou crédit)'); return }

    try {
      await create.mutateAsync({
        journalId, entryDate, label,
        lines: lines.map(l => ({
          accountNumber: l.accountNum,
          label:         l.label || label,
          debit:         l.debit  || 0,
          credit:        l.credit || 0,
        })),
      })
      toast.success('Écriture enregistrée')
      router.push(ROUTES.ACCOUNTING_ENTRIES)
    } catch (e: unknown) { toast.error((e as Error).message) }
  }, [journalId, entryDate, label, lines, isBalanced, diff, create, router])

  const selectedJournal  = journals.find(j => j.id === journalId)

  if (!can('accounting', 'create')) return <AccessDenied message="Vous n'avez pas la permission de créer des écritures comptables." />

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-2)' }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Nouvelle écriture comptable</h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Saisie manuelle — SYSCOHADA</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
        {/* Left — form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Header fields */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px' }}>En-tête de l'écriture</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Journal <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
                <select value={journalId} onChange={e => handleJournalChange(e.target.value)}
                  style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">Sélectionner un journal…</option>
                  {journals.filter(j => j.isActive).map(j => (
                    <option key={j.id} value={j.id}>{j.code} — {j.name}</option>
                  ))}
                </select>
                {selectedJournal?.defaultAccountId && (
                  <p style={{ marginTop: 4, fontSize: 11, color: 'var(--primary)' }}>
                    Contrepartie par défaut <strong>{selectedJournal.defaultAccountId}</strong> pré-remplie.
                  </p>
                )}
              </div>
              <div>
                <label style={lbl}>Date <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
                <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={inp} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Libellé général <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
                <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex: Facture SABC du 15/01/2026"
                  style={inp} />
              </div>
            </div>
          </div>

          {/* Lines */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Lignes d'écriture</h2>
              <button onClick={addLine} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', borderRadius: 6, border: '1.5px solid var(--primary)', background: 'var(--primary-light)', color: 'var(--primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={13} /> Ajouter une ligne
              </button>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 32px', gap: 8, marginBottom: 6 }}>
              {['Compte', 'Libellé ligne', 'Débit', 'Crédit', ''].map((h, i) => (
                <span key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i >= 2 && i <= 3 ? 'right' : 'left' }}>{h}</span>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lines.map((line, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 32px', gap: 8, alignItems: 'start' }}>
                  <AccountPicker
                    value={line.accountId || null}
                    onChange={account => handleAccountSelect(idx, account)}
                    leafOnly
                    placeholder="Compte…"
                  />
                  <input value={line.label} onChange={e => updateLine(idx, { label: e.target.value })}
                    placeholder={label || 'Libellé…'}
                    style={{ ...inp, height: 38 }} />
                  <input type="number" value={line.debit || ''} min={0}
                    onChange={e => updateLine(idx, { debit: parseFloat(e.target.value) || 0, credit: 0 })}
                    placeholder="0"
                    style={{ ...inp, height: 38, textAlign: 'right', fontFamily: 'var(--font-mono)', color: line.debit > 0 ? 'var(--acc-debit)' : 'var(--text-1)' }} />
                  <input type="number" value={line.credit || ''} min={0}
                    onChange={e => updateLine(idx, { credit: parseFloat(e.target.value) || 0, debit: 0 })}
                    placeholder="0"
                    style={{ ...inp, height: 38, textAlign: 'right', fontFamily: 'var(--font-mono)', color: line.credit > 0 ? 'var(--acc-credit)' : 'var(--text-1)' }} />
                  <button onClick={() => removeLine(idx)} disabled={lines.length <= 2}
                    style={{ width: 32, height: 38, borderRadius: 6, border: '1.5px solid var(--border)', background: 'transparent', cursor: lines.length <= 2 ? 'not-allowed' : 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: lines.length <= 2 ? 0.3 : 1, transition: 'all 0.15s' }}
                    onMouseEnter={e => { if (lines.length > 2) (e.currentTarget as HTMLElement).style.color = '#dc2626' }}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            {/* Totals row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 32px', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '2px solid var(--border)' }}>
              <div />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TOTAL</span>
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 700, color: 'var(--acc-debit)' }}>{format(totalDebit)}</div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 700, color: 'var(--acc-credit)' }}>{format(totalCredit)}</div>
              <div />
            </div>
          </div>
        </div>

        {/* Right — equilibrium + summary */}
        <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Equilibrium indicator */}
          <div className="card" style={{ padding: '20px', border: `2px solid ${isBalanced ? 'var(--acc-credit)' : 'var(--acc-debit)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              {isBalanced
                ? <CheckCircle2 size={22} style={{ color: 'var(--acc-credit)' }} />
                : <AlertCircle size={22} style={{ color: 'var(--acc-debit)' }} />}
              <span style={{ fontSize: 14, fontWeight: 700, color: isBalanced ? 'var(--acc-credit)' : 'var(--acc-debit)', fontFamily: 'var(--font-display)' }}>
                {isBalanced ? 'Écriture équilibrée' : 'Déséquilibre'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>Total débit</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--acc-debit)' }}>{format(totalDebit)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>Total crédit</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--acc-credit)' }}>{format(totalCredit)}</span>
              </div>
              {!isBalanced && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--acc-debit)', fontWeight: 600 }}>Différence</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--acc-debit)' }}>{format(diff)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Récapitulatif</h3>
            {[
              { label: 'Journal', value: selectedJournal ? `${selectedJournal.code} — ${selectedJournal.name}` : '—' },
              { label: 'Date', value: entryDate ? new Date(entryDate).toLocaleDateString('fr-FR') : '—' },
              { label: 'Lignes', value: `${lines.length} ligne${lines.length > 1 ? 's' : ''}` },
            ].map(({ label: l, value: v }) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>{l}</span>
                <span style={{ color: 'var(--text-1)', fontWeight: 500, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <button onClick={() => router.back()}
            style={{ height: 38, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'transparent', fontSize: 13.5, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={create.isPending || !isBalanced || !journalId || !entryDate || !label.trim()}
            style={{ height: 42, borderRadius: 'var(--radius-md)', border: 'none', background: isBalanced ? 'var(--primary)' : '#94a3b8', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s', opacity: create.isPending ? 0.8 : 1 }}>
            {create.isPending ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Enregistrement…</> : 'Enregistrer l\'écriture'}
          </button>
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }
const inp: React.CSSProperties = { width: '100%', height: 38, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none' }
