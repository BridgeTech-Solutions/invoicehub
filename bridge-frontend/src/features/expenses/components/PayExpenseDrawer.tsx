'use client'

import { OverlayPortal } from '@/components/ui/OverlayPortal'

import { useState, useEffect, useCallback, useId } from 'react'
import {
  X, Banknote, FileText, Smartphone, MoreHorizontal,
  ArrowLeftRight, CreditCard, Building2, ChevronRight, CheckCircle2,
} from 'lucide-react'
import { useMarkExpensePaid } from '../hooks'
import { useBankAccounts } from '@/features/bank/hooks'
import { useCurrency } from '@/hooks/useCurrency'

// Valeurs attendues par le backend (payExpenseSchema, en anglais)
type PayMethod = 'bank_transfer' | 'cash' | 'check' | 'mobile_money' | 'card' | 'other'

const PAY_METHODS: { val: PayMethod; label: string; icon: React.ReactNode }[] = [
  { val: 'bank_transfer', label: 'Virement',     icon: <ArrowLeftRight size={14} /> },
  { val: 'cash',          label: 'Espèces',      icon: <Banknote size={14} /> },
  { val: 'check',         label: 'Chèque',       icon: <FileText size={14} /> },
  { val: 'mobile_money',  label: 'Mobile Money', icon: <Smartphone size={14} /> },
  { val: 'card',          label: 'Carte',        icon: <CreditCard size={14} /> },
  { val: 'other',         label: 'Autre',        icon: <MoreHorizontal size={14} /> },
]

interface PayExpenseDrawerProps {
  expense: { id: string; designation: string; amountTtc: number; bankAccountId?: string | null }
  onClose: () => void
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {children}
      </span>
      {optional && (
        <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--text-3)', textTransform: 'none', letterSpacing: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>
          optionnel
        </span>
      )}
    </div>
  )
}

export function PayExpenseDrawer({ expense, onClose }: PayExpenseDrawerProps) {
  const { format } = useCurrency()
  const titleId = useId()

  const [bankAccountId, setBankAccountId] = useState(expense.bankAccountId ?? '')
  const [method,        setMethod]        = useState<PayMethod>('bank_transfer')
  const [isVisible,     setIsVisible]     = useState(false)

  const { data: bankAccounts = [] } = useBankAccounts()
  const mutation = useMarkExpensePaid()

  useEffect(() => {
    const t = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const selectedAccount = bankAccounts.find(a => a.id === bankAccountId)
  // Espèces sans compte caisse sélectionné → on alerte (devrait pointer 571)
  const cashWithoutAccount = method === 'cash' && !bankAccountId

  const handleSubmit = () => {
    if (mutation.isPending) return
    mutation.mutate(
      { id: expense.id, bankAccountId: bankAccountId || null, paymentMethod: method },
      { onSuccess: handleClose },
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    fontSize: 13.5, color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
  }
  const selectStyle: React.CSSProperties = {
    ...inputStyle, cursor: 'pointer', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235a7a96' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32,
  }

  return (
    <OverlayPortal>
    <>
      <div onClick={handleClose} aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10, 20, 35, 0.45)', opacity: isVisible ? 1 : 0, transition: 'opacity 0.28s ease', backdropFilter: 'blur(2px)' }} />

      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
          width: '100%', maxWidth: 460, background: 'var(--surface)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(10, 20, 35, 0.18)',
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.30s cubic-bezier(0.4, 0, 0.2, 1)', borderLeft: '1px solid var(--border)',
        }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #0f2d4a 0%, #16a34a 100%)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ padding: '18px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'rgba(22,163,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Banknote size={15} style={{ color: '#16a34a' }} />
                </div>
                <h2 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
                  Payer la dépense
                </h2>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, paddingLeft: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {expense.designation} · <strong style={{ fontFamily: 'var(--font-mono)' }}>{format(expense.amountTtc)}</strong>
              </p>
            </div>
            <button type="button" onClick={handleClose} aria-label="Fermer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* Mode de paiement */}
          <div style={{ marginBottom: 20 }}>
            <FieldLabel>Mode de paiement</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PAY_METHODS.map(({ val, label, icon }) => {
                const selected = method === val
                return (
                  <button key={val} type="button" onClick={() => setMethod(val)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: selected ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                      background: selected ? 'var(--primary-light)' : 'var(--surface)',
                      color: selected ? 'var(--primary)' : 'var(--text-2)',
                      fontSize: 12.5, fontWeight: selected ? 600 : 400, fontFamily: 'var(--font-display)', cursor: 'pointer',
                    }}>
                    {icon}{label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Compte de trésorerie */}
          <div style={{ marginBottom: 8 }}>
            <FieldLabel optional>Compte de trésorerie (banque ou caisse)</FieldLabel>
            <div style={{ position: 'relative' }}>
              <Building2 size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} style={{ ...selectStyle, paddingLeft: 32 }}>
                <option value="">— Aucun (compte banque par défaut) —</option>
                {bankAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}{acc.bankName ? ` · ${acc.bankName}` : ''}{acc.accountingAccount ? ` (${acc.accountingAccount})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: 11.5, color: cashWithoutAccount ? '#b45309' : 'var(--text-3)', marginTop: 6 }}>
              {selectedAccount
                ? `L'écriture comptable créditera le compte ${selectedAccount.accountingAccount ?? 'de ce compte'}.`
                : cashWithoutAccount
                  ? 'Paiement en espèces : sélectionnez votre caisse pour créditer le compte 571 au lieu de la banque par défaut.'
                  : 'Non sélectionné → l\'écriture créditera le compte banque par défaut des paramètres.'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 24px', flexShrink: 0, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleClose}
            style={{ padding: '9px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            Annuler
          </button>
          <button type="button" disabled={mutation.isPending} onClick={handleSubmit}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px',
              borderRadius: 'var(--radius-md)', background: '#16a34a', color: '#fff', border: 'none',
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
              boxShadow: '0 4px 14px rgba(22,163,74,0.3)', opacity: mutation.isPending ? 0.75 : 1,
            }}>
            {mutation.isPending
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              : <CheckCircle2 size={14} />}
            {mutation.isPending ? 'Paiement…' : 'Confirmer le paiement'}
            {!mutation.isPending && <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
    </OverlayPortal>
  )
}
