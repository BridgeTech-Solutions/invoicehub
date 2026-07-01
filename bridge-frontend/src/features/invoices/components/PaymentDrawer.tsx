'use client'

import { OverlayPortal } from '@/components/ui/OverlayPortal'

import { useState, useEffect, useRef, useCallback, useId } from 'react'
import {
  X, CreditCard, Banknote, FileText, Smartphone, MoreHorizontal,
  ArrowLeftRight, Building2, Paperclip, ChevronRight, CheckCircle2,
  AlertCircle, Tag, Landmark,
} from 'lucide-react'
import { format } from 'date-fns'
import { useCreatePayment, useBankAccounts } from '../hooks'
import type { Invoice } from '../types'
import { useCurrency } from '@/hooks/useCurrency'
import { useSettings } from '@/features/settings/hooks'
import { PAYMENT_METHODS, STATUS_LABELS } from '@/lib/constants'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentDrawerProps {
  invoice: Invoice
  onClose: () => void
}

type PaymentMethod = keyof typeof PAYMENT_METHODS

const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  virement:     <ArrowLeftRight size={14} />,
  especes:      <Banknote size={14} />,
  cheque:       <FileText size={14} />,
  mobile_money: <Smartphone size={14} />,
  autre:        <MoreHorizontal size={14} />,
}

const today = () => format(new Date(), 'yyyy-MM-dd')

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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    issued:         { bg: 'var(--s-sent-bg)',     color: 'var(--s-sent)' },
    partially_paid: { bg: 'var(--s-partial-bg)',  color: 'var(--s-partial)' },
    overdue:        { bg: 'var(--s-overdue-bg)',  color: 'var(--s-overdue)' },
  }
  const style = map[status] ?? { bg: 'var(--s-draft-bg)', color: 'var(--s-draft)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-display)',
      background: style.bg, color: style.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: style.color, flexShrink: 0 }} />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PaymentDrawer({ invoice, onClose }: PaymentDrawerProps) {
  const { format } = useCurrency()
  const titleId     = useId()
  const balanceDue  = Number(invoice.balanceDue)
  const amountPaid  = Number(invoice.amountPaid)
  const totalTtc    = Number(invoice.totalTtc)

  // ── Form state ──────────────────────────────────────────────
  const [amount,         setAmount]         = useState(balanceDue)
  const [method,         setMethod]         = useState<PaymentMethod>('virement')
  const [date,           setDate]           = useState(today())
  const [reference,      setReference]      = useState('')
  const [notes,          setNotes]          = useState('')
  const [bankAccountId,  setBankAccountId]  = useState(invoice.bankAccountId ?? '')
  const [attachmentName, setAttachmentName] = useState<string | null>(null)
  const [isDragging,     setIsDragging]     = useState(false)
  const [applyEscompte,  setApplyEscompte]  = useState(false)

  // ── Retenue à la source subie (acompte IR / précompte) ──────
  const [applyWithholding, setApplyWithholding] = useState(false)
  const [withholdingRate,  setWithholdingRate]  = useState(2.2)
  const [withholdingAmt,   setWithholdingAmt]   = useState(0)

  // ── Animation state ─────────────────────────────────────────
  const [isVisible, setIsVisible] = useState(false)
  const amountRef   = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ── Data ──────────────────────────────────────────────────────
  const { data: bankAccounts = [] } = useBankAccounts()
  const { data: settings } = useSettings()
  const mutation = useCreatePayment(invoice.id)

  // Taux de retenue par défaut depuis les paramètres (tant que l'utilisateur n'a
  // pas activé/modifié la retenue sur cet écran).
  useEffect(() => {
    if (!applyWithholding && settings?.withholdingRate != null) {
      setWithholdingRate(Number(settings.withholdingRate))
    }
  }, [settings?.withholdingRate, applyWithholding])

  // ── Escompte eligibility ──────────────────────────────────────
  const escompteRate    = invoice.escompteRate != null ? Number(invoice.escompteRate) : null
  const escompteAmount  = Number(invoice.escompteAmount ?? 0)
  const escompteAlreadyApplied = invoice.payments?.some(p => p.escompteApplied) ?? false
  const escompteEligible =
    escompteRate != null &&
    escompteAmount > 0 &&
    invoice.escompteDeadline != null &&
    date <= invoice.escompteDeadline.slice(0, 10) &&
    !escompteAlreadyApplied

  // ── Retenue à la source : base = HT de la facture (pré-calcul, modifiable) ──
  const baseHt = Number(invoice.totalHt)
  const computeWithholding = (rate: number) => Math.min(balanceDue, Math.round((baseHt * rate) / 100))

  // ── Computed ──────────────────────────────────────────────────
  const escompteCovers    = applyEscompte && escompteEligible ? escompteAmount : 0
  const withholdingCovers = applyWithholding ? Math.min(Math.max(0, withholdingAmt), balanceDue) : 0
  const totalCovered      = amount + escompteCovers + withholdingCovers
  const isValid           = amount > 0 && totalCovered <= balanceDue + 0.01 && !!date
  const newAmountPaid     = amountPaid + totalCovered
  const newBalance        = Math.max(0, balanceDue - totalCovered)
  const willBePaid      = newBalance <= 0.01
  const pctBefore       = totalTtc > 0 ? (amountPaid / totalTtc) * 100 : 0
  const pctAfter        = totalTtc > 0 ? (newAmountPaid / totalTtc) * 100 : 0
  const pctDisplay      = Math.min(100, pctAfter)

  // ── Handlers ─────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  const handleAmount = (raw: string) => {
    const v = parseFloat(raw) || 0
    const max = balanceDue - escompteCovers - withholdingCovers
    setAmount(Math.min(max + 0.01, Math.max(0, v)))
  }

  const handleFile = (file: File) => {
    setAttachmentName(file.name)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleToggleEscompte = (checked: boolean) => {
    setApplyEscompte(checked)
    const esc = checked && escompteEligible ? escompteAmount : 0
    setAmount(Math.max(0, balanceDue - esc - withholdingCovers))
  }

  // ── Retenue à la source handlers ─────────────────────────────
  const handleToggleWithholding = (checked: boolean) => {
    setApplyWithholding(checked)
    const wh = checked ? computeWithholding(withholdingRate) : 0
    setWithholdingAmt(wh)
    setAmount(Math.max(0, balanceDue - escompteCovers - wh))
  }

  const handleWithholdingRate = (raw: string) => {
    const r = Math.max(0, Math.min(100, parseFloat(raw) || 0))
    setWithholdingRate(r)
    if (applyWithholding) {
      const wh = computeWithholding(r)
      setWithholdingAmt(wh)
      setAmount(Math.max(0, balanceDue - escompteCovers - wh))
    }
  }

  const handleWithholdingAmount = (raw: string) => {
    const wh = Math.max(0, Math.min(balanceDue, parseFloat(raw) || 0))
    setWithholdingAmt(wh)
    setAmount(Math.max(0, balanceDue - escompteCovers - wh))
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
      ...(applyEscompte && escompteEligible && { applyEscompte: true }),
      ...(applyWithholding && withholdingCovers > 0 && { withholdingAmount: withholdingCovers }),
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
                  Enregistrer un paiement
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 40 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12,
                  color: 'var(--text-2)', letterSpacing: '0.04em',
                }}>
                  {invoice.number}
                </span>
                <span style={{ color: 'var(--border-strong)', fontSize: 12 }}>·</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500 }}>
                  {invoice.client.name}
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
              { label: 'Total TTC',  value: totalTtc,   color: 'var(--text-1)' },
              { label: 'Déjà payé',  value: amountPaid, color: '#10b981' },
              { label: 'Solde dû',   value: balanceDue, color: '#ef4444' },
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
              {/* Already paid */}
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${pctBefore}%`,
                background: '#10b981',
                borderRadius: 99,
                transition: 'width 0.3s ease',
              }} />
              {/* This payment */}
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

          {/* Escompte banner */}
          {escompteEligible && (
            <div style={{
              background: '#fffbeb', border: '1px solid #d97706',
              borderRadius: 'var(--radius-md)', padding: '12px 14px',
              marginBottom: 18,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Tag size={15} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: '#92400e', margin: '0 0 4px' }}>
                    Escompte de règlement disponible
                  </p>
                  <p style={{ fontSize: 12, color: '#78350f', margin: '0 0 8px' }}>
                    Taux {escompteRate}% — réduction de{' '}
                    <strong>{format(escompteAmount)}</strong>
                    {invoice.escompteDeadline && (
                      <> (valable jusqu'au {new Date(invoice.escompteDeadline).toLocaleDateString('fr-FR')})</>
                    )}
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={applyEscompte}
                      onChange={e => handleToggleEscompte(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: '#d97706', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12.5, color: '#92400e', fontWeight: 600 }}>
                      Appliquer l'escompte — client paie{' '}
                      <strong>{format(Math.max(0, balanceDue - escompteAmount))}</strong>
                      {' '}au lieu de {format(balanceDue)}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Escompte already applied notice */}
          {escompteAlreadyApplied && invoice.escompteRate != null && (
            <div style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', padding: '10px 14px',
              marginBottom: 18, fontSize: 12, color: 'var(--text-3)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Tag size={13} />
              L'escompte a déjà été appliqué sur un paiement précédent de cette facture.
            </div>
          )}

          {/* Retenue à la source subie */}
          <div style={{
            border: `1.5px solid ${applyWithholding ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 18,
            background: applyWithholding ? 'var(--primary-light)' : 'var(--surface-2)',
            transition: 'border-color 0.15s, background 0.15s',
          }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={applyWithholding}
                onChange={e => handleToggleWithholding(e.target.checked)}
                style={{ marginTop: 2, width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ flex: 1 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                  <Landmark size={14} style={{ color: 'var(--primary)' }} />
                  Le client a prélevé une retenue à la source
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.5 }}>
                  Acompte IR / précompte reversé à l&apos;État pour votre compte (créance d&apos;impôt, pas un impayé).
                  La facture est soldée par : encaissé + retenue.
                </span>
              </span>
            </label>

            {applyWithholding && (
              <div style={{ marginTop: 12, paddingLeft: 25 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10 }}>
                  <div>
                    <FieldLabel>Taux (%)</FieldLabel>
                    <input
                      type="number" min="0" max="100" step="0.1"
                      value={withholdingRate || ''}
                      onChange={e => handleWithholdingRate(e.target.value)}
                      style={{ ...inputStyle, fontFamily: 'var(--font-mono)', textAlign: 'center' }}
                    />
                  </div>
                  <div>
                    <FieldLabel>Montant retenu (XAF)</FieldLabel>
                    <input
                      type="number" min="0" max={balanceDue} step="1"
                      value={withholdingAmt || ''}
                      onChange={e => handleWithholdingAmount(e.target.value)}
                      style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                    />
                  </div>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: '8px 0 0', lineHeight: 1.5 }}>
                  Base HT {format(baseHt)} × {withholdingRate}% ={' '}
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{format(withholdingCovers)}</strong>.
                  Le client encaisse{' '}
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{format(Math.max(0, balanceDue - escompteCovers - withholdingCovers))}</strong>.
                  Écriture : Dr {settings?.withholdingAccount || '4492'} / Cr 411.
                </p>
              </div>
            )}
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 18 }}>
            <FieldLabel>Montant reçu (XAF)</FieldLabel>
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
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
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
                onClick={() => setAmount(Math.max(0, balanceDue - escompteCovers - withholdingCovers))}
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
              {(Object.entries(PAYMENT_METHODS) as [PaymentMethod, string][]).map(([val, label]) => {
                const selected = method === val
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMethod(val)}
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
                    {METHOD_ICONS[val]}
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
            <FieldLabel optional>Compte bancaire BTS crédité</FieldLabel>
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
            {bankAccountId && (
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>
                L'écriture comptable utilisera le compte de cette banque.
              </p>
            )}
            {!bankAccountId && (
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>
                Non sélectionné → compte générique <span style={{ fontFamily: 'var(--font-mono)' }}>521000</span> utilisé.
              </p>
            )}
          </div>

          {/* Attachment */}
          <div style={{ marginBottom: 18 }}>
            <FieldLabel optional>Pièce jointe</FieldLabel>
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `1.5px dashed ${isDragging ? 'var(--primary)' : attachmentName ? 'var(--border-strong)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer',
                background: isDragging ? 'var(--primary-light)' : attachmentName ? 'var(--surface-2)' : 'var(--surface)',
                transition: 'all 0.15s ease',
              }}
            >
              <Paperclip size={15} style={{ color: attachmentName ? 'var(--primary)' : 'var(--text-3)', flexShrink: 0 }} />
              {attachmentName ? (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, color: 'var(--text-1)', margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {attachmentName}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                    Cliquer pour changer
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0 }}>
                    Glisser un fichier ici ou <span style={{ color: 'var(--primary)', fontWeight: 600 }}>parcourir</span>
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                    PDF, JPG, PNG — scan chèque, ordre de virement…
                  </p>
                </div>
              )}
              {attachmentName && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setAttachmentName(null) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, flexShrink: 0 }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
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
          {/* Summary pill */}
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
