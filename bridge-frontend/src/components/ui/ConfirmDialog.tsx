'use client'

import { useEffect, useState, useCallback } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { OverlayPortal } from './OverlayPortal'

type Tone = 'default' | 'danger' | 'warning'

interface Props {
  open:         boolean
  title:        string
  message:      React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?:        Tone
  busy?:        boolean
  onConfirm:    () => void
  onCancel:     () => void
}

const TONE: Record<Tone, { accent: string; icon: string; iconBg: string }> = {
  default: { accent: 'var(--primary)', icon: 'var(--primary)',            iconBg: 'rgba(45,125,210,0.10)' },
  warning: { accent: '#d97706',        icon: '#d97706',                    iconBg: 'rgba(217,119,6,0.10)' },
  danger:  { accent: 'var(--s-overdue, #dc2626)', icon: 'var(--s-overdue, #dc2626)', iconBg: 'rgba(220,38,38,0.10)' },
}

/**
 * ConfirmDialog — confirmation modale cohérente (remplace window.confirm()).
 * Bloque la confirmation pendant `busy`. Ferme sur Échap / clic backdrop (sauf busy).
 */
export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler',
  tone = 'default', busy = false, onConfirm, onCancel,
}: Props) {
  const [visible, setVisible] = useState(false)
  const t = TONE[tone]

  useEffect(() => { if (open) setVisible(true) }, [open])

  const close = useCallback(() => { if (busy) return; setVisible(false); setTimeout(onCancel, 200) }, [busy, onCancel])

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, close])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open && !visible) return null

  return (
    <OverlayPortal>
      <div onClick={close}
        style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)', opacity: visible ? 1 : 0, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
          style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: 'var(--radius-md)', boxShadow: '0 24px 60px rgba(10,20,35,0.28)', transform: visible ? 'scale(1)' : 'scale(0.96)', opacity: visible ? 1 : 0, transition: 'transform 0.2s var(--ease-smooth), opacity 0.2s', overflow: 'hidden' }}>
          <div style={{ padding: '20px 22px 4px', display: 'flex', alignItems: 'flex-start', gap: 13 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: t.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={19} style={{ color: t.icon }} />
            </div>
            <div style={{ flex: 1, paddingTop: 2 }}>
              <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
            </div>
            <button onClick={close} disabled={busy} aria-label="Fermer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', cursor: busy ? 'default' : 'pointer', color: 'var(--text-3)', opacity: busy ? 0.5 : 1 }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: '6px 22px 20px 75px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
            {message}
          </div>

          <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={close} disabled={busy}
              style={{ height: 38, padding: '0 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'transparent', fontSize: 13.5, fontWeight: 500, color: 'var(--text-2)', cursor: busy ? 'default' : 'pointer' }}>
              {cancelLabel}
            </button>
            <button type="button" onClick={onConfirm} disabled={busy}
              style={{ height: 38, padding: '0 20px', borderRadius: 'var(--radius-md)', border: 'none', background: t.accent, fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--font-display)', opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Traitement…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  )
}
