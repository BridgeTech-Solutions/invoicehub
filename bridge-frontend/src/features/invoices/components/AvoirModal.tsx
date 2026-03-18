'use client'

import { useState } from 'react'
import { Loader2, FileX, X, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { useCreateAvoir } from '../hooks'
import type { Invoice, CreateInvoiceLinePayload } from '../types'
import { makeBlankLine, lineToFormLine } from '@/lib/document-math'
import { formatXAF } from '@/lib/utils'

interface AvoirModalProps {
  invoice: Invoice
  onClose: () => void
}

export function AvoirModal({ invoice, onClose }: AvoirModalProps) {
  const [reason,      setReason]      = useState('')
  const [notes,       setNotes]       = useState('')
  const [dueDate,     setDueDate]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [customLines, setCustomLines] = useState(false)
  const [lines, setLines]             = useState<ReturnType<typeof lineToFormLine>[]>(
    invoice.lines.map(lineToFormLine)
  )

  const mutation = useCreateAvoir()

  const inputCss: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
  }

  const handleSubmit = () => {
    mutation.mutate({
      id: invoice.id,
      data: {
        reason,
        notes: notes || undefined,
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
    }, { onSuccess: onClose })
  }

  const updateLine = (idx: number, field: string, value: string | number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  const addLine = () => {
    setLines(prev => [...prev, lineToFormLine({ ...makeBlankLine(prev.length), id: crypto.randomUUID() } as any)])
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px', overflowY: 'auto' }}>
      <div className="card" style={{ width: '100%', maxWidth: 600, padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 className="font-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              Créer un avoir
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '3px 0 0' }}>
              Facture {invoice.number} — {invoice.client.name} — {formatXAF(Number(invoice.totalTtc))}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Reason (required) */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
              Motif <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text" value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Remboursement partiel, erreur de facturation…"
              style={inputCss}
            />
          </div>

          {/* Due date + Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
                Date d'échéance
              </label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputCss} />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
                Notes
              </label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optionnel…" style={inputCss} />
            </div>
          </div>

          {/* Custom lines toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox" id="customLines" checked={customLines}
              onChange={(e) => setCustomLines(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
            <label htmlFor="customLines" style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
              Personnaliser les lignes de l'avoir (sinon: copie de la facture originale)
            </label>
          </div>

          {/* Custom lines editor */}
          {customLines && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--surface)' }}>
                    {['Désignation', 'Qté', 'P.U. HT', ''].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-3)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={line._localId} style={{ borderBottom: idx < lines.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <input
                          type="text" value={line.designation}
                          onChange={(e) => updateLine(idx, 'designation', e.target.value)}
                          style={{ ...inputCss, padding: '6px 8px', fontSize: 12.5 }}
                        />
                      </td>
                      <td style={{ padding: '8px 10px', width: 70 }}>
                        <input
                          type="number" min="0.01" step="0.01" value={line.quantity}
                          onChange={(e) => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          style={{ ...inputCss, padding: '6px 8px', fontSize: 12.5, fontFamily: 'var(--font-mono)' }}
                        />
                      </td>
                      <td style={{ padding: '8px 10px', width: 110 }}>
                        <input
                          type="number" min="0" step="1" value={line.unitPriceHt}
                          onChange={(e) => updateLine(idx, 'unitPriceHt', parseFloat(e.target.value) || 0)}
                          style={{ ...inputCss, padding: '6px 8px', fontSize: 12.5, fontFamily: 'var(--font-mono)' }}
                        />
                      </td>
                      <td style={{ padding: '8px 10px', width: 36 }}>
                        <button type="button" onClick={() => removeLine(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
                <button type="button" onClick={addLine}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 600, padding: 0 }}>
                  <Plus size={13} /> Ajouter une ligne
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            Annuler
          </button>
          <button
            type="button"
            disabled={!reason.trim() || mutation.isPending || (customLines && lines.length === 0)}
            onClick={handleSubmit}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 'var(--radius-md)',
              background: '#7c3aed', color: '#fff', border: 'none',
              cursor: (!reason.trim() || mutation.isPending) ? 'not-allowed' : 'pointer',
              opacity: (!reason.trim() || mutation.isPending) ? 0.7 : 1,
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
              boxShadow: reason.trim() ? '0 4px 12px rgba(124,58,237,0.3)' : 'none',
            }}
          >
            {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <FileX size={14} />}
            Créer l'avoir
          </button>
        </div>
      </div>
    </div>
  )
}
