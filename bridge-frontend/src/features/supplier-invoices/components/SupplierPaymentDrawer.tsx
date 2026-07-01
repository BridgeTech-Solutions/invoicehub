'use client'

import { OverlayPortal } from '@/components/ui/OverlayPortal'

import { useState, useEffect, useRef, useCallback, useId } from 'react'
import {
  X, CreditCard, Banknote, FileText, Smartphone, MoreHorizontal,
  ArrowLeftRight, Building2, ChevronRight, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { format as formatDate } from 'date-fns'
import { useRecordSupplierPayment } from '../hooks'
import { useBankAccounts } from '@/features/invoices/hooks'
import type { SupplierInvoice } from '../types'
import { useCurrency } from '@/hooks/useCurrency'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplierPaymentDrawerProps {
  invoice: SupplierInvoice
  onClose: () => void
}

// Le backend FF attend un enum ANGLAIS (bank_transfer/cash/check/mobile_money/other),
// contrairement aux paiements clients (clés FR). On mappe value(EN) → label(FR) + icône.
type FfMethod = 'bank_transfer' | 'cash' | 'check' | 'mobile_money' | 'other'

const FF_METHODS: { value: FfMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'bank_transfer', label: 'Virement bancaire', icon: <ArrowLeftRight size={14} /> },
  { value: 'cash',          label: 'Espèces',           icon: <Banknote size={14} />       },
  { value: 'check',         label: 'Chèque',            icon: <FileText size={14} />       },
  { value: 'mobile_money',  label: 'Mobile Money',      icon: <Smartphone size={14} />     },
  { value: 'other',         label: 'Autre',             icon: <MoreHorizontal size={14} /> },
]

const today = () => formatDate(new Date(), 'yyyy-MM-dd')

// ─── Status badge (statuts FF) ──────────────────────────────────────────────────

const FF_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  received:       { label: 'Reçue',       color: '#2563eb', bg: 'rgba(59,130,246,0.12)'  },
  validated:      { label: 'Validée',     color: '#2D7DD2', bg: 'rgba(45,125,210,0.12)'  },
  partially_paid: { label: 'Part. payée', color: '#d97706', bg: 'rgba(245,158,11,0.12)'  },
  paid:           { label: 'Payée',       color: '#16a34a', bg: 'rgba(16,163,74,0.12)'   },
  disputed:       { label: 'Contestée',   color: '#dc2626', bg: 'rgba(239,68,68,0.12)'   },
  cancelled:      { label: 'Annulée',     color: '#94a3b8', bg: 'rgba(148,163,184,0.18)' },
}

function StatusBadge({ status }: { status: string }) {
  const meta = FF_STATUS_META[status] ?? { label: status, color: 'var(--text-3)', bg: 'var(--surface-2)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-display)',
      background: meta.bg, color: meta.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
      {meta.label}
    </span>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <span style={{
        fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)',
        fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em',
      }}>
        {children}
      </span>
      {optional && (
        <span style={{
          fontSize: 10.5, fontWeight: 500, color: 'var(--text-3)',
          fontFamily: 'var(--font-body)', textTransform: 'none', letterSpacing: 0,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '1px 5px',
        }}>
          optionnel
        </span>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SupplierPaymentDrawer({ invoice, onClose }: SupplierPaymentDrawerProps) {
  const { format } = useCurrency()
  const titleId    = useId()
  const balanceDue = Number(invoice.balanceDue)
  const amountPaid = Number(invoice.amountPaid)
  const totalTtc   = Number(invoice.totalTtc)

  // ── Form state ──────────────────────────────────────────────
  const [amount,        setAmount]        = useState(balanceDue)
  const [method,        setMethod]        = useState<FfMethod>('bank_transfer')
  const [date,          setDate]          = useState(today())
  const [reference,     setReference]     = useState('')
  const [notes,         setNotes]         = useState('')
  const [bankAccountId, setBankAccountId] = useState('')

  // ── Animation state ─────────────────────────────────────────
  const [isVisible, setIsVisible] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // ── Data ──────────────────────────────────────────────────────
  const { data: bankAccounts = [] } = useBankAccounts()
  const mutation = useRecordSupplierPayment(invoice.id)

  // ── Handlers ─────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleClose])

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ── Computed ──────────────────────────────────────────────────
  const isValid       = amount > 0 && amount <= balanceDue + 0.01 && !!date
  const newAmountPaid = amountPaid + amount
  const newBalance    = Math.max(0, balanceDue - amount)
  const willBePaid    = newBalance <= 0.01
  const pctBefore     = totalTtc > 0 ? (amountPaid / totalTtc) * 100 : 0
  const pctAfter      = totalTtc > 0 ? (newAmountPaid / totalTtc) * 100 : 0
  const pctDisplay    = Math.min(100, pctAfter)

  const handleAmount = (raw: string) => {
    const v = parseFloat(raw) || 0
    setAmount(Math.min(balanceDue + 0.01, Math.max(0, v)))
  }

  const handleSubmit = () => {
    if (!isValid || mutation.isPending) return
    mutation.mutate({
      amount,
      method,
      paymentDate:   date,
      reference:     reference || undefined,
      notes:         notes || undefined,
      bankAccountId: bankAccountId || undefined,
    }, { onSuccess: handleClose })
  }

  // ─── Styles ───────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)',
    background: 'var(--surface)',
    fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)',
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s ease',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235a7a96' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 32,
  }

  return (
    <OverlayPortal>
    <>
      {/* ── Backdrop ──────────────────────────────────────────── */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(10, 20, 35, 0.45)',
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 0.28s ease',
          backdropFilter: 'blur(2px)',
        }}
        aria-hidden="true"
      />

      {/* ── Drawer panel ──────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
          width: '100%', maxWidth: 500,
          background: 'var(--surface)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(10, 20, 35, 0.18), -2px 0 8px rgba(10, 20, 35, 0.08)',
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.30s cubic-bezier(0.4, 0, 0.2, 1)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        {/* Navy accent top stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #0f2d4a 0%, #2D7DD2 100%)', flexShrink: 0 }} />

        {/* ── Header ────────────────────────────────────────── */}
        <div style={{
          padding: '18px 24px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          background: 'var(--surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                  background: 'var(--primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <CreditCard size={15} style={{ color: 'var(--primary)' }} />
                </div>
                <h2 id={titleId} style={{
                  fontSize: 15, fontWeight: 700, color: 'var(--text-1)',
                  fontFamily: 'var(--font-display)', margin: 0,
                }}>
                  Régler la facture fournisseur
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 40, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12,
                  color: 'var(--text-2)', letterSpacing: '0.04em',
                }}>
                  {invoice.number}
                </span>
                <span style={{ color: 'var(--border-strong)', fontSize: 12 }}>·</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500 }}>
                  {invoice.supplier.name}
                </span>
                <StatusBadge status={invoice.status} />
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Fermer le panneau"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0,
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ───────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Balance recap */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 1, marginBottom: 20,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            {[
              { label: 'Total TTC', value: totalTtc,   color: 'var(--text-1)' },
              { label: 'Déjà payé', value: amountPaid, color: '#10b981' },
              { label: 'Solde dû',  value: balanceDue, color: '#ef4444' },
            ].map((item, i) => (
              <div key={i} style={{
                padding: '11px 10px', textAlign: 'center',
                background: 'var(--surface-2)',
                borderRight: i < 2 ? '1px solid var(--border)' : undefined,
              }}>
                <p style={{
                  fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)',
                  margin: '0 0 4px', textTransform: 'uppercase',
                  letterSpacing: '0.06em', fontFamily: 'var(--font-display)',
                }}>
                  {item.label}
                </p>
                <p style={{
                  fontSize: 13, fontWeight: 700, color: item.color,
                  fontFamily: 'var(--font-mono)', margin: 0,
                  letterSpacing: '-0.02em',
                }}>
                  {format(item.value)}
                </p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              height: 6, borderRadius: 99, background: 'var(--border)',
              overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${pctBefore}%`,
                background: '#10b981', borderRadius: 99,
                transition: 'width 0.3s ease',
              }} />
              <div style={{
                position: 'absolute', left: `${pctBefore}%`, top: 0, bottom: 0,
                width: `${Math.max(0, pctDisplay - pctBefore)}%`,
                background: willBePaid ? '#10b981' : 'var(--primary)',
                borderRadius: 99,
                opacity: amount > 0 ? 1 : 0,
                transition: 'width 0.25s ease, opacity 0.2s ease, background 0.2s ease',
              }} />
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              marginTop: 5, fontSize: 11, color: 'var(--text-3)',
              fontFamily: 'var(--font-mono)',
            }}>
              <span>{Math.round(pctBefore)}% payé</span>
              {amount > 0 && (
                <span style={{ color: willBePaid ? '#10b981' : 'var(--primary)', fontWeight: 600 }}>
                  → {Math.round(Math.min(100, pctDisplay))}% {willBePaid ? '· Soldée ✓' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 18 }}>
            <FieldLabel>Montant payé (XAF)</FieldLabel>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  ref={amountRef}
                  type="number"
                  min="1"
                  max={balanceDue}
                  step="1"
                  value={amount || ''}
                  onChange={e => handleAmount(e.target.value)}
                  style={{
                    ...inputStyle,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em',
                    paddingRight: 48,
                    color: amount > balanceDue ? '#ef4444' : 'var(--text-1)',
                    borderColor: amount > balanceDue ? '#ef4444' : 'var(--border)',
                  }}
                  placeholder="0"
                  autoFocus
                />
                <span style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 12, fontWeight: 600, color: 'var(--text-3)',
                  fontFamily: 'var(--font-display)', pointerEvents: 'none',
                }}>
                  XAF
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAmount(balanceDue)}
                style={{
                  flexShrink: 0, padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--primary)', fontSize: 12,
                  fontFamily: 'var(--font-display)', fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--primary-light)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
              >
                Solde total
              </button>
            </div>
            <div style={{ marginTop: 6, minHeight: 18 }}>
              {willBePaid && amount > 0 && (
                <p style={{ fontSize: 12, color: '#10b981', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={12} /> Règlement intégral — la facture passera en « Payée »
                </p>
              )}
              {!willBePaid && amount > 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                  Solde restant après paiement :{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-2)' }}>
                    {format(Math.round(newBalance))}
                  </span>
                </p>
              )}
              {amount > balanceDue && (
                <p style={{ fontSize: 12, color: '#ef4444', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={12} /> Dépasse le solde dû
                </p>
              )}
            </div>
          </div>

          {/* Payment method */}
          <div style={{ marginBottom: 18 }}>
            <FieldLabel>Mode de paiement</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FF_METHODS.map(({ value, label, icon }) => {
                const selected = method === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMethod(value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: selected ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                      background: selected ? 'var(--primary-light)' : 'var(--surface)',
                      color: selected ? 'var(--primary)' : 'var(--text-2)',
                      fontSize: 12.5, fontWeight: selected ? 600 : 400,
                      fontFamily: 'var(--font-display)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {icon}
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date + Reference */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <FieldLabel>Date du paiement</FieldLabel>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel optional>Référence</FieldLabel>
              <input
                type="text"
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="N° virement, chèque…"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Bank account */}
          <div style={{ marginBottom: 18 }}>
            <FieldLabel optional>Compte bancaire BTS débité</FieldLabel>
            <div style={{ position: 'relative' }}>
              <Building2 size={14} style={{
                position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-3)', pointerEvents: 'none',
              }} />
              <select
                value={bankAccountId}
                onChange={e => setBankAccountId(e.target.value)}
                style={{ ...selectStyle, paddingLeft: 32 }}
              >
                <option value="">— Aucun compte sélectionné —</option>
                {bankAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}{acc.bankName ? ` · ${acc.bankName}` : ''}{acc.accountingAccount ? ` (${acc.accountingAccount})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {bankAccountId ? (
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>
                Le décaissement comptable utilisera le compte de cette banque.
              </p>
            ) : (
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>
                Non sélectionné → compte de trésorerie par défaut utilisé.
              </p>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 8 }}>
            <FieldLabel optional>Notes</FieldLabel>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observations, contexte…"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55 }}
            />
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '14px 24px',
          background: 'var(--surface)',
          flexShrink: 0,
        }}>
          {amount > 0 && isValid && (
            <div style={{
              marginBottom: 12, padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              background: willBePaid ? 'rgba(16,185,129,0.08)' : 'var(--primary-light)',
              border: `1px solid ${willBePaid ? 'rgba(16,185,129,0.2)' : 'rgba(45,125,210,0.2)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
                {willBePaid ? 'Facture entièrement soldée après ce paiement' : `Solde restant : ${format(Math.round(newBalance))}`}
              </span>
              {willBePaid && <CheckCircle2 size={14} style={{ color: '#10b981', flexShrink: 0 }} />}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleClose}
              style={{
                padding: '9px 18px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-2)', fontSize: 13.5,
                cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 500,
                transition: 'background 0.15s',
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={!isValid || mutation.isPending}
              onClick={handleSubmit}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 20px',
                borderRadius: 'var(--radius-md)',
                background: !isValid
                  ? 'var(--border-strong)'
                  : willBePaid
                  ? '#10b981'
                  : 'var(--primary)',
                color: '#fff', border: 'none',
                cursor: (!isValid || mutation.isPending) ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
                boxShadow: isValid
                  ? willBePaid
                    ? '0 4px 14px rgba(16,185,129,0.3)'
                    : '0 4px 14px rgba(45,125,210,0.3)'
                  : 'none',
                transition: 'all 0.2s ease',
                opacity: mutation.isPending ? 0.75 : 1,
              }}
            >
              {mutation.isPending ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <CreditCard size={14} />
              )}
              {mutation.isPending ? 'Enregistrement…' : 'Enregistrer le paiement'}
              {!mutation.isPending && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
    </OverlayPortal>
  )
}
