'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, BookOpen } from 'lucide-react'
import { useCreateAccount, useUpdateAccount } from '../hooks'
import { toast } from 'sonner'
import type { AccountListItem, AccountType, CreateAccountPayload } from '../types'

interface Props {
  open:      boolean
  onClose:   () => void
  editing?:  AccountListItem | null
  parentId?: string | null
}

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'asset',     label: 'Actif' },
  { value: 'liability', label: 'Passif' },
  { value: 'equity',    label: 'Capitaux propres' },
  { value: 'revenue',   label: 'Produit' },
  { value: 'expense',   label: 'Charge' },
]

const TYPE_COLOR: Record<AccountType, string> = {
  asset: '#2D7DD2', liability: '#7c3aed', equity: '#0891b2', revenue: '#16a34a', expense: '#dc2626',
}

export function AccountDrawer({ open, onClose, editing, parentId }: Props) {
  const [visible, setVisible] = useState(false)
  const [number, setNumber]   = useState('')
  const [name, setName]       = useState('')
  const [type, setType]       = useState<AccountType>('asset')
  const [normalBalance, setNormalBalance] = useState<'debit' | 'credit'>('debit')
  const [openingBalance, setOpeningBalance] = useState(0)

  const create = useCreateAccount()
  const update = useUpdateAccount()

  useEffect(() => {
    if (open) {
      setVisible(true)
      if (editing) {
        setNumber(editing.number)
        setName(editing.name)
        setType(editing.type)
        setNormalBalance(editing.normalBalance)
        setOpeningBalance(editing.openingBalance)
      } else {
        setNumber(''); setName(''); setType('asset'); setNormalBalance('debit'); setOpeningBalance(0)
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
    if (open) { document.body.style.overflow = 'hidden' }
    else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: CreateAccountPayload = { number, name, type, normalBalance, openingBalance }
    if (parentId) payload.parentId = parentId
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, data: payload })
        toast.success('Compte mis à jour')
      } else {
        await create.mutateAsync(payload)
        toast.success('Compte créé')
      }
      handleClose()
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Erreur')
    }
  }

  if (!open && !visible) return null

  const isPending = create.isPending || update.isPending

  return (
    <>
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)',
          opacity: visible ? 1 : 0, transition: 'opacity 0.28s var(--ease-smooth)',
        }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
        width: 480, background: 'var(--surface)',
        boxShadow: '-8px 0 40px rgba(10,20,35,0.18)',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* stripe */}
        <div style={{ height: 4, background: 'linear-gradient(90deg,#2D7DD2 0%,#0891b2 50%,#22d3ee 100%)' }} />
        {/* header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={16} style={{ color: 'var(--primary)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              {editing ? 'Modifier le compte' : 'Nouveau compte'}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Plan comptable OHADA</p>
          </div>
          <button onClick={handleClose} aria-label="Fermer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}>
            <X size={16} />
          </button>
        </div>

        {/* body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Numéro <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
                <input value={number} onChange={e => setNumber(e.target.value)} required placeholder="ex: 401"
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Intitulé <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} required placeholder="ex: Fournisseurs"
                  style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Type de compte <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {TYPES.map(t => (
                  <button key={t.value} type="button"
                    onClick={() => setType(t.value)}
                    style={{
                      padding: '8px 6px', borderRadius: 8, border: `1.5px solid ${type === t.value ? TYPE_COLOR[t.value] : 'var(--border)'}`,
                      background: type === t.value ? `${TYPE_COLOR[t.value]}15` : 'transparent',
                      cursor: 'pointer', fontSize: 12.5, fontWeight: type === t.value ? 600 : 400,
                      color: type === t.value ? TYPE_COLOR[t.value] : 'var(--text-2)',
                      transition: 'all 0.15s',
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Sens normal</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['debit', 'credit'] as const).map(b => (
                  <button key={b} type="button"
                    onClick={() => setNormalBalance(b)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8,
                      border: `1.5px solid ${normalBalance === b ? (b === 'debit' ? 'var(--acc-debit)' : 'var(--acc-credit)') : 'var(--border)'}`,
                      background: normalBalance === b ? (b === 'debit' ? 'var(--acc-debit-bg)' : 'var(--acc-credit-bg)') : 'transparent',
                      cursor: 'pointer', fontSize: 13, fontWeight: normalBalance === b ? 600 : 400,
                      color: normalBalance === b ? (b === 'debit' ? 'var(--acc-debit)' : 'var(--acc-credit)') : 'var(--text-2)',
                      transition: 'all 0.15s',
                    }}>
                    {b === 'debit' ? 'Débit' : 'Crédit'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Solde d'ouverture (XAF)</label>
              <input type="number" value={openingBalance} onChange={e => setOpeningBalance(Number(e.target.value))}
                placeholder="0" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
            </div>
          </div>
        </form>

        {/* footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleClose} style={btnSecondary}>Annuler</button>
          <button
            type="submit" form="account-form" disabled={isPending || !number.trim() || !name.trim()}
            onClick={handleSubmit}
            style={{ ...btnPrimary, opacity: isPending || !number.trim() || !name.trim() ? 0.6 : 1 }}>
            {isPending ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Créer le compte'}
          </button>
        </div>
      </div>
    </>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500,
  color: 'var(--text-2)', fontFamily: 'var(--font-display)',
}
const inputStyle: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 10px', borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--border-strong)', background: 'var(--surface)',
  fontSize: 13.5, color: 'var(--text-1)', outline: 'none',
}
const btnSecondary: React.CSSProperties = {
  height: 38, padding: '0 18px', borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--border-strong)', background: 'transparent',
  fontSize: 13.5, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer',
}
const btnPrimary: React.CSSProperties = {
  height: 38, padding: '0 20px', borderRadius: 'var(--radius-md)',
  border: 'none', background: 'var(--primary)',
  fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer',
  fontFamily: 'var(--font-display)', transition: 'opacity 0.15s',
}
