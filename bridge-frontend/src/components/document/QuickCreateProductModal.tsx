'use client'

/**
 * QuickCreateProductModal
 * Modal contextuel "Créer un produit / service" déclenché depuis la saisie
 * de lignes (LineItemsEditor). Le produit créé est auto-sélectionné dans la ligne.
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Zap } from 'lucide-react'
import { ProductForm } from '@/features/products/components/ProductForm'
import type { Product } from '@/features/products/types'

interface QuickCreateProductModalProps {
  open: boolean
  initialName?: string
  onClose: () => void
  onCreated: (product: Product) => void
}

export function QuickCreateProductModal({
  open,
  initialName,
  onClose,
  onCreated,
}: QuickCreateProductModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // ── Focus trap + Escape ──────────────────────────────────────
  useEffect(() => {
    if (!open) return

    // Focus premier élément interactif dans le panel
    const timer = setTimeout(() => {
      const firstInput = panelRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button'
      )
      firstInput?.focus()
    }, 60)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }

      // Tab trap
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null)
        if (!focusable.length) return
        const first = focusable[0]
        const last  = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => { clearTimeout(timer); document.removeEventListener('keydown', onKeyDown, true) }
  }, [open, onClose])

  // ── Lock body scroll ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Créer un nouveau produit ou service"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15, 45, 74, 0.45)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          maxHeight: 'calc(100vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface)',
          borderRadius: 14,
          boxShadow: '0 32px 80px rgba(15,45,74,0.22), 0 8px 24px rgba(15,45,74,0.12)',
          overflow: 'hidden',
          animation: 'qcpm-in 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <style>{`
          @keyframes qcpm-in {
            from { opacity: 0; transform: translateY(12px) scale(0.98); }
            to   { opacity: 1; transform: translateY(0)   scale(1);    }
          }
        `}</style>

        {/* ── Header ── */}
        <div style={{
          flexShrink: 0,
          padding: '18px 20px 16px',
          background: 'linear-gradient(135deg, #0f2d4a 0%, #1c4570 100%)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
        }}>
          <div style={{
            width: 38, height: 38,
            borderRadius: 10,
            background: 'rgba(45,125,210,0.3)',
            border: '1.5px solid rgba(45,125,210,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Zap size={18} aria-hidden="true" style={{ color: '#7ec8f5' }} />
          </div>

          <div style={{ flex: 1 }}>
            <h2 style={{
              fontSize: 15.5,
              fontWeight: 700,
              color: '#fff',
              fontFamily: 'var(--font-display)',
              margin: 0,
              letterSpacing: '-0.01em',
            }}>
              Nouveau produit / service
            </h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '3px 0 0' }}>
              {initialName
                ? <>Créer <strong style={{ color: 'rgba(255,255,255,0.85)' }}>«&nbsp;{initialName}&nbsp;»</strong> et l'ajouter à cette ligne</>
                : 'Sera ajouté au catalogue et sélectionné dans cette ligne'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 32, height: 32,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.16)'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        {/* ── Body (scrollable) ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 20px 24px',
        }}>
          <ProductForm
            initialName={initialName}
            onClose={onClose}
            onCreated={onCreated}
          />
        </div>
      </div>
    </div>
  )

  return typeof window !== 'undefined' ? createPortal(modal, document.body) : null
}
