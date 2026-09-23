'use client'

import { useState } from 'react'
import { OverlayPortal } from '@/components/ui/OverlayPortal'
import { X, Mail, Send, Loader2, Paperclip, CheckCheck } from 'lucide-react'

export interface SendEmailPayload {
  mode:     'send' | 'mark'   // 'send' = envoi réel ; 'mark' = marquer comme envoyé (hors app)
  to:       string
  cc:       string[]
  subject?: string
  message?: string
}

interface Props {
  title:           string          // ex. "Envoyer la facture"
  documentNumber:  string
  attachmentName:  string          // ex. "FAC-2026-047.pdf"
  defaultTo:       string          // email client
  defaultSubject:  string
  isPending:       boolean
  onSend:          (payload: SendEmailPayload) => void
  onClose:         () => void
}

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5,
  color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)',
  textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6,
}

export function SendEmailDrawer({ title, documentNumber, attachmentName, defaultTo, defaultSubject, isPending, onSend, onClose }: Props) {
  const [to, setTo]           = useState(defaultTo)
  const [cc, setCc]           = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [message, setMessage] = useState('')
  const [err, setErr]         = useState<string | null>(null)

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  function submit(mode: 'send' | 'mark') {
    setErr(null)
    let ccList: string[] = []
    if (mode === 'send') {
      // Validation seulement pour un envoi réel (le marquage n'envoie rien).
      if (!emailRe.test(to.trim())) { setErr('Adresse du destinataire invalide.'); return }
      ccList = cc.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
      const badCc = ccList.find(c => !emailRe.test(c))
      if (badCc) { setErr(`Adresse CC invalide : ${badCc}`); return }
    }
    onSend({
      mode,
      to: to.trim(),
      cc: ccList,
      subject: subject.trim() || undefined,
      // Corps optionnel : sauts de ligne → <br> (le backend attend du HTML léger).
      message: message.trim() ? message.trim().replace(/\n/g, '<br/>') : undefined,
    })
  }

  return (
    <OverlayPortal>
      <div aria-hidden onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)' }} />
      <div role="dialog" aria-modal="true" aria-label={title}
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(520px, 100vw)', zIndex: 301,
          background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
          overflowY: 'auto', boxShadow: '-8px 0 40px rgba(10,20,35,0.18)' }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg,#0f2d4a 0%,#2D7DD2 100%)', flexShrink: 0 }} />

        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(45,125,210,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Mail size={16} style={{ color: 'var(--primary)' }} />
            </span>
            <div>
              <h2 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '1px 0 0' }}>{documentNumber}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
          <div>
            <label style={lbl}>Destinataire</label>
            <input value={to} onChange={e => setTo(e.target.value)} placeholder="client@exemple.com" style={inp} />
          </div>
          <div>
            <label style={lbl}>CC (facultatif)</label>
            <input value={cc} onChange={e => setCc(e.target.value)} placeholder="séparées par des virgules" style={inp} />
          </div>
          <div>
            <label style={lbl}>Objet</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Message (facultatif)</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
              placeholder="Laissez vide pour utiliser le message par défaut."
              style={{ ...inp, resize: 'vertical', minHeight: 90, fontFamily: 'var(--font-body)' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <Paperclip size={14} style={{ color: 'var(--text-3)' }} />
            <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{attachmentName}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>joint automatiquement</span>
          </div>

          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
            💡 « Marquer comme envoyé » n'envoie aucun email — à utiliser si vous l'avez déjà transmis vous-même (WhatsApp, votre messagerie…).
          </p>

          {err && (
            <div role="alert" style={{ padding: '9px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.07)', border: '1.5px solid rgba(239,68,68,0.2)', color: '#dc2626', fontSize: 13 }}>{err}</div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '9px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Annuler</button>
          <button type="button" onClick={() => submit('mark')} disabled={isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: isPending ? 0.7 : 1 }}>
            <CheckCheck size={14} /> Marquer comme envoyé
          </button>
          <button type="button" onClick={() => submit('send')} disabled={isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: isPending ? 0.7 : 1 }}>
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Envoyer
          </button>
        </div>
      </div>
    </OverlayPortal>
  )
}
