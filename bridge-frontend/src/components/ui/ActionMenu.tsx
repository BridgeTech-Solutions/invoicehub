'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'

export interface ActionMenuItem {
  label:     string
  icon:      React.ElementType
  onClick:   () => void
  danger?:   boolean
  disabled?: boolean
  separator?: boolean
}

interface ActionMenuProps {
  items: ActionMenuItem[]
  width?: number
}

/**
 * Dropdown d'actions pour les lignes de tableau.
 *
 * Pourquoi le portail est NÉCESSAIRE :
 *   L'animation page-enter (.page-enter { animation: page-in 0.35s both }) applique
 *   transform:translateY(0) en fill-mode forward sur <main>. Tout transform sur un
 *   ancêtre crée un "containing block" pour position:fixed, ce qui décale le dropdown.
 *   Le portail sur document.body contourne ce problème car body n'a pas de transform.
 *
 * Pourquoi useLayoutEffect pour la position :
 *   Les mises à jour d'état dans useLayoutEffect sont flushées avant le paint.
 *   Le dropdown est invisible (pos=null) au premier render, puis visible au bon
 *   endroit au second render — sans flash visible par l'utilisateur.
 */
export function ActionMenu({ items, width = 200 }: ActionMenuProps) {
  const [open,    setOpen]  = useState(false)
  const [pos,     setPos]   = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const btnRef      = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Monter côté client uniquement (évite tout problème SSR/hydratation avec le portail)
  useEffect(() => { setMounted(true) }, [])

  // Calcul de position AVANT le paint (useLayoutEffect)
  // Ne dépend que de `open` : si open passe à true → calcule. Si false → reset.
  // Pas de risque de boucle infinie car setPos ne change pas `open`.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null)
      return
    }
    const rect       = btnRef.current.getBoundingClientRect()
    const dropH      = items.length * 38 + 16
    const spaceBelow = window.innerHeight - rect.bottom
    const flip       = spaceBelow < dropH + 8
    setPos({
      top:  flip ? rect.top - dropH : rect.bottom + 4,
      left: Math.max(4, rect.right - width),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpen((o) => !o)
  }

  // Reposition au scroll/resize pendant que le menu est ouvert
  useEffect(() => {
    if (!open || !btnRef.current) return
    const update = () => {
      if (!btnRef.current) return
      const rect       = btnRef.current.getBoundingClientRect()
      const dropH      = items.length * 38 + 16
      const spaceBelow = window.innerHeight - rect.bottom
      const flip       = spaceBelow < dropH + 8
      setPos({
        top:  flip ? rect.top - dropH : rect.bottom + 4,
        left: Math.max(4, rect.right - width),
      })
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, items.length, width])

  // Fermer sur clic extérieur
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return
      if (dropdownRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Fermer sur Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Le dropdown n'est rendu que lorsque la position est calculée (open ET pos définis)
  const dropdown = (open && pos) ? (
    <div
      style={{
        position:     'fixed',
        top:          pos.top,
        left:         pos.left,
        width,
        zIndex:       9999,
        background:   'var(--surface)',
        border:       '1.5px solid var(--border)',
        borderRadius: 10,
        boxShadow:    '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        padding:      '5px 0',
        overflow:     'hidden',
      }}
      ref={dropdownRef}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        const Icon = item.icon
        return (
          <div key={i}>
            {item.separator && (
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            )}
            <button
              type="button"
              disabled={item.disabled}
              onClick={() => { item.onClick(); setOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 14px',
                background: 'none', border: 'none',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                fontSize: 13, fontFamily: 'var(--font-body)',
                color: item.danger ? '#ef4444' : item.disabled ? 'var(--text-3)' : 'var(--text-1)',
                textAlign: 'left', transition: 'background 0.1s',
                opacity: item.disabled ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!item.disabled) e.currentTarget.style.background = item.danger
                  ? 'rgba(239,68,68,0.06)' : 'var(--surface-2)'
              }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <Icon size={13} strokeWidth={1.8} />
              {item.label}
            </button>
          </div>
        )
      })}
    </div>
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '5px 7px', borderRadius: 6, color: 'var(--text-3)',
          display: 'flex', alignItems: 'center', transition: 'background 0.1s, color 0.1s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-1)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-3)' }}
      >
        <MoreHorizontal size={15} />
      </button>

      {mounted ? createPortal(dropdown, document.body) : null}
    </>
  )
}
