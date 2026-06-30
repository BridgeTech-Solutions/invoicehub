'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical, ChevronUp, ChevronDown, X, Loader2, ListRestart } from 'lucide-react'

export interface ReorderLine {
  id:          string
  designation: string
}

interface LineReorderModalProps {
  title?:     string
  subtitle?:  string
  lines:      ReorderLine[]
  isPending:  boolean
  onSave:     (lineIds: string[]) => void
  onClose:    () => void
}

/**
 * Modal de réordonnancement des lignes d'un document (facture / proforma).
 * Présentation pure : on ne renvoie que l'ordre des identifiants de lignes.
 * Deux moyens de réordonner (le glisser-déposer natif étant peu fiable selon
 * les navigateurs) : flèches ↑/↓ (toujours fiables) ET glisser-déposer.
 */
export function LineReorderModal({ title = 'Réordonner les lignes', subtitle, lines, isPending, onSave, onClose }: LineReorderModalProps) {
  const titleId = useId()
  const [mounted, setMounted] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [order, setOrder] = useState<ReorderLine[]>(lines)

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

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

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return
    const next = [...order]
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    setOrder(next)
  }

  const handleDrop = (target: number) => {
    if (dragIndex === null || dragIndex === target) { setDragIndex(null); setOverIndex(null); return }
    move(dragIndex, target)
    setDragIndex(null)
    setOverIndex(null)
  }

  const dirty = order.some((l, i) => l.id !== lines[i]?.id)

  if (!mounted) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,45,74,0.45)',
        opacity: isVisible ? 1 : 0, transition: 'opacity 0.2s',
        padding: 20,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.98)',
          transition: 'transform 0.2s',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ListRestart size={17} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h2 id={titleId} style={{ margin: 0, fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>{title}</h2>
              {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {order.map((line, i) => (
            <div
              key={line.id}
              onDragOver={(e) => { e.preventDefault(); setOverIndex(i) }}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: overIndex === i && dragIndex !== i ? 'rgba(45,125,210,0.06)' : 'var(--surface-2)',
                outline: overIndex === i && dragIndex !== i ? '2px solid var(--primary)' : 'none',
                outlineOffset: -2,
                opacity: dragIndex === i ? 0.4 : 1,
                transition: 'background 0.1s, opacity 0.15s',
              }}
            >
              <span
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); setDragIndex(i) }}
                title="Glisser pour déplacer"
                style={{ cursor: 'grab', color: 'var(--text-3)', display: 'flex', flexShrink: 0 }}
              >
                <GripVertical size={15} />
              </span>
              <span style={{ width: 22, textAlign: 'center', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {line.designation || <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>(sans désignation)</span>}
              </span>
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Monter"
                  style={{ background: 'none', border: 'none', cursor: i === 0 ? 'not-allowed' : 'pointer', color: i === 0 ? 'var(--border)' : 'var(--text-2)', display: 'flex', padding: 3, borderRadius: 4 }}>
                  <ChevronUp size={16} />
                </button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1} aria-label="Descendre"
                  style={{ background: 'none', border: 'none', cursor: i === order.length - 1 ? 'not-allowed' : 'pointer', color: i === order.length - 1 ? 'var(--border)' : 'var(--text-2)', display: 'flex', padding: 3, borderRadius: 4 }}>
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={handleClose} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)' }}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onSave(order.map(l => l.id))}
            disabled={isPending || !dirty}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 18px', borderRadius: 'var(--radius-md)', border: 'none',
              background: 'var(--primary)', color: '#fff',
              cursor: isPending || !dirty ? 'not-allowed' : 'pointer',
              opacity: isPending || !dirty ? 0.6 : 1,
              fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)',
            }}
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            Enregistrer l&apos;ordre
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
