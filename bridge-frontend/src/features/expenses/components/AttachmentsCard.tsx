'use client'

import { useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Trash2, Eye, Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { expensesApi } from '../api'
import { useUploadAttachment, useDeleteAttachment } from '../hooks'
import type { ExpenseAttachment } from '../types'

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp'
const MAX_BYTES = 5 * 1024 * 1024

const sectionH3: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)',
  letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0,
}

function isImage(name: string) {
  return /\.(jpe?g|png|webp)$/i.test(name)
}

export function AttachmentsCard({ expenseId, attachments, canEdit }: {
  expenseId:   string
  attachments: ExpenseAttachment[]
  canEdit:     boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const upload  = useUploadAttachment(expenseId)
  const remove  = useDeleteAttachment(expenseId)
  const [opening, setOpening] = useState<string | null>(null)

  async function handleView(a: ExpenseAttachment) {
    setOpening(a.filename)
    try {
      const url = await expensesApi.fetchAttachment(a.path)
      window.open(url, '_blank', 'noopener,noreferrer')
      // Laisse le temps à l'onglet de charger le blob avant de révoquer l'URL.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      toast.error('Impossible d\'ouvrir le justificatif')
    } finally {
      setOpening(null)
    }
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (file.size > MAX_BYTES) { toast.error('Justificatif trop volumineux (5 Mo maximum).'); return }
    upload.mutate(file)
  }

  const hasAny = attachments.length > 0

  return (
    <div className="card" style={{ padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={sectionH3}>Justificatifs</h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-display)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)' }}
          >
            {upload.isPending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {upload.isPending ? 'Ajout…' : 'Ajouter'}
          </button>
        )}
        <input ref={fileRef} type="file" accept={ACCEPT} onChange={handlePick} style={{ display: 'none' }} />
      </div>

      {!hasAny ? (
        <button
          type="button"
          onClick={() => canEdit && fileRef.current?.click()}
          disabled={!canEdit}
          style={{ width: '100%', textAlign: 'left', padding: '16px 18px', borderRadius: 'var(--radius-md)',
            border: `1.5px dashed var(--border)`, background: 'transparent',
            cursor: canEdit ? 'pointer' : 'default', color: 'var(--text-3)' }}
          onMouseEnter={e => { if (canEdit) e.currentTarget.style.borderColor = 'var(--primary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
            {canEdit ? 'Joindre la facture ou le reçu' : 'Aucun justificatif'}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 11.5 }}>
            {canEdit ? 'PDF, JPG, PNG ou WEBP — 5 Mo maximum' : 'Aucune pièce n\'a été jointe à cette dépense.'}
          </p>
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attachments.map(a => {
            const Icon = isImage(a.filename) ? ImageIcon : FileText
            return (
              <div key={a.filename}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <Icon size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--text-2)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.filename}
                </span>
                <button type="button" onClick={() => handleView(a)} disabled={opening === a.filename}
                  title="Ouvrir le justificatif"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8,
                    border: 'none', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {opening === a.filename ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Voir
                </button>
                {canEdit && (
                  <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending}
                    title="Supprimer le justificatif"
                    style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', borderRadius: 8,
                      border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}>
                    {remove.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
