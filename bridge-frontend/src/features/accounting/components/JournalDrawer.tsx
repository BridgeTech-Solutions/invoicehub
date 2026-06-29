'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, BookOpen } from 'lucide-react'
import { useCreateJournal, useUpdateJournal } from '../hooks'
import { useBankAccounts } from '@/features/bank/hooks'
import { AccountPicker } from './AccountPicker'
import { toast } from 'sonner'
import type { AccountingJournal, JournalType, CreateJournalPayload } from '../types'

interface Props {
  open:    boolean
  onClose: () => void
  editing?: AccountingJournal | null
}

const JOURNAL_TYPES: { value: JournalType; label: string; color: string }[] = [
  { value: 'purchases',   label: 'Achats (ACH)',       color: '#7c3aed' },
  { value: 'sales',       label: 'Ventes (VTE)',       color: '#16a34a' },
  { value: 'bank',        label: 'Banque (BQ)',        color: '#2D7DD2' },
  { value: 'cash',        label: 'Caisse (CAI)',       color: '#d97706' },
  { value: 'operations',  label: 'Op. Diverses (OD)', color: '#0891b2' },
]

export function JournalDrawer({ open, onClose, editing }: Props) {
  const [visible, setVisible] = useState(false)
  const [code, setCode]       = useState('')
  const [name, setName]       = useState('')
  const [type, setType]       = useState<JournalType>('purchases')
  const [defaultAccountId, setDefaultAccountId] = useState<string | null>(null)
  const [bankAccountId, setBankAccountId]       = useState<string | null>(null)

  const create = useCreateJournal()
  const update = useUpdateJournal()
  const { data: bankAccounts = [] } = useBankAccounts()
  const isTreasury = type === 'bank' || type === 'cash'

  // Sélection d'une banque -> lie la fiche + pré-remplit la contrepartie avec son compte comptable
  function selectBank(id: string | null) {
    setBankAccountId(id)
    const ba = bankAccounts.find(b => b.id === id)
    if (ba?.accountingAccount) setDefaultAccountId(ba.accountingAccount)
  }

  useEffect(() => {
    if (open) {
      setVisible(true)
      if (editing) {
        setCode(editing.code); setName(editing.name); setType(editing.type)
        setDefaultAccountId(editing.defaultAccountId ?? null)
        setBankAccountId(editing.bankAccountId ?? null)
      } else {
        setCode(''); setName(''); setType('purchases'); setDefaultAccountId(null); setBankAccountId(null)
      }
    }
  }, [open, editing])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, handleClose])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: CreateJournalPayload = { code: code.toUpperCase(), name, type }
    if (defaultAccountId) payload.defaultAccountId = defaultAccountId
    // Lien banque seulement pertinent pour les journaux de trésorerie
    payload.bankAccountId = isTreasury ? bankAccountId : null
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, data: payload })
        toast.success('Journal mis à jour')
      } else {
        await create.mutateAsync(payload)
        toast.success('Journal créé')
      }
      handleClose()
    } catch (err: unknown) { toast.error((err as Error).message ?? 'Erreur') }
  }

  if (!open && !visible) return null
  const isPending = create.isPending || update.isPending
  const selectedType = JOURNAL_TYPES.find(t => t.value === type)

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)', opacity: visible ? 1 : 0, transition: 'opacity 0.28s' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301, width: 480, background: 'var(--surface)', boxShadow: '-8px 0 40px rgba(10,20,35,0.18)', transform: visible ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 4, background: `linear-gradient(90deg,${selectedType?.color ?? '#2D7DD2'} 0%,${selectedType?.color ?? '#2D7DD2'}88 100%)` }} />
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${selectedType?.color ?? '#2D7DD2'}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={16} style={{ color: selectedType?.color ?? 'var(--primary)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              {editing ? 'Modifier le journal' : 'Nouveau journal'}
            </h2>
          </div>
          <button onClick={handleClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Code <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required maxLength={4} placeholder="AC"
                style={{ ...inp, fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
            </div>
            <div>
              <label style={lbl}>Nom <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="Achats"
                style={inp} />
            </div>
          </div>

          <div>
            <label style={lbl}>Type de journal <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {JOURNAL_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => setType(t.value)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${type === t.value ? t.color : 'var(--border)'}`, background: type === t.value ? `${t.color}10` : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13.5, fontWeight: type === t.value ? 600 : 400, color: type === t.value ? t.color : 'var(--text-1)' }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {isTreasury && (
            <div>
              <label style={lbl}>Compte bancaire lié</label>
              <select value={bankAccountId ?? ''} onChange={e => selectBank(e.target.value || null)}
                style={{ ...inp, cursor: 'pointer' }}>
                <option value="">— Aucun —</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.bankName}{b.accountingAccount ? ` (${b.accountingAccount})` : ''}
                  </option>
                ))}
              </select>
              <p style={{ marginTop: 4, fontSize: 11, color: 'var(--text-3)' }}>
                Rattache ce journal à une banque et pré-remplit la contrepartie avec son compte comptable.
              </p>
            </div>
          )}

          <div>
            <label style={lbl}>Compte de contrepartie par défaut</label>
            <AccountPicker value={defaultAccountId} onChange={a => setDefaultAccountId(a?.id ?? null)} placeholder="Optionnel…" />
          </div>
        </form>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleClose} style={btnSec}>Annuler</button>
          <button onClick={handleSubmit} disabled={isPending || !code.trim() || !name.trim()}
            style={{ ...btnPri, opacity: isPending || !code.trim() || !name.trim() ? 0.6 : 1 }}>
            {isPending ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Créer le journal'}
          </button>
        </div>
      </div>
    </>
  )
}

const lbl: React.CSSProperties = { display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }
const inp: React.CSSProperties = { width: '100%', height: 38, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none' }
const btnSec: React.CSSProperties = { height: 38, padding: '0 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'transparent', fontSize: 13.5, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer' }
const btnPri: React.CSSProperties = { height: 38, padding: '0 20px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)', transition: 'opacity 0.15s' }
