'use client'

import { OverlayPortal } from '@/components/ui/OverlayPortal'

import { useState, useEffect, useCallback, useId, useMemo } from 'react'
import { Loader2, PackageCheck, X, Check, ListChecks } from 'lucide-react'
import { format } from 'date-fns'
import { useCurrency } from '@/hooks/useCurrency'
import type { PurchaseOrder } from '../types'

interface ReceiveDrawerProps {
  po: PurchaseOrder
  isPending: boolean
  onClose: () => void
  onConfirm: (data: {
    lines: { lineId: string; quantityReceived: number }[]
    receivedDate: string
    notes: string | null
  }) => void
}

const num = (v: number) => Number(v) || 0

export function ReceiveDrawer({ po, isPending, onClose, onConfirm }: ReceiveDrawerProps) {
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

  // ── Per-line state ────────────────────────────────────────────
  // remaining(line) = quantityOrdered - quantityReceived
  const remainingOf = useCallback(
    (lineId: string) => {
      const l = po.lines.find(x => x.id === lineId)
      return l ? Math.max(0, num(l.quantityOrdered) - num(l.quantityReceived)) : 0
    },
    [po.lines],
  )

  // qty saisie pour CETTE réception, par ligne — pré-rempli avec le restant
  const [qty, setQty] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const l of po.lines) init[l.id] = Math.max(0, num(l.quantityOrdered) - num(l.quantityReceived))
    return init
  })
  const [receivedDate, setReceivedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes]               = useState('')

  const setLineQty = (lineId: string, raw: string) => {
    const max = remainingOf(lineId)
    let v = raw === '' ? 0 : parseFloat(raw)
    if (Number.isNaN(v) || v < 0) v = 0
    if (v > max) v = max // garde-fou : jamais plus que le restant
    setQty(prev => ({ ...prev, [lineId]: v }))
  }

  const fillAll  = () => {
    const next: Record<string, number> = {}
    for (const l of po.lines) next[l.id] = remainingOf(l.id)
    setQty(next)
  }
  const clearAll = () => {
    const next: Record<string, number> = {}
    for (const l of po.lines) next[l.id] = 0
    setQty(next)
  }

  const totals = useMemo(() => {
    let unitsToReceive = 0
    let linesTouched   = 0
    for (const l of po.lines) {
      const v = qty[l.id] ?? 0
      if (v > 0) { unitsToReceive += v; linesTouched += 1 }
    }
    return { unitsToReceive, linesTouched }
  }, [qty, po.lines])

  const canSubmit = totals.linesTouched > 0 && !isPending

  const handleSubmit = () => {
    const lines = po.lines
      .map(l => ({ lineId: l.id, quantityReceived: qty[l.id] ?? 0 }))
      .filter(l => l.quantityReceived > 0)
    if (lines.length === 0) return
    onConfirm({ lines, receivedDate, notes: notes.trim() || null })
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
    (e.target as HTMLElement).style.borderColor = '#16a34a';
    (e.target as HTMLElement).style.boxShadow   = '0 0 0 3px rgba(22,163,74,0.15)'
  }
  const focusOff = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = 'var(--border)';
    (e.target as HTMLElement).style.boxShadow   = 'none'
  }

  return (
    <OverlayPortal>
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
          width: '100%', maxWidth: 640,
          background: 'var(--surface)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(10,20,35,0.18), -2px 0 8px rgba(10,20,35,0.08)',
          borderLeft: '1px solid var(--border)',
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Gradient stripe — vert pour la réception (stock entrant) */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#15803d 0%,#16a34a 50%,#4ade80 100%)', flexShrink: 0 }} />

        {/* ── Header ───────────────────────────────────────── */}
        <div style={{ padding: '18px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 'var(--radius-sm)',
                background: 'rgba(22,163,74,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <PackageCheck size={16} style={{ color: '#16a34a' }} strokeWidth={1.8} />
              </div>
              <div>
                <h2 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0, lineHeight: 1.2 }}>
                  Enregistrer une réception
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
                  {po.number} · {po.supplier.name} · {formatCurrency(num(po.totalTtc))}
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

          {/* Date + Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
                Date de réception
              </label>
              <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)}
                style={inputCss} onFocus={focusOn} onBlur={focusOff} />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
                Notes
              </label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Bon de livraison, observations…"
                style={inputCss} onFocus={focusOn} onBlur={focusOff} />
            </div>
          </div>

          {/* Lignes — en-tête + actions rapides */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Quantités reçues
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={fillAll}
                style={quickBtn}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(22,163,74,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <ListChecks size={12} /> Tout recevoir
              </button>
              <button type="button" onClick={clearAll}
                style={quickBtn}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                Vider
              </button>
            </div>
          </div>

          {/* Liste des lignes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {po.lines.map(line => {
              const ordered   = num(line.quantityOrdered)
              const received  = num(line.quantityReceived)
              const remaining = Math.max(0, ordered - received)
              const done      = remaining === 0
              const value     = qty[line.id] ?? 0

              return (
                <div key={line.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 14px', borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${done ? 'var(--border)' : value > 0 ? 'rgba(22,163,74,0.35)' : 'var(--border)'}`,
                  background: done ? 'var(--surface-2)' : value > 0 ? 'rgba(22,163,74,0.04)' : 'var(--surface)',
                  opacity: done ? 0.7 : 1,
                  transition: 'all 0.15s',
                }}>
                  {/* Désignation + détail commandé/reçu */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {line.designation}
                    </p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 0', fontFamily: 'var(--font-mono)' }}>
                      Cmd {ordered} {line.unit} · reçu {received} · <span style={{ color: done ? '#16a34a' : '#d97706', fontWeight: 700 }}>restant {remaining}</span>
                    </p>
                  </div>

                  {/* Input ou état "complet" */}
                  {done ? (
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 12, fontWeight: 700, color: '#16a34a',
                      fontFamily: 'var(--font-display)', flexShrink: 0,
                    }}>
                      <Check size={14} /> Complet
                    </span>
                  ) : (
                    <input
                      type="number" min={0} max={remaining} step="any"
                      value={value === 0 ? '' : value}
                      placeholder="0"
                      onChange={e => setLineQty(line.id, e.target.value)}
                      onFocus={focusOn} onBlur={focusOff}
                      style={{
                        width: 92, padding: '8px 10px', textAlign: 'right',
                        borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
                        background: 'var(--bg)', fontSize: 14, fontWeight: 700,
                        color: 'var(--text-1)', fontFamily: 'var(--font-mono)',
                        outline: 'none', boxSizing: 'border-box', flexShrink: 0,
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Récap */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderRadius: 'var(--radius-md)',
            background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)',
          }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              {totals.linesTouched > 0
                ? `${totals.linesTouched} ligne${totals.linesTouched > 1 ? 's' : ''} · ${totals.unitsToReceive} unité${totals.unitsToReceive > 1 ? 's' : ''} à réceptionner`
                : 'Aucune quantité saisie'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              réception partielle autorisée
            </span>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────── */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', gap: 10, justifyContent: 'flex-end', background: 'var(--surface)',
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
              background: '#16a34a', color: '#fff', border: 'none',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.65,
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
              boxShadow: canSubmit ? '0 4px 12px rgba(22,163,74,0.3)' : 'none',
              transition: 'opacity 0.15s, box-shadow 0.15s',
            }}
          >
            {isPending ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={14} />}
            Confirmer la réception
          </button>
        </div>
      </div>
    </>
    </OverlayPortal>
  )
}

const quickBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '5px 10px', borderRadius: 'var(--radius-sm)',
  border: '1.5px solid var(--border)', background: 'transparent',
  color: 'var(--text-2)', fontSize: 12, fontWeight: 600,
  fontFamily: 'var(--font-display)', cursor: 'pointer',
  transition: 'background 0.15s',
}
