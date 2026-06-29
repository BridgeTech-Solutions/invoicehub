'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Pencil, Check, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useEntry, useUpdateEntry, useValidateEntry } from '@/features/accounting/hooks'
import { AccountPicker } from '@/features/accounting/components/AccountPicker'
import { useCurrency } from '@/hooks/useCurrency'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { ROUTES } from '@/lib/constants'
import { toast } from 'sonner'
import type { FormEntryLine, AccountListItem } from '@/features/accounting/types'

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Brouillon', color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
  validated: { label: 'Validée',   color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
  locked:    { label: 'Verrouillée', color: '#475569', bg: 'rgba(71,85,105,0.1)' },
  cancelled: { label: 'Annulée',   color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
}

export default function EntryDetailPage() {
  const { format } = useCurrency()
  const { can } = usePermission()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const { data: entry, isLoading } = useEntry(id)
  const update   = useUpdateEntry()
  const validate = useValidateEntry()

  const [editing, setEditing] = useState(false)
  const [label, setLabel]     = useState('')
  const [entryDate, setDate]  = useState('')
  const [lines, setLines]     = useState<FormEntryLine[]>([])

  // (Re)charge le formulaire depuis l'écriture
  useEffect(() => {
    if (!entry) return
    setLabel(entry.label)
    setDate((((entry as any).entryDate ?? entry.date) ?? '').slice(0, 10))
    setLines(entry.lines.map((l: any) => ({
      accountId: l.accountNumber ?? l.account?.accountNumber ?? '', accountNum: l.accountNumber ?? l.account?.accountNumber ?? '', accountName: l.account?.name ?? '',
      label: l.label, debit: Number(l.debit), credit: Number(l.credit),
    })))
  }, [entry])

  const totalDebit  = lines.reduce((s, l) => s + (l.debit || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0)
  const diff        = Math.abs(totalDebit - totalCredit)
  const isBalanced  = diff < 0.01

  function updateLine(idx: number, patch: Partial<FormEntryLine>) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }
  function addLine() { setLines(prev => [...prev, { accountId: '', accountNum: '', accountName: '', label: '', debit: 0, credit: 0 }]) }
  function removeLine(idx: number) { if (lines.length > 2) setLines(prev => prev.filter((_, i) => i !== idx)) }
  function selectAccount(idx: number, a: AccountListItem | null) {
    updateLine(idx, a ? { accountId: a.id, accountNum: a.number, accountName: a.name } : { accountId: '', accountNum: '', accountName: '' })
  }

  function cancelEdit() {
    if (!entry) return
    setEditing(false)
    setLabel(entry.label); setDate((((entry as any).entryDate ?? entry.date) ?? '').slice(0, 10))
    setLines(entry.lines.map(l => ({ accountId: l.account.number, accountNum: l.account.number, accountName: l.account.name, label: l.label, debit: Number(l.debit), credit: Number(l.credit) })))
  }

  async function save() {
    if (!label.trim()) { toast.error('Saisissez un libellé'); return }
    if (!isBalanced)   { toast.error(`Déséquilibre de ${format(diff)}`); return }
    if (lines.some(l => !l.accountNum || (l.debit === 0 && l.credit === 0))) { toast.error('Chaque ligne doit avoir un compte et un montant'); return }
    try {
      await update.mutateAsync({ id, data: {
        label, entryDate,
        lines: lines.map(l => ({ accountNumber: l.accountNum, label: l.label || label, debit: l.debit || 0, credit: l.credit || 0 })),
      } })
      toast.success('Écriture mise à jour')
      setEditing(false)
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  async function doValidate() {
    try { await validate.mutateAsync(id); toast.success('Écriture validée') }
    catch (e: unknown) { toast.error((e as Error).message) }
  }

  if (!can('accounting', 'read')) return <AccessDenied message="Vous n'avez pas accès à la comptabilité." />
  if (isLoading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /></div>
  if (!entry)    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Écriture introuvable.</div>

  const cfg      = STATUS_CFG[entry.status] ?? STATUS_CFG.draft
  const isDraft  = entry.status === 'draft'
  const canEdit  = isDraft && can('accounting', 'update')
  const number   = (entry as any).entryNumber ?? entry.number ?? ''
  const dateISO  = (((entry as any).entryDate ?? entry.date) ?? '').slice(0, 10)

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => router.push(ROUTES.ACCOUNTING_ENTRIES)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-2)' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              Écriture <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{number}</span>
            </h1>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>{entry.journal.code} — {entry.journal.name}</p>
        </div>
        {/* Actions */}
        {!editing && canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditing(true)} style={btn('#2D7DD2')}><Pencil size={14} /> Modifier</button>
            <button onClick={doValidate} disabled={validate.isPending} style={btn('#16a34a')}><Check size={14} /> Valider</button>
          </div>
        )}
        {editing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={cancelEdit} style={btnSec}><X size={14} /> Annuler</button>
            <button onClick={save} disabled={update.isPending || !isBalanced} style={{ ...btn('#2D7DD2'), opacity: update.isPending || !isBalanced ? 0.6 : 1 }}>
              {update.isPending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} Enregistrer
            </button>
          </div>
        )}
      </div>

      {/* En-tête */}
      <div className="card" style={{ padding: '18px 22px', marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Journal" value={`${entry.journal.code} — ${entry.journal.name}`} />
        {editing
          ? <div><label style={lbl}>Date</label><input type="date" value={entryDate} onChange={e => setDate(e.target.value)} style={inp} /></div>
          : <Field label="Date" value={dateISO ? new Date(dateISO).toLocaleDateString('fr-FR') : '—'} />}
        <div style={{ gridColumn: '1/-1' }}>
          {editing
            ? <><label style={lbl}>Libellé général</label><input value={label} onChange={e => setLabel(e.target.value)} style={inp} /></>
            : <Field label="Libellé" value={entry.label} />}
        </div>
      </div>

      {/* Lignes */}
      <div className="card" style={{ padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Lignes d'écriture</h2>
          {editing && <button onClick={addLine} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', borderRadius: 6, border: '1.5px solid var(--primary)', background: 'var(--primary-light)', color: 'var(--primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}><Plus size={13} /> Ajouter</button>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr 1fr 110px 110px 32px' : '1fr 1fr 120px 120px', gap: 8, marginBottom: 6 }}>
          {['Compte', 'Libellé', 'Débit', 'Crédit', ...(editing ? [''] : [])].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i >= 2 && i <= 3 ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lines.map((line, idx) => editing ? (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px 110px 32px', gap: 8, alignItems: 'start' }}>
              <AccountPicker value={line.accountId || null} onChange={a => selectAccount(idx, a)} leafOnly placeholder="Compte…" />
              <input value={line.label} onChange={e => updateLine(idx, { label: e.target.value })} placeholder={label || 'Libellé…'} style={{ ...inp, height: 38 }} />
              <input type="number" value={line.debit || ''} min={0} onChange={e => updateLine(idx, { debit: parseFloat(e.target.value) || 0, credit: 0 })} placeholder="0" style={{ ...inp, height: 38, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--acc-debit)' }} />
              <input type="number" value={line.credit || ''} min={0} onChange={e => updateLine(idx, { credit: parseFloat(e.target.value) || 0, debit: 0 })} placeholder="0" style={{ ...inp, height: 38, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--acc-credit)' }} />
              <button onClick={() => removeLine(idx)} disabled={lines.length <= 2} style={{ width: 32, height: 38, borderRadius: 6, border: '1.5px solid var(--border)', background: 'transparent', cursor: lines.length <= 2 ? 'not-allowed' : 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: lines.length <= 2 ? 0.3 : 1 }}><Trash2 size={13} /></button>
            </div>
          ) : (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 120px', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-1)' }}><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)', marginRight: 6 }}>{line.accountNum}</span>{line.accountName}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{line.label}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: line.debit > 0 ? 'var(--acc-debit)' : 'var(--text-3)' }}>{line.debit > 0 ? format(line.debit) : '—'}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: line.credit > 0 ? 'var(--acc-credit)' : 'var(--text-3)' }}>{line.credit > 0 ? format(line.credit) : '—'}</span>
            </div>
          ))}
        </div>

        {/* Totaux + équilibre */}
        <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr 1fr 110px 110px 32px' : '1fr 1fr 120px 120px', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '2px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isBalanced ? <CheckCircle2 size={16} style={{ color: 'var(--acc-credit)' }} /> : <AlertCircle size={16} style={{ color: 'var(--acc-debit)' }} />}
            <span style={{ fontSize: 12, fontWeight: 700, color: isBalanced ? 'var(--acc-credit)' : 'var(--acc-debit)', fontFamily: 'var(--font-display)' }}>{isBalanced ? 'Équilibrée' : `Diff. ${format(diff)}`}</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', textAlign: 'right' }}>Total</span>
          <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 700, color: 'var(--acc-debit)' }}>{format(totalDebit)}</span>
          <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 700, color: 'var(--acc-credit)' }}>{format(totalCredit)}</span>
          {editing && <div />}
        </div>
      </div>

      {!isDraft && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12, textAlign: 'center' }}>
          Cette écriture est <strong>{cfg.label.toLowerCase()}</strong> — elle n'est plus modifiable. Pour la corriger, utilisez l'<strong>extourne</strong> (contre-passation).
        </p>
      )}
    </div>
  )
}

function Field({ label: l, value }: { label: string; value: string }) {
  return <div><label style={lbl}>{l}</label><div style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500 }}>{value}</div></div>
}
const btn = (c: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', background: c, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)' })
const btnSec: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--text-2)', border: '1.5px solid var(--border-strong)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }
const lbl: React.CSSProperties = { display: 'block', marginBottom: 5, fontSize: 11.5, fontWeight: 500, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.04em' }
const inp: React.CSSProperties = { width: '100%', height: 38, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }
