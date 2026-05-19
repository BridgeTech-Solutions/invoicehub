'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { X, Package, Wrench, Plus, Save, ChevronRight } from 'lucide-react'
import { ProductForm } from './ProductForm'
import type { Product } from '../types'

interface ProductDrawerProps {
  product?: Product | null
  onClose: () => void
  initialName?: string
  onCreated?: (product: Product) => void
}

export function ProductDrawer({ product, onClose, initialName, onCreated }: ProductDrawerProps) {
  const isEdit   = !!product
  const formId   = useId()
  const titleId  = useId()

  const [isVisible,  setIsVisible]  = useState(false)
  const [isPending,  setIsPending]  = useState(false)
  const [formType,   setFormType]   = useState<'service' | 'product'>(product?.type ?? 'service')

  // Slide-in on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  const handleCreated = useCallback((p: Product) => {
    onCreated?.(p)
    handleClose()
  }, [onCreated, handleClose])

  // Sync form type changes for header icon
  // We read a data attribute set by ProductForm on change (simple hack-free approach via callback)
  // The type icon in header defaults to current product type or 'service' for new
  const TypeIcon = formType === 'product' ? Package : Wrench

  const typeLabel = formType === 'product' ? 'Produit physique' : 'Prestation / Service'

  return (
    <>
      {/* ── Backdrop ─────────────────────────────────────────── */}
      <div
        onClick={handleClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(10, 20, 35, 0.45)',
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
          width: '100%', maxWidth: 520,
          background: 'var(--surface)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(10, 20, 35, 0.18), -2px 0 8px rgba(10, 20, 35, 0.08)',
          borderLeft: '1px solid var(--border)',
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.30s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Navy → primary gradient stripe */}
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #0f2d4a 0%, #2D7DD2 100%)',
          flexShrink: 0,
        }} />

        {/* ── Header ───────────────────────────────────────── */}
        <div style={{
          padding: '18px 24px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {/* Icon dynamique selon le type */}
                <div style={{
                  width: 34, height: 34, borderRadius: 'var(--radius-sm)',
                  background: 'var(--primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'background 0.2s',
                }}>
                  <TypeIcon size={16} style={{ color: 'var(--primary)' }} strokeWidth={1.8} />
                </div>

                <div>
                  <h2 id={titleId} style={{
                    fontSize: 15, fontWeight: 700, color: 'var(--text-1)',
                    fontFamily: 'var(--font-display)', margin: 0, lineHeight: 1.2,
                  }}>
                    {isEdit ? 'Modifier le produit' : 'Nouveau produit'}
                  </h2>
                  {isEdit && (
                    <p style={{
                      fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0',
                      fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: 300,
                    }}>
                      {product.name}
                    </p>
                  )}
                </div>
              </div>

              {/* Type badge */}
              <div style={{ paddingLeft: 44 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 9px', borderRadius: 99,
                  fontSize: 11, fontWeight: 600,
                  fontFamily: 'var(--font-display)',
                  background: 'var(--primary-light)',
                  color: 'var(--primary)',
                  transition: 'all 0.2s',
                }}>
                  <TypeIcon size={10} />
                  {typeLabel}
                </span>
              </div>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Fermer le panneau"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0,
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--surface-2)'
                e.currentTarget.style.color = 'var(--text-1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-3)'
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ──────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
          <ProductForm
            product={product ?? undefined}
            initialName={initialName}
            formId={formId}
            hideActions
            onClose={handleClose}
            onCreated={handleCreated}
            onPendingChange={setIsPending}
          />

          {/*
            Listener invisible pour synchroniser l'icône du header avec le type choisi dans le form.
            ProductForm émet un event personnalisé 'product-type-change' sur document.
          */}
        </div>

        {/* ── Footer fixe ──────────────────────────────────── */}
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '14px 24px',
          background: 'var(--surface)',
          flexShrink: 0,
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          alignItems: 'center',
        }}>
          {/* Hint discret */}
          <span style={{
            fontSize: 11.5, color: 'var(--text-3)',
            fontFamily: 'var(--font-body)', marginRight: 'auto',
          }}>
            {isEdit ? 'Modification en cours' : 'Nouveau catalogue'}
          </span>

          <button
            type="button"
            onClick={handleClose}
            style={{
              padding: '9px 18px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-2)', fontSize: 13.5,
              fontFamily: 'var(--font-display)', fontWeight: 500,
              cursor: 'pointer',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--text-3)'
              e.currentTarget.style.color = 'var(--text-1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-2)'
            }}
          >
            Annuler
          </button>

          <button
            type="submit"
            form={formId}
            disabled={isPending}
            aria-disabled={isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 20px',
              borderRadius: 'var(--radius-md)',
              background: isPending ? 'var(--border-strong)' : 'var(--primary)',
              color: '#fff', border: 'none',
              cursor: isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
              boxShadow: isPending ? 'none' : '0 4px 14px rgba(45,125,210,0.3)',
              opacity: isPending ? 0.75 : 1,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              if (!isPending) e.currentTarget.style.boxShadow = '0 4px 20px rgba(45,125,210,0.5)'
            }}
            onMouseLeave={e => {
              if (!isPending) e.currentTarget.style.boxShadow = '0 4px 14px rgba(45,125,210,0.3)'
            }}
          >
            {isPending ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ animation: 'spin 0.8s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : isEdit ? (
              <Save size={14} />
            ) : (
              <Plus size={14} strokeWidth={2.5} />
            )}
            {isPending
              ? (isEdit ? 'Enregistrement…' : 'Création…')
              : isEdit
              ? 'Enregistrer'
              : 'Créer le produit'}
            {!isPending && <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
