'use client'

import { useState, useEffect, useCallback, useId, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Percent, BadgePercent, X, Loader2, AlertTriangle } from 'lucide-react'
import { useCreateAvoir } from '../hooks'
import type { Invoice, CreateInvoiceLinePayload } from '../types'
import { useCurrency } from '@/hooks/useCurrency'

const round2 = (n: number) => Math.round(n * 100) / 100

interface DiscountAvoirModalProps {
  invoice: Invoice
  onClose: () => void
}

/**
 * Remise accordée APRÈS émission. Conforme OHADA : on ne modifie pas la facture
 * (immuable), on émet un AVOIR partiel du montant de la remise.
 *  - Pourcentage : décline chaque ligne d'origine au prorata → TVA mixte exacte.
 *  - Montant fixe (TTC) : une seule ligne au taux de TVA choisi.
 */
export function DiscountAvoirModal({ invoice, onClose }: DiscountAvoirModalProps) {
  const { format: formatCurrency } = useCurrency()
  const titleId = useId()
  const [mounted, setMounted] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => { setMounted(true) }, [])
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
    setTimeout(onClose, 200)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleClose])

  // Taux de TVA prédominant (ligne au plus gros HT) → défaut pour le mode montant
  const predominantRate = useMemo(() => {
    let best = invoice.lines[0]?.taxRate ?? 19.25
    let bestHt = -1
    for (const l of invoice.lines) {
      if (Number(l.netHt) > bestHt) { bestHt = Number(l.netHt); best = Number(l.taxRate) }
    }
    return best
  }, [invoice.lines])

  const [mode,   setMode]   = useState<'percent' | 'amount'>('percent')
  const [pct,    setPct]    = useState(5)
  const [amount, setAmount] = useState(0)
  const [rate,   setRate]   = useState(predominantRate)
  const [reason, setReason] = useState('Remise commerciale accordée après émission')

  const mutation = useCreateAvoir()

  // ── Lignes de l'avoir + aperçu ───────────────────────────────────
  const { lines, previewHt, previewTva, previewTtc, error } = useMemo(() => {
    const totalTtc = Number(invoice.totalTtc)
    const balance  = Number(invoice.balanceDue)

    if (mode === 'percent') {
      if (!(pct > 0)) return { lines: [], previewHt: 0, previewTva: 0, previewTtc: 0, error: 'Indiquez un pourcentage.' }
      if (pct > 100)  return { lines: [], previewHt: 0, previewTva: 0, previewTtc: 0, error: 'Le pourcentage ne peut pas dépasser 100 %.' }
      const ls: CreateInvoiceLinePayload[] = invoice.lines
        .map((l, i) => {
          const ht = round2(Number(l.netHt) * pct / 100)
          return { sortOrder: i, designation: `Remise — ${l.designation}`, unit: l.unit, quantity: 1, unitPriceHt: ht, discountType: 'none' as const, taxRate: Number(l.taxRate) }
        })
        .filter(l => l.unitPriceHt > 0)
      const ht  = ls.reduce((s, l) => s + l.unitPriceHt, 0)
      const tva = round2(ls.reduce((s, l) => s + l.unitPriceHt * (l.taxRate ?? 0) / 100, 0))
      return { lines: ls, previewHt: round2(ht), previewTva: tva, previewTtc: round2(ht + tva), error: ls.length === 0 ? 'Aucune ligne à remiser.' : null }
    }

    // mode montant fixe (TTC saisi)
    if (!(amount > 0)) return { lines: [], previewHt: 0, previewTva: 0, previewTtc: 0, error: 'Indiquez un montant.' }
    if (amount > totalTtc + 0.01) return { lines: [], previewHt: 0, previewTva: 0, previewTtc: 0, error: `La remise dépasse le total de la facture (${formatCurrency(totalTtc)}).` }
    const ht  = round2(amount / (1 + rate / 100))
    const tva = round2(amount - ht)
    const ls: CreateInvoiceLinePayload[] = [
      { sortOrder: 0, designation: reason.trim() || 'Remise commerciale', unit: 'forfait', quantity: 1, unitPriceHt: ht, discountType: 'none', taxRate: rate },
    ]
    const overBalance = amount > balance + 0.01
    return { lines: ls, previewHt: ht, previewTva: tva, previewTtc: amount, error: overBalance ? `⚠ Remise (${formatCurrency(amount)}) supérieure au solde dû (${formatCurrency(balance)}) — un trop-perçu sera créé.` : null }
  }, [mode, pct, amount, rate, reason, invoice, formatCurrency])

  const blocking = !!error && !error.startsWith('⚠')
  const canSubmit = lines.length > 0 && !blocking && reason.trim().length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    mutation.mutate(
      { id: invoice.id, data: { reason: reason.trim(), lines } },
      { onSuccess: () => handleClose() },
    )
  }

  if (!mounted) return null

  const inputCss: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)', background: 'var(--surface)',
    fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none',
  }

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      onMouseDown={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,45,74,0.45)', opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.2s', padding: 20,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 500, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.98)',
          transition: 'transform 0.2s', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BadgePercent size={17} style={{ color: '#7c3aed' }} />
            </div>
            <div>
              <h2 id={titleId} style={{ margin: 0, fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Remise après émission</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>Facture {invoice.number} — un avoir sera généré</p>
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Note conformité */}
          <div style={{ display: 'flex', gap: 9, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.18)' }}>
            <AlertTriangle size={14} style={{ color: '#7c3aed', flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
              La facture émise reste inchangée (conformité OHADA). La remise est passée via un <strong>avoir</strong> qui réduit le solde dû du client.
            </p>
          </div>

          {/* Mode */}
          <div style={{ display: 'flex', gap: 8 }}>
            {([['percent', 'Pourcentage', Percent], ['amount', 'Montant fixe', BadgePercent]] as const).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  padding: '9px 12px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid', borderColor: mode === m ? 'var(--primary)' : 'var(--border)',
                  background: mode === m ? 'rgba(45,125,210,0.06)' : 'var(--surface)',
                  color: mode === m ? 'var(--primary)' : 'var(--text-2)',
                  cursor: 'pointer', fontSize: 13, fontWeight: mode === m ? 700 : 500, fontFamily: 'var(--font-display)',
                }}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {/* Inputs */}
          {mode === 'percent' ? (
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Remise (% du total de la facture)</span>
              <div style={{ position: 'relative' }}>
                <input type="number" min="0" max="100" step="0.5" value={pct} onChange={(e) => setPct(parseFloat(e.target.value) || 0)} style={inputCss} autoFocus />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 13 }}>%</span>
              </div>
            </label>
          ) : (
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Montant de la remise (TTC)</span>
                <input type="number" min="0" step="100" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} style={inputCss} autoFocus />
              </label>
              <label style={{ width: 110 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>TVA %</span>
                <input type="number" min="0" max="100" step="0.01" value={rate} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} style={inputCss} />
              </label>
            </div>
          )}

          {/* Motif */}
          <label style={{ display: 'block' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Motif de l&apos;avoir</span>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. Geste commercial négocié" style={inputCss} />
          </label>

          {/* Aperçu */}
          <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-3)', marginBottom: 4 }}>
              <span>Remise HT</span><span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(previewHt)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-3)', marginBottom: 6 }}>
              <span>TVA</span><span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(previewTva)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#7c3aed', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
              <span>Avoir TTC</span><span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(previewTtc)}</span>
            </div>
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 12.5, color: blocking ? '#ef4444' : '#d97706', display: 'flex', alignItems: 'center', gap: 6 }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={handleClose} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)' }}>
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || mutation.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 18px', borderRadius: 'var(--radius-md)', border: 'none',
              background: '#7c3aed', color: '#fff',
              cursor: !canSubmit || mutation.isPending ? 'not-allowed' : 'pointer',
              opacity: !canSubmit || mutation.isPending ? 0.6 : 1,
              fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)',
            }}
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Générer l&apos;avoir de remise
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
