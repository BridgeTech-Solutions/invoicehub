'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { Loader2, FileX, X, ListRestart } from 'lucide-react'
import { format } from 'date-fns'
import { useCreateAvoir } from '../hooks'
import { LineItemsEditor } from '@/components/document/LineItemsEditor'
import { TotalsPanel } from '@/components/document/TotalsPanel'
import type { Invoice, CreateInvoiceLinePayload, FormLine, DiscountType } from '../types'
import { lineToFormLine } from '@/lib/document-math'
import { useCurrency } from '@/hooks/useCurrency'

interface AvoirModalProps {
  invoice: Invoice
  onClose: () => void
}

export function AvoirModal({ invoice, onClose }: AvoirModalProps) {
  const { format: formatCurrency } = useCurrency()
  const titleId = useId()

  // ── Drawer animation ──────────────────────────────────────────
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(t)
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleClose])

  // ── Form state ────────────────────────────────────────────────
  const [reason,              setReason]              = useState('')
  const [notes,               setNotes]               = useState('')
  const [dueDate,             setDueDate]             = useState(format(new Date(), 'yyyy-MM-dd'))
  const [customLines,         setCustomLines]         = useState(false)
  const [lines,               setLines]               = useState<FormLine[]>(() => invoice.lines.map(lineToFormLine))
  const [globalDiscountType,  setGlobalDiscountType]  = useState<DiscountType>('percentage')
  const [globalDiscountValue, setGlobalDiscountValue] = useState(0)

  const mutation = useCreateAvoir()

  const handleSubmit = () => {
    mutation.mutate({
      id: invoice.id,
      data: {
        reason,
        notes:   notes   || undefined,
        dueDate: dueDate || undefined,
        lines: customLines
          ? lines.map((l, i) => ({
              productId:     l.productId,
              sortOrder:     i,
              designation:   l.designation,
              description:   l.description || undefined,
              unit:          l.unit,
              quantity:      l.quantity,
              unitPriceHt:   l.unitPriceHt,
              discountType:  l.discountType,
              discountValue: l.discountValue,
              taxRate:       l.taxRate,
            }) as CreateInvoiceLinePayload)
          : undefined,
      },
    }, { onSuccess: handleClose })
  }

  // ── Styles ────────────────────────────────────────────────────
  const inputCss: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }
  const focusOn  = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = 'var(--primary)';
    (e.target as HTMLElement).style.boxShadow   = '0 0 0 3px var(--primary-light)'
  }
  const focusOff = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = 'var(--border)';
    (e.target as HTMLElement).style.boxShadow   = 'none'
  }

  const canSubmit = reason.trim() !== '' && !mutation.isPending && (!customLines || lines.length > 0)

  return (
    <>
      {/* ── Backdrop ─────────────────────────────────────────── */}
      <div
        onClick={handleClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(10,20,35,0.45)',
          backdropFilter: 'blur(2px)',
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 0.28s ease',
        }}
      />

      {/* ── Drawer panel ─────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
          width: '100%', maxWidth: customLines ? 900 : 520,
          background: 'var(--surface)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(10,20,35,0.18), -2px 0 8px rgba(10,20,35,0.08)',
          borderLeft: '1px solid var(--border)',
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1), max-width 0.25s ease',
        }}
      >
        {/* Gradient stripe — violet pour l'avoir */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#5b21b6 0%,#7c3aed 50%,#a78bfa 100%)', flexShrink: 0 }} />

        {/* ── Header ───────────────────────────────────────── */}
        <div style={{ padding: '18px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 'var(--radius-sm)',
                background: 'rgba(124,58,237,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <FileX size={16} style={{ color: '#7c3aed' }} strokeWidth={1.8} />
              </div>
              <div>
                <h2 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0, lineHeight: 1.2 }}>
                  Créer un avoir
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
                  {invoice.number} · {invoice.client.name} · {formatCurrency(Number(invoice.totalTtc))}
                </p>
              </div>
            </div>
            <button
              type="button" onClick={handleClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 6, borderRadius: 6, flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Motif */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
              Motif <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text" value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex : Remboursement partiel, erreur de facturation…"
              style={inputCss}
              onFocus={focusOn} onBlur={focusOff}
            />
          </div>

          {/* Date d'échéance + Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
                Date d'échéance
              </label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                style={inputCss} onFocus={focusOn} onBlur={focusOff} />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
                Notes
              </label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Optionnel…"
                style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }}
                onFocus={focusOn} onBlur={focusOff} />
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Toggle lignes personnalisées */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            border: `1.5px solid ${customLines ? 'rgba(124,58,237,0.3)' : 'var(--border)'}`,
            background: customLines ? 'rgba(124,58,237,0.04)' : 'transparent',
            transition: 'all 0.15s',
          }}>
            <input
              type="checkbox" checked={customLines}
              onChange={e => setCustomLines(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: '#7c3aed', cursor: 'pointer', flexShrink: 0 }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ListRestart size={13} style={{ color: customLines ? '#7c3aed' : 'var(--text-3)' }} />
                <span style={{
                  fontSize: 13.5, fontWeight: customLines ? 600 : 400,
                  color: customLines ? '#7c3aed' : 'var(--text-1)',
                  fontFamily: 'var(--font-display)',
                }}>
                  Personnaliser les lignes
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 0' }}>
                {customLines
                  ? 'Modifiez les articles et quantités à créditer ci-dessous'
                  : 'Par défaut : copie exacte de toutes les lignes de la facture originale'}
              </p>
            </div>
          </label>

          {/* Éditeur de lignes — même composant que le formulaire de facture */}
          {customLines && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <LineItemsEditor
                lines={lines}
                onChange={setLines}
                clientId={invoice.clientId}
              />
              <TotalsPanel
                lines={lines}
                globalDiscountType={globalDiscountType}
                globalDiscountValue={globalDiscountValue}
                onGlobalDiscountTypeChange={setGlobalDiscountType}
                onGlobalDiscountValueChange={setGlobalDiscountValue}
              />
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────── */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          background: 'var(--surface)',
        }}>
          <button type="button" onClick={handleClose}
            style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            Annuler
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 20px', borderRadius: 'var(--radius-md)',
              background: '#7c3aed', color: '#fff', border: 'none',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.65,
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
              boxShadow: canSubmit ? '0 4px 12px rgba(124,58,237,0.3)' : 'none',
              transition: 'opacity 0.15s, box-shadow 0.15s',
            }}
          >
            {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <FileX size={14} />}
            Créer l'avoir
          </button>
        </div>
      </div>
    </>
  )
}
