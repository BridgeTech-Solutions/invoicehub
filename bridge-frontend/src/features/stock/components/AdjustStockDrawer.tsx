'use client'

import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { X, Package, AlertCircle, Loader2 } from 'lucide-react'
import { useAdjustStock } from '../hooks'
import type { AdjustStockPayload, StockMovementType } from '../types'

interface Props {
  productId:    string
  productName:  string
  currentQty:   number
  stockUnit?:   string | null
  onClose:      () => void
}

const MANUAL_TYPES: { value: AdjustStockPayload['type']; label: string }[] = [
  { value: 'purchase_receipt', label: 'Réception achat'   },
  { value: 'adjustment_in',    label: 'Ajustement entrée' },
  { value: 'adjustment_out',   label: 'Ajustement sortie' },
  { value: 'initial_stock',    label: 'Stock initial'     },
  { value: 'return_customer',  label: 'Retour client'     },
  { value: 'return_supplier',  label: 'Retour fournisseur'},
  { value: 'write_off',        label: 'Mise au rebut'     },
]

const EXIT_TYPES = new Set(['adjustment_out', 'write_off', 'return_supplier'])

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
          fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '1px 5px',
        }}>
          optionnel
        </span>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: 13.5,
  border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)',
  background: 'var(--bg)', color: 'var(--text-1)',
  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}

export function AdjustStockDrawer({ productId, productName, currentQty, stockUnit, onClose }: Props) {
  const drawerRef  = useRef<HTMLDivElement>(null)
  const firstInput = useRef<HTMLSelectElement>(null)
  const mutation   = useAdjustStock()
  const typeId     = useId()
  const qtyId      = useId()
  const costId     = useId()
  const notesId    = useId()
  const locId      = useId()

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

  const [form, setForm] = useState<{
    type:        AdjustStockPayload['type']
    quantity:    string
    unitCostHt:  string
    notes:       string
    location:    string
  }>({
    type:       'purchase_receipt',
    quantity:   '',
    unitCostHt: '',
    notes:      '',
    location:   '',
  })

  const [error, setError] = useState<string | null>(null)

  // Focus trap
  useEffect(() => {
    firstInput.current?.focus()
    const prev = document.activeElement as HTMLElement | null
    return () => prev?.focus()
  }, [])

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

  const isExit     = EXIT_TYPES.has(form.type)
  const needsCost  = ['purchase_receipt', 'initial_stock'].includes(form.type)
  const qty        = parseFloat(form.quantity) || 0
  const previewQty = currentQty + (isExit ? -qty : qty)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.quantity || qty <= 0) { setError('La quantité doit être supérieure à 0'); return }
    if (form.notes.trim().length < 5) { setError('La note est obligatoire (5 caractères minimum)'); return }

    const payload: AdjustStockPayload = {
      productId,
      quantity:   qty,
      type:       form.type,
      notes:      form.notes.trim(),
      unitCostHt: form.unitCostHt ? parseFloat(form.unitCostHt) : null,
      location:   form.location.trim() || null,
    }

    try {
      await mutation.mutateAsync(payload)
      handleClose()
    } catch {
      // error shown via toast in hook
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)',
          opacity: isVisible ? 1 : 0, transition: 'opacity 0.28s ease',
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ajustement de stock"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(440px, 100vw)', zIndex: 301,
          background: 'var(--surface)', borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 40px rgba(10,20,35,0.18), -2px 0 8px rgba(10,20,35,0.08)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Navy → primary gradient stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#0f2d4a 0%,#2D7DD2 100%)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(45,125,210,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden>
              <Package size={16} style={{ color: 'var(--primary)' }} />
            </span>
            <div>
              <h2 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
                Ajustement de stock
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{productName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fermer"
            style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Current stock info */}
        <div style={{ margin: '16px 24px', padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg)', border: '1.5px solid var(--border)' }}>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>Stock actuel</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
            {currentQty} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)' }}>{stockUnit ?? 'unités'}</span>
          </p>
          {qty > 0 && (
            <p style={{ fontSize: 12, color: isExit ? '#dc2626' : '#16a34a', marginTop: 6, fontWeight: 500 }}>
              → Après ajustement : {previewQty} {stockUnit ?? 'unités'}
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Type */}
          <div>
            <FieldLabel><label htmlFor={typeId}>Type de mouvement</label></FieldLabel>
            <select
              id={typeId}
              ref={firstInput}
              value={form.type}
              onChange={(e) => setForm(f => ({ ...f, type: e.target.value as AdjustStockPayload['type'] }))}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {MANUAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Quantité */}
          <div>
            <FieldLabel><label htmlFor={qtyId}>Quantité</label></FieldLabel>
            <input
              id={qtyId}
              type="number"
              min={0.001}
              step="any"
              placeholder="0"
              value={form.quantity}
              onChange={(e) => setForm(f => ({ ...f, quantity: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Coût unitaire (si entrée achat / initial) */}
          {needsCost && (
            <div>
              <FieldLabel optional><label htmlFor={costId}>Coût unitaire HT (FCFA)</label></FieldLabel>
              <input
                id={costId}
                type="number"
                min={0}
                step="any"
                placeholder="0"
                value={form.unitCostHt}
                onChange={(e) => setForm(f => ({ ...f, unitCostHt: e.target.value }))}
                style={inputStyle}
              />
            </div>
          )}

          {/* Emplacement */}
          <div>
            <FieldLabel optional><label htmlFor={locId}>Emplacement</label></FieldLabel>
            <input
              id={locId}
              type="text"
              placeholder="Ex. Entrepôt A, Étagère 3..."
              maxLength={100}
              value={form.location}
              onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Notes */}
          <div>
            <FieldLabel><label htmlFor={notesId}>Note explicative</label></FieldLabel>
            <textarea
              id={notesId}
              rows={3}
              placeholder="Décrivez la raison de cet ajustement (min. 5 caractères)..."
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
            />
          </div>

          {/* Erreur */}
          {error && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.07)', border: '1.5px solid rgba(239,68,68,0.2)', color: '#dc2626', fontSize: 13 }}>
              <AlertCircle size={14} aria-hidden />
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={handleClose}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer',
                fontFamily: 'var(--font-display)', fontWeight: 500,
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{
                flex: 2, padding: '10px 0', borderRadius: 'var(--radius-md)',
                background: 'var(--primary)', color: '#fff',
                border: 'none', fontSize: 13.5, cursor: mutation.isPending ? 'wait' : 'pointer',
                fontFamily: 'var(--font-display)', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                boxShadow: '0 4px 12px rgba(45,125,210,0.3)',
                opacity: mutation.isPending ? 0.8 : 1,
              }}
            >
              {mutation.isPending && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
