'use client'

import { useState } from 'react'
import { Loader2, AlertTriangle, X } from 'lucide-react'
import { useCancelInvoice } from '../hooks'

interface CancelModalProps {
  invoiceId: string
  invoiceNumber: string
  onClose: () => void
}

export function CancelModal({ invoiceId, invoiceNumber, onClose }: CancelModalProps) {
  const [reason, setReason] = useState('')
  const mutation = useCancelInvoice()

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 440, padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={18} style={{ color: '#ef4444' }} />
            </div>
            <div>
              <h3 className="font-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                Annuler la facture
              </h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '2px 0 0' }}>{invoiceNumber}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Warning */}
        <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-1)', margin: 0, lineHeight: 1.5 }}>
            Cette action est <strong>irréversible</strong>. Un avoir sera <strong>généré automatiquement</strong> pour compenser la facture annulée.
          </p>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 10 }}>Motif d'annulation (optionnel)</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex: Annulation commande client, erreur de facturation…"
          rows={3}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
            border: '1.5px solid var(--border)', background: 'var(--bg)',
            fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
            outline: 'none', resize: 'vertical', lineHeight: 1.5, marginBottom: 16,
            boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--primary)' }}
          onBlur={(e)  => { e.target.style.borderColor = 'var(--border)' }}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            Retour
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ id: invoiceId, data: { reason: reason || undefined } }, { onSuccess: onClose })}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 'var(--radius-md)',
              background: '#ef4444', color: '#fff', border: 'none',
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
            }}
          >
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            Confirmer l'annulation
          </button>
        </div>
      </div>
    </div>
  )
}
