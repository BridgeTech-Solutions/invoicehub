'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { X, ArrowLeftRight, Loader2 } from 'lucide-react'
import { useCreateTransaction } from '../hooks'
import type { BankAccount, CreateTransactionPayload } from '../types'

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 12px', fontSize: 13.5,
  border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
  color: 'var(--text-1)',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

function Field({ label, required, children, htmlFor }: {
  label: string; required?: boolean; children: React.ReactNode; htmlFor?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label htmlFor={htmlFor} style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
        fontFamily: 'var(--font-display)', letterSpacing: '0.015em',
        display: 'flex', alignItems: 'center', gap: 3,
      }}>
        {label}
        {required && <span style={{ color: '#ef4444' }} aria-hidden>*</span>}
      </label>
      {children}
    </div>
  )
}

interface TransactionDrawerProps {
  onClose:   () => void
  accounts:  BankAccount[]
  accountId?: string
}

export function TransactionDrawer({ onClose, accounts, accountId: defaultAccountId }: TransactionDrawerProps) {
  const titleId   = useId()
  const [isVisible, setIsVisible] = useState(false)
  const [form, setForm] = useState<CreateTransactionPayload>({
    bankAccountId:   defaultAccountId ?? accounts[0]?.id ?? '',
    transactionDate: new Date().toISOString().slice(0, 10),
    label:           '',
    amount:          0,
    type:            'debit',
    reference:       '',
    notes:           '',
  })

  const createMutation = useCreateTransaction()

  useEffect(() => {
    const t = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  const set = (key: keyof CreateTransactionPayload, value: unknown) =>
    setForm(f => ({ ...f, [key]: value }))

  const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = 'var(--primary)'
    e.target.style.boxShadow   = '0 0 0 3px rgba(45,125,210,0.12)'
  }
  const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = 'var(--border)'
    e.target.style.boxShadow   = 'none'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createMutation.mutateAsync({
      ...form,
      reference: form.reference || null,
      notes:     form.notes     || null,
    })
    handleClose()
  }

  return (
    <>
      <div onClick={handleClose} aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)',
        opacity: isVisible ? 1 : 0, transition: 'opacity 0.28s ease',
      }} />
      <div role="dialog" aria-modal aria-labelledby={titleId} style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
        width: '100%', maxWidth: 440,
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(10,20,35,0.18)',
        borderLeft: '1px solid var(--border)',
        transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg,#0f2d4a 0%,#2D7DD2 100%)' }} />
        <div style={{ padding: '18px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'rgba(45,125,210,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeftRight size={16} style={{ color: 'var(--primary)' }} strokeWidth={1.8} />
            </div>
            <h2 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              Saisie manuelle
            </h2>
          </div>
          <button type="button" onClick={handleClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, color: 'var(--text-3)', display: 'flex' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <X size={17} />
          </button>
        </div>

        <form id="tx-form" onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Compte" required htmlFor="tx-account">
            <select id="tx-account" required value={form.bankAccountId}
              onChange={e => set('bankAccountId', e.target.value)}
              onFocus={focusStyle} onBlur={blurStyle}
              style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.bankName}</option>)}
            </select>
          </Field>

          <Field label="Date" required htmlFor="tx-date">
            <input id="tx-date" type="date" required value={form.transactionDate}
              onChange={e => set('transactionDate', e.target.value)}
              onFocus={focusStyle} onBlur={blurStyle}
              style={INPUT_STYLE} />
          </Field>

          <Field label="Libellé" required htmlFor="tx-label">
            <input id="tx-label" type="text" required value={form.label}
              onChange={e => set('label', e.target.value)}
              onFocus={focusStyle} onBlur={blurStyle}
              placeholder="ex: VIREMENT REÇU CLIENT ABC"
              style={INPUT_STYLE} />
          </Field>

          {/* Type radio */}
          <Field label="Type" required>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['debit', 'credit'] as const).map(t => (
                <label key={t} style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  padding: '9px 14px', borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${form.type === t ? (t === 'debit' ? '#dc2626' : '#16a34a') : 'var(--border)'}`,
                  background: form.type === t ? (t === 'debit' ? '#fee2e2' : '#dcfce7') : 'var(--surface)',
                  transition: 'all 0.15s',
                }}>
                  <input type="radio" name="type" value={t} checked={form.type === t}
                    onChange={() => set('type', t)}
                    style={{ accentColor: t === 'debit' ? '#dc2626' : '#16a34a' }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: form.type === t ? (t === 'debit' ? '#dc2626' : '#16a34a') : 'var(--text-2)' }}>
                    {t === 'debit' ? 'Débit (−)' : 'Crédit (+)'}
                  </span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Montant (XAF)" required htmlFor="tx-amount">
            <input id="tx-amount" type="number" required min={0.01} step="1" value={form.amount || ''}
              onChange={e => set('amount', parseFloat(e.target.value) || 0)}
              onFocus={focusStyle} onBlur={blurStyle}
              placeholder="ex: 150000"
              style={{ ...INPUT_STYLE, fontFamily: 'var(--font-mono)' }} />
          </Field>

          <Field label="Référence" htmlFor="tx-ref">
            <input id="tx-ref" type="text" value={form.reference ?? ''}
              onChange={e => set('reference', e.target.value)}
              onFocus={focusStyle} onBlur={blurStyle}
              placeholder="Numéro de chèque, bordereau, etc."
              style={INPUT_STYLE} />
          </Field>

          <Field label="Notes" htmlFor="tx-notes">
            <textarea id="tx-notes" value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              onFocus={focusStyle as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
              onBlur={blurStyle  as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
              rows={2}
              style={{ ...INPUT_STYLE, resize: 'vertical' }} />
          </Field>
        </form>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleClose} style={{ padding: '9px 18px', minHeight: 40, borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--text-2)', border: '1.5px solid var(--border)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button type="submit" form="tx-form" disabled={createMutation.isPending} style={{ padding: '9px 20px', minHeight: 40, borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: createMutation.isPending ? 'not-allowed' : 'pointer', opacity: createMutation.isPending ? 0.75 : 1, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(45,125,210,0.25)' }}>
            {createMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
            Enregistrer
          </button>
        </div>
      </div>
    </>
  )
}
