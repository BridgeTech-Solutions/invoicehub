'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'
import { useAccounts } from '../hooks'
import type { AccountListItem, AccountClass } from '../types'

interface Props {
  value:       string | null
  onChange:    (account: AccountListItem | null) => void
  placeholder?: string
  filterClass?: AccountClass[]
  leafOnly?:   boolean
  disabled?:   boolean
  label?:      string
  required?:   boolean
  error?:      string
}

const TYPE_LABEL: Record<string, string> = {
  asset: 'Actif', liability: 'Passif', equity: 'Capitaux', revenue: 'Produit', expense: 'Charge',
}

export function AccountPicker({
  value, onChange, placeholder = 'Rechercher un compte…',
  filterClass, leafOnly, disabled, label, required, error,
}: Props) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const { data: accounts = [] } = useAccounts()

  const filtered = accounts.filter(a => {
    if (filterClass && !filterClass.includes(a.class as AccountClass)) return false
    if (leafOnly && !a.isLeaf) return false
    if (!a.isActive) return false
    if (search) {
      const s = search.toLowerCase()
      return a.number.includes(s) || a.name.toLowerCase().includes(s)
    }
    return true
  })

  const selected = accounts.find(a => a.id === value) ?? null

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const triggerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, width: '100%', minHeight: 38, padding: '0 10px',
    border: `1.5px solid ${error ? 'var(--s-overdue)' : open ? 'var(--primary)' : 'var(--border-strong)'}`,
    borderRadius: 'var(--radius-md)', background: disabled ? 'var(--surface-2)' : 'var(--surface)',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    transition: 'border-color 0.15s',
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {label && (
        <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
          {label}{required && <span style={{ color: 'var(--s-overdue)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <button type="button" style={triggerStyle} disabled={disabled} onClick={() => !disabled && setOpen(v => !v)}>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 13.5, color: selected ? 'var(--text-1)' : 'var(--text-3)', fontFamily: selected ? 'var(--font-mono)' : 'var(--font-body)' }}>
          {selected ? `${selected.number} · ${selected.name}` : placeholder}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {selected && (
            <span
              role="button" tabIndex={0}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 99, cursor: 'pointer', color: 'var(--text-3)' }}
              onClick={e => { e.stopPropagation(); onChange(null) }}
              onKeyDown={e => e.key === 'Enter' && onChange(null)}
              aria-label="Effacer la sélection"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} style={{ color: 'var(--text-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </div>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)', maxHeight: 280, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            <input
              autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Numéro ou intitulé…"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, background: 'transparent', color: 'var(--text-1)' }}
            />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 220 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>Aucun compte trouvé</div>
            ) : (
              filtered.map(account => (
                <button
                  key={account.id} type="button"
                  onClick={() => { onChange(account); setOpen(false); setSearch('') }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '8px 14px', border: 'none',
                    background: account.id === value ? 'var(--primary-light)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', gap: 12,
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (account.id !== value) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = account.id === value ? 'var(--primary-light)' : 'transparent' }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--primary)', minWidth: 48 }}>{account.number}</span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{account.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>{TYPE_LABEL[account.type]}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {error && <p style={{ marginTop: 4, fontSize: 12, color: 'var(--s-overdue)' }}>{error}</p>}
    </div>
  )
}
