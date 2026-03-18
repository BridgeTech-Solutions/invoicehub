'use client'

import { useState } from 'react'
import { Loader2, CreditCard, X } from 'lucide-react'
import { format } from 'date-fns'
import { useCreatePayment } from '../hooks'
import type { Invoice } from '../types'
import { formatXAF } from '@/lib/utils'
import { PAYMENT_METHODS } from '@/lib/constants'

interface PaymentModalProps {
  invoice: Invoice
  onClose: () => void
}

const today = () => format(new Date(), 'yyyy-MM-dd')

export function PaymentModal({ invoice, onClose }: PaymentModalProps) {
  const balanceDue = Number(invoice.balanceDue)

  const [amount,    setAmount]    = useState(balanceDue)
  const [method,    setMethod]    = useState<string>('bank_transfer')
  const [date,      setDate]      = useState(today())
  const [reference, setReference] = useState('')
  const [notes,     setNotes]     = useState('')

  const mutation = useCreatePayment(invoice.id)

  const isPaidFull  = amount >= balanceDue
  const isValid     = amount > 0 && amount <= balanceDue && !!date

  const inputCss: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
  }

  const FL = ({ label, required }: { label: string; required?: boolean }) => (
    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
      {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </label>
  )

  const handleSubmit = () => {
    mutation.mutate({
      amount,
      method: method as any,
      paymentDate: date,
      reference: reference || undefined,
      notes: notes || undefined,
    }, { onSuccess: onClose })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 480, padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 className="font-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              Enregistrer un paiement
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '3px 0 0' }}>
              Facture {invoice.number} · {invoice.client.name}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Balance indicator */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20,
          padding: '14px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Total TTC</p>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', margin: 0 }}>
              {formatXAF(Number(invoice.totalTtc))}
            </p>
          </div>
          <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Déjà payé</p>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: '#10b981', fontFamily: 'var(--font-mono)', margin: 0 }}>
              {formatXAF(Number(invoice.amountPaid))}
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Solde dû</p>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: '#ef4444', fontFamily: 'var(--font-mono)', margin: 0 }}>
              {formatXAF(balanceDue)}
            </p>
          </div>
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Amount */}
          <div>
            <FL label="Montant reçu (XAF)" required />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number" min="1" max={balanceDue} step="1"
                value={amount}
                onChange={(e) => setAmount(Math.min(balanceDue, Math.max(0, parseFloat(e.target.value) || 0)))}
                style={{ ...inputCss, flex: 1, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: amount > balanceDue ? '#ef4444' : 'var(--text-1)' }}
              />
              <button
                type="button"
                onClick={() => setAmount(balanceDue)}
                style={{ flexShrink: 0, padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--primary)', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Solde total
              </button>
            </div>
            {isPaidFull && (
              <p style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>
                ✓ Règlement intégral — la facture passera en « Payée »
              </p>
            )}
            {amount > 0 && !isPaidFull && (
              <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>
                Solde restant après paiement : {formatXAF(Math.round(balanceDue - amount))}
              </p>
            )}
          </div>

          {/* Method + Date (2 cols) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FL label="Mode de paiement" required />
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                style={{ ...inputCss, cursor: 'pointer' }}
              >
                {Object.entries(PAYMENT_METHODS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <FL label="Date du paiement" required />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputCss} />
            </div>
          </div>

          {/* Reference */}
          <div>
            <FL label="Référence (N° chèque, virement…)" />
            <input
              type="text" value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex: VIR-20240315-001"
              style={inputCss}
            />
          </div>

          {/* Notes */}
          <div>
            <FL label="Notes" />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observations…"
              rows={2}
              style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            Annuler
          </button>
          <button
            type="button"
            disabled={!isValid || mutation.isPending}
            onClick={handleSubmit}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 20px', borderRadius: 'var(--radius-md)',
              background: !isValid ? '#93b8e0' : '#10b981',
              color: '#fff', border: 'none',
              cursor: (!isValid || mutation.isPending) ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
              boxShadow: isValid ? '0 4px 12px rgba(16,185,129,0.3)' : 'none',
            }}
          >
            {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={14} />}
            Enregistrer le paiement
          </button>
        </div>
      </div>
    </div>
  )
}
