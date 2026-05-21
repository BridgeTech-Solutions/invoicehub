'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { X, Building2, Loader2 } from 'lucide-react'
import { useCreateBankAccount, useUpdateBankAccount } from '../hooks'
import type { BankAccount, BankAccountType, CreateBankAccountPayload } from '../types'

const ACCOUNT_TYPES: { value: BankAccountType; label: string }[] = [
  { value: 'checking',     label: 'Compte courant' },
  { value: 'savings',      label: 'Épargne' },
  { value: 'petty_cash',   label: 'Caisse' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'term_deposit', label: 'Dépôt à terme' },
]

const PALETTE = [
  '#2D7DD2', '#16a34a', '#9333ea', '#d97706',
  '#dc2626', '#0891b2', '#0f2d4a', '#64748b',
]

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 4px' }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--text-3)',
        fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
      }}>
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

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
        {required && <span style={{ color: '#ef4444', fontSize: 13 }} aria-hidden>*</span>}
      </label>
      {children}
    </div>
  )
}

interface BankAccountDrawerProps {
  account?: BankAccount | null
  onClose: () => void
  onSuccess?: (account: BankAccount) => void
}

export function BankAccountDrawer({ account, onClose, onSuccess }: BankAccountDrawerProps) {
  const isEdit  = !!account
  const titleId = useId()

  const [isVisible, setIsVisible] = useState(false)
  const [form, setForm] = useState<CreateBankAccountPayload>({
    name:              account?.name              ?? '',
    bankName:          account?.bankName          ?? '',
    accountType:       account?.accountType       ?? 'checking',
    accountNumber:     account?.accountNumber     ?? '',
    branchName:        account?.branchName        ?? '',
    iban:              account?.iban              ?? '',
    swiftBic:          account?.swiftBic          ?? '',
    currency:          account?.currency          ?? 'XAF',
    openingBalance:    account?.openingBalance    ?? 0,
    isDefault:         account?.isDefault         ?? false,
    accountingAccount: account?.accountingAccount ?? '',
    color:             account?.color             ?? PALETTE[0],
    notes:             account?.notes             ?? '',
  })

  const createMutation = useCreateBankAccount()
  const updateMutation = useUpdateBankAccount()
  const isPending = createMutation.isPending || updateMutation.isPending

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

  const set = (key: keyof CreateBankAccountPayload, value: unknown) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: CreateBankAccountPayload = {
      ...form,
      accountNumber:     form.accountNumber     || null,
      branchName:        form.branchName        || null,
      iban:              form.iban              || null,
      swiftBic:          form.swiftBic          || null,
      accountingAccount: form.accountingAccount || null,
      notes:             form.notes             || null,
    }
    if (isEdit) {
      const result = await updateMutation.mutateAsync({ id: account.id, data: payload })
      onSuccess?.(result as BankAccount)
    } else {
      const result = await createMutation.mutateAsync(payload)
      onSuccess?.(result as BankAccount)
    }
    handleClose()
  }

  const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = 'var(--primary)'
    e.target.style.boxShadow   = '0 0 0 3px rgba(45,125,210,0.12)'
  }
  const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = 'var(--border)'
    e.target.style.boxShadow   = 'none'
  }

  return (
    <>
      <div onClick={handleClose} aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(10,20,35,0.45)',
        backdropFilter: 'blur(2px)',
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.28s ease',
      }} />

      <div role="dialog" aria-modal aria-labelledby={titleId} style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
        width: '100%', maxWidth: 480,
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(10,20,35,0.18)',
        borderLeft: '1px solid var(--border)',
        transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Gradient stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#0f2d4a 0%,#2D7DD2 100%)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ padding: '18px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 'var(--radius-sm)',
                background: 'rgba(45,125,210,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Building2 size={16} style={{ color: 'var(--primary)' }} strokeWidth={1.8} />
              </div>
              <h2 id={titleId} style={{
                fontSize: 15, fontWeight: 700, color: 'var(--text-1)',
                fontFamily: 'var(--font-display)', margin: 0,
              }}>
                {isEdit ? 'Modifier le compte' : 'Nouveau compte bancaire'}
              </h2>
            </div>
            <button type="button" onClick={handleClose} aria-label="Fermer" style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 6, borderRadius: 6, color: 'var(--text-3)',
              display: 'flex', alignItems: 'center',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Form body */}
        <form id="bank-account-form" onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <SectionTitle>Informations générales</SectionTitle>

            <Field label="Nom du compte" required htmlFor="ba-name">
              <input id="ba-name" type="text" required value={form.name}
                onChange={e => set('name', e.target.value)}
                onFocus={focusStyle} onBlur={blurStyle}
                placeholder="ex: Compte courant Afriland"
                style={INPUT_STYLE} />
            </Field>

            <Field label="Banque" required htmlFor="ba-bank">
              <input id="ba-bank" type="text" required value={form.bankName}
                onChange={e => set('bankName', e.target.value)}
                onFocus={focusStyle} onBlur={blurStyle}
                placeholder="ex: Afriland First Bank"
                style={INPUT_STYLE} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Type de compte" required htmlFor="ba-type">
                <select id="ba-type" required value={form.accountType}
                  onChange={e => set('accountType', e.target.value as BankAccountType)}
                  onFocus={focusStyle} onBlur={blurStyle}
                  style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
                  {ACCOUNT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Devise" required htmlFor="ba-currency">
                <select id="ba-currency" value={form.currency}
                  onChange={e => set('currency', e.target.value)}
                  onFocus={focusStyle} onBlur={blurStyle}
                  style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
                  {['XAF', 'EUR', 'USD', 'XOF'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>

            <SectionTitle>Coordonnées bancaires</SectionTitle>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Numéro de compte" htmlFor="ba-num">
                <input id="ba-num" type="text" value={form.accountNumber ?? ''}
                  onChange={e => set('accountNumber', e.target.value)}
                  onFocus={focusStyle} onBlur={blurStyle}
                  placeholder="ex: 0123456789"
                  style={INPUT_STYLE} />
              </Field>
              <Field label="Agence / Succursale" htmlFor="ba-branch">
                <input id="ba-branch" type="text" value={form.branchName ?? ''}
                  onChange={e => set('branchName', e.target.value)}
                  onFocus={focusStyle} onBlur={blurStyle}
                  placeholder="ex: Akwa Douala"
                  style={INPUT_STYLE} />
              </Field>
            </div>

            <Field label="IBAN" htmlFor="ba-iban">
              <input id="ba-iban" type="text" value={form.iban ?? ''}
                onChange={e => set('iban', e.target.value)}
                onFocus={focusStyle} onBlur={blurStyle}
                placeholder="ex: CM2100001000010123456789"
                style={{ ...INPUT_STYLE, fontFamily: 'var(--font-mono)' }} />
            </Field>

            <Field label="SWIFT / BIC" htmlFor="ba-swift">
              <input id="ba-swift" type="text" value={form.swiftBic ?? ''}
                onChange={e => set('swiftBic', e.target.value.toUpperCase())}
                onFocus={focusStyle} onBlur={blurStyle}
                placeholder="ex: AFRIXCMX"
                style={{ ...INPUT_STYLE, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }} />
            </Field>

            <SectionTitle>Paramètres</SectionTitle>

            <Field label="Solde d'ouverture (XAF)" required htmlFor="ba-balance">
              <input id="ba-balance" type="number" min={0} step="1"
                value={form.openingBalance}
                onChange={e => set('openingBalance', parseFloat(e.target.value) || 0)}
                onFocus={focusStyle} onBlur={blurStyle}
                disabled={isEdit}
                style={{ ...INPUT_STYLE, fontFamily: 'var(--font-mono)', opacity: isEdit ? 0.6 : 1, cursor: isEdit ? 'not-allowed' : 'text' }} />
              {isEdit && (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  Le solde d'ouverture ne peut pas être modifié après création.
                </span>
              )}
            </Field>

            <Field label="Compte comptable (SYSCOHADA)" htmlFor="ba-accounting">
              <input id="ba-accounting" type="text" value={form.accountingAccount ?? ''}
                onChange={e => set('accountingAccount', e.target.value)}
                onFocus={focusStyle} onBlur={blurStyle}
                placeholder="ex: 512100"
                style={{ ...INPUT_STYLE, fontFamily: 'var(--font-mono)' }} />
            </Field>

            {/* Palette couleur */}
            <Field label="Couleur d'identification">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set('color', c)}
                    aria-label={`Couleur ${c}`}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: c, border: 'none', cursor: 'pointer',
                      outline: form.color === c ? `3px solid ${c}` : '3px solid transparent',
                      outlineOffset: 2,
                      transform: form.color === c ? 'scale(1.15)' : 'scale(1)',
                      transition: 'transform 0.15s, outline 0.15s',
                    }}
                  />
                ))}
              </div>
            </Field>

            {/* Compte par défaut */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              cursor: 'pointer', padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)',
              background: form.isDefault ? 'rgba(45,125,210,0.05)' : 'var(--surface)',
              transition: 'background 0.15s',
            }}>
              <input type="checkbox" checked={form.isDefault}
                onChange={e => set('isDefault', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }} />
              <span style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500 }}>
                Compte bancaire par défaut
              </span>
            </label>

            <Field label="Notes" htmlFor="ba-notes">
              <textarea id="ba-notes" value={form.notes ?? ''}
                onChange={e => set('notes', e.target.value)}
                onFocus={focusStyle as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
                onBlur={blurStyle as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
                placeholder="Notes internes…"
                rows={3}
                style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: 72 }} />
            </Field>
          </div>
        </form>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          background: 'var(--surface)', flexShrink: 0,
        }}>
          <button type="button" onClick={handleClose} disabled={isPending} style={{
            padding: '9px 18px', minHeight: 40, borderRadius: 'var(--radius-md)',
            background: 'transparent', color: 'var(--text-2)',
            border: '1.5px solid var(--border)',
            fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500,
            cursor: 'pointer',
          }}>
            Annuler
          </button>
          <button type="submit" form="bank-account-form" disabled={isPending} style={{
            padding: '9px 20px', minHeight: 40, borderRadius: 'var(--radius-md)',
            background: 'var(--primary)', color: '#fff', border: 'none',
            fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600,
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.75 : 1,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 12px rgba(45,125,210,0.25)',
          }}>
            {isPending && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
            {isEdit ? 'Enregistrer' : 'Créer le compte'}
          </button>
        </div>
      </div>
    </>
  )
}
