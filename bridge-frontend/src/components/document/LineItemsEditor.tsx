'use client'

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, ChevronDown, Search, AlertCircle, GripVertical } from 'lucide-react'
import { useProducts } from '@/features/products/hooks'
import { useProductLineDefaults } from '@/features/products/hooks'
import type { FormLine, DiscountType } from '@/features/proformas/types'
import { computeLineValues, makeBlankLine } from '@/lib/document-math'
import { formatXAF } from '@/lib/utils'

// ─── Constants ─────────────────────────────────────────────────

const UNITS: { value: string; label: string }[] = [
  { value: 'forfait',  label: 'Forfait'  },
  { value: 'heure',    label: 'Heure'    },
  { value: 'jour',     label: 'Jour'     },
  { value: 'piece',    label: 'Pièce'    },
  { value: 'licence',  label: 'Licence'  },
  { value: 'mois',     label: 'Mois'     },
  { value: 'annee',    label: 'Année'    },
]

// ─── Types ─────────────────────────────────────────────────────

interface LineItemsEditorProps {
  lines: FormLine[]
  onChange: (lines: FormLine[]) => void
  clientId?: string
  disabled?: boolean
}

// ─── Product combobox for designation cell ──────────────────────

interface ProductComboProps {
  value: string
  onChange: (val: string) => void
  onSelect: (product: { name: string; description: string | null; unit: string; unitPriceHt: number; taxRateValue: number; id: string }) => void
  disabled?: boolean
}

function ProductCombo({ value, onChange, onSelect, disabled }: ProductComboProps) {
  const [open,    setOpen]    = useState(false)
  const [search,  setSearch]  = useState(value)
  const [pos,     setPos]     = useState<{ top: number; left: number; width: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const containerRef          = useRef<HTMLDivElement>(null)
  const dropdownRef           = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  const { data: productsData } = useProducts({ limit: 100, isActive: true })
  const products = productsData?.data ?? []

  const filtered = search.length >= 1
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.reference ?? '').toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8)
    : [...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6)

  // Sync external value changes
  useEffect(() => { setSearch(value) }, [value])

  // Calculate position before paint (portal needs fixed coords)
  useLayoutEffect(() => {
    if (!open || !containerRef.current) { setPos(null); return }
    const rect = containerRef.current.getBoundingClientRect()
    const dropH = filtered.length * 52 + 40
    const spaceBelow = window.innerHeight - rect.bottom
    const flip = spaceBelow < dropH + 8
    setPos({
      top:   flip ? rect.top - dropH : rect.bottom + 2,
      left:  rect.left,
      width: Math.max(300, rect.width),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close on outside click — excludes both container AND portal dropdown
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return
      if (dropdownRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const dropdown = (open && pos && filtered.length > 0 && !disabled) ? (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top:      pos.top,
        left:     pos.left,
        width:    pos.width,
        zIndex:   9999,
        background:   'var(--surface)',
        border:       '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow:    'var(--shadow-md)',
        maxHeight:    260,
        overflowY:    'auto',
      }}
    >
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Catalogue produits
        </span>
      </div>
      {filtered.map((p) => (
        <button
          key={p.id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect({
              id: p.id,
              name: p.name,
              description: p.description ?? null,
              unit: p.unit,
              unitPriceHt: p.unitPriceHt,
              taxRateValue: p.taxRateValue,
            })
            setSearch(p.name)
            setOpen(false)
          }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer',
            textAlign: 'left', borderBottom: '1px solid var(--border)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
              {p.name}
              {p.reference && (
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>
                  {p.reference}
                </span>
              )}
            </p>
            {p.categoryId && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                {p.type === 'service' ? 'Prestation' : 'Produit'}
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-mono)', margin: 0 }}>
              {new Intl.NumberFormat('fr-FR').format(p.unitPriceHt)} XAF
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
              / {UNITS.find(u => u.value === p.unit)?.label ?? p.unit}
            </p>
          </div>
        </button>
      ))}
    </div>
  ) : null

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <Search
          size={11}
          style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-3)', pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={search}
          disabled={disabled}
          placeholder="Désignation ou nom du produit…"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value)
            onChange(e.target.value)
            setOpen(true)
          }}
          style={{
            width: '100%', padding: '7px 8px 7px 24px',
            background: 'transparent', border: 'none', outline: 'none',
            fontSize: 13, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
          }}
        />
      </div>
      {mounted ? createPortal(dropdown, document.body) : null}
    </div>
  )
}

// ─── Price-change alert ─────────────────────────────────────────

function PriceChangeAlert({ productId, clientId, currentPrice }: {
  productId: string; clientId?: string; currentPrice: number
}) {
  const { data } = useProductLineDefaults(productId, clientId)
  if (!data || !data.priceChangedSinceLastInvoice) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', marginTop: 2 }}>
      <AlertCircle size={10} style={{ color: '#d97706', flexShrink: 0 }} />
      <span style={{ fontSize: 10.5, color: '#92400e' }}>
        Dernier prix client : {new Intl.NumberFormat('fr-FR').format(data.lastPriceForClient ?? currentPrice)} XAF
      </span>
    </div>
  )
}

// ─── ContentEditable description field ─────────────────────────
// Renders HTML formatting (bold, lists…) while editing.
// Stores raw HTML — the PDF generator uses it directly.

function ContentEditableDesc({ value, onChange }: {
  value: string
  onChange: (html: string) => void
}) {
  const ref    = useRef<HTMLDivElement>(null)
  const active = useRef(false)
  const [empty, setEmpty] = useState(() => !value || value.replace(/<[^>]*>/g, '').trim() === '')

  // Sync external value (e.g. product select) without disturbing cursor position
  useEffect(() => {
    if (ref.current && !active.current) {
      ref.current.innerHTML = value ?? ''
      setEmpty(!value || value.replace(/<[^>]*>/g, '').trim() === '')
    }
  }, [value])

  const isHtmlEmpty = (html: string) => !html || html.replace(/<[^>]*>/g, '').trim() === ''

  return (
    <div style={{ position: 'relative', borderTop: '1px dashed var(--border)' }}>
      {empty && (
        <span style={{
          position: 'absolute', top: 4, left: 8, pointerEvents: 'none',
          fontSize: 11.5, color: 'var(--text-3)', opacity: 0.5, userSelect: 'none',
        }}>
          Description (optionnel)
        </span>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => { active.current = true; setEmpty(false) }}
        onInput={(e) => {
          const html = (e.target as HTMLDivElement).innerHTML
          onChange(html)
          setEmpty(isHtmlEmpty(html))
        }}
        onBlur={(e) => {
          active.current = false
          const html = e.currentTarget.innerHTML
          onChange(html)
          setEmpty(isHtmlEmpty(html))
        }}
        style={{
          width: '100%', minHeight: 32,
          fontSize: 11.5, color: 'var(--text-3)',
          padding: '4px 8px', background: 'transparent', outline: 'none',
          fontFamily: 'var(--font-body)', lineHeight: 1.5, wordBreak: 'break-word',
        }}
      />
    </div>
  )
}

// ─── Single line row ────────────────────────────────────────────

interface LineRowProps {
  line: FormLine
  index: number
  clientId?: string
  disabled?: boolean
  onUpdate: (line: FormLine) => void
  onRemove: () => void
  // drag-and-drop
  isDragging: boolean
  isOver: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
}

function LineRow({ line, index, clientId, disabled, onUpdate, onRemove, isDragging, isOver, onDragStart, onDragOver, onDrop, onDragEnd }: LineRowProps) {
  const update = useCallback(<K extends keyof FormLine>(field: K, value: FormLine[K]) => {
    const next = { ...line, [field]: value }
    // Recompute if numeric fields changed
    if (['quantity', 'unitPriceHt', 'discountType', 'discountValue', 'taxRate'].includes(field as string)) {
      const c = computeLineValues(
        field === 'quantity'     ? value as number : next.quantity,
        field === 'unitPriceHt'  ? value as number : next.unitPriceHt,
        field === 'discountType' ? value as DiscountType : next.discountType,
        field === 'discountValue'? value as number : next.discountValue,
        field === 'taxRate'      ? value as number : next.taxRate,
      )
      onUpdate({ ...next, ...c })
    } else {
      onUpdate(next)
    }
  }, [line, onUpdate])

  const inputCss: React.CSSProperties = {
    width: '100%', padding: '7px 8px', background: 'transparent',
    border: 'none', outline: 'none', fontSize: 13, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)',
  }
  const numCss: React.CSSProperties = { ...inputCss, fontFamily: 'var(--font-mono)', textAlign: 'right' }
  const cellCss: React.CSSProperties = {
    border: 'none', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
    padding: 0, verticalAlign: 'top',
  }

  return (
    <tr
      onDragOver={(e) => { e.preventDefault(); onDragOver(e) }}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        opacity: isDragging ? 0.4 : 1,
        background: isOver ? 'rgba(45,125,210,0.06)' : undefined,
        outline: isOver ? '2px solid var(--primary)' : undefined,
        outlineOffset: -2,
        transition: 'background 0.1s, opacity 0.15s',
      }}
    >
      {/* Drag handle — seule cette cellule est draggable */}
      {!disabled ? (
        <td
          draggable
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.stopPropagation(); onDragStart() }}
          style={{ ...cellCss, width: 24, textAlign: 'center', padding: '0 4px', cursor: 'grab', userSelect: 'none' }}
        >
          <GripVertical size={13} style={{ color: 'var(--text-3)', display: 'block', margin: '0 auto', pointerEvents: 'none' }} />
        </td>
      ) : (
        <td style={{ ...cellCss, width: 24 }} />
      )}

      {/* N° */}
      <td style={{ ...cellCss, width: 32, textAlign: 'center', padding: '8px 0', color: 'var(--text-3)', fontSize: 12 }}>
        {index + 1}
      </td>

      {/* Désignation + description */}
      <td style={{ ...cellCss, minWidth: 200 }}>
        <ProductCombo
          value={line.designation}
          disabled={disabled}
          onChange={(val) => update('designation', val)}
          onSelect={(product) => {
            const price = Number(product.unitPriceHt)
            const tax   = Number(product.taxRateValue)
            const c = computeLineValues(line.quantity, price, line.discountType, line.discountValue, tax)
            onUpdate({
              ...line,
              productId: product.id,
              designation: product.name,
              description: product.description ?? '',  // HTML conservé tel quel pour le PDF
              unit: product.unit,
              unitPriceHt: price,
              taxRate: tax,
              ...c,
            })
          }}
        />
        {line.productId && clientId && (
          <PriceChangeAlert productId={line.productId} clientId={clientId} currentPrice={line.unitPriceHt} />
        )}
        {disabled ? (
          line.description
            ? <div style={{ fontSize: 11.5, color: 'var(--text-3)', padding: '4px 8px', borderTop: '1px dashed var(--border)', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: line.description }} />
            : null
        ) : (
          <ContentEditableDesc
            value={line.description ?? ''}
            onChange={(html) => update('description', html)}
          />
        )}
      </td>

      {/* Qté */}
      <td style={{ ...cellCss, width: 72 }}>
        <input
          type="number" min="0" step="0.01"
          value={line.quantity}
          disabled={disabled}
          onChange={(e) => update('quantity', parseFloat(e.target.value) || 0)}
          style={numCss}
        />
      </td>

      {/* Unité */}
      <td style={{ ...cellCss, width: 90 }}>
        <select
          value={line.unit}
          disabled={disabled}
          onChange={(e) => update('unit', e.target.value)}
          style={{ ...inputCss, cursor: disabled ? 'default' : 'pointer', appearance: 'none' }}
        >
          {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
      </td>

      {/* P.U. HT */}
      <td style={{ ...cellCss, width: 110 }}>
        <input
          type="number" min="0" step="100"
          value={line.unitPriceHt}
          disabled={disabled}
          onChange={(e) => update('unitPriceHt', parseFloat(e.target.value) || 0)}
          style={numCss}
        />
      </td>

      {/* Remise */}
      <td style={{ ...cellCss, width: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <input
            type="number" min="0" step="0.1"
            value={line.discountType === 'none' ? '' : line.discountValue}
            disabled={disabled || line.discountType === 'none'}
            placeholder={line.discountType === 'none' ? '—' : '0'}
            onChange={(e) => update('discountValue', parseFloat(e.target.value) || 0)}
            style={{ ...numCss, width: 56, flexShrink: 0, color: line.discountType !== 'none' ? 'var(--text-1)' : 'var(--text-3)' }}
          />
          <select
            value={line.discountType}
            disabled={disabled}
            onChange={(e) => update('discountType', e.target.value as DiscountType)}
            style={{ ...inputCss, width: 52, fontSize: 11, padding: '7px 4px', cursor: disabled ? 'default' : 'pointer', appearance: 'none', color: 'var(--text-3)' }}
          >
            <option value="none">—</option>
            <option value="percentage">%</option>
            <option value="fixed">XAF</option>
          </select>
        </div>
      </td>

      {/* TVA */}
      <td style={{ ...cellCss, width: 80 }}>
        <input
          type="number" min="0" max="100" step="0.01"
          value={line.taxRate}
          disabled={disabled}
          onChange={(e) => update('taxRate', parseFloat(e.target.value) || 0)}
          style={{ ...numCss }}
        />
      </td>

      {/* Total HT (computed) */}
      <td style={{ ...cellCss, width: 120, padding: '8px 10px', textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {new Intl.NumberFormat('fr-FR').format(line.netHt)}
        </span>
      </td>

      {/* Delete */}
      <td style={{ ...cellCss, borderRight: 'none', width: 36, textAlign: 'center', padding: '6px' }}>
        {!disabled && (
          <button
            type="button"
            onClick={onRemove}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 4 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.07)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── Main component ─────────────────────────────────────────────

export function LineItemsEditor({ lines, onChange, clientId, disabled = false }: LineItemsEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); setOverIndex(null); return }
    const next = [...lines]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(targetIndex, 0, moved)
    onChange(next.map((l, i) => ({ ...l, sortOrder: i })))
    setDragIndex(null)
    setOverIndex(null)
  }

  const addLine = () => {
    onChange([...lines, makeBlankLine(lines.length)])
  }

  const updateLine = (index: number, line: FormLine) => {
    const next = [...lines]
    next[index] = line
    onChange(next)
  }

  const removeLine = (index: number) => {
    onChange(lines.filter((_, i) => i !== index).map((l, i) => ({ ...l, sortOrder: i })))
  }

  const thCss: React.CSSProperties = {
    padding: '8px 10px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
    borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', textAlign: 'left',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header row with Add button */}
      {!disabled && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            type="button"
            onClick={addLine}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 'var(--radius-md)',
              background: 'var(--primary)', color: '#fff', border: 'none',
              cursor: 'pointer', fontSize: 13,
              fontFamily: 'var(--font-display)', fontWeight: 600,
              boxShadow: '0 3px 8px rgba(45,125,210,0.25)',
            }}
          >
            <Plus size={14} strokeWidth={2.5} /> Ajouter une ligne
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ ...thCss, width: 24, padding: '8px 4px' }}></th>
              <th style={{ ...thCss, width: 32, textAlign: 'center' }}>#</th>
              <th style={{ ...thCss }}>Désignation</th>
              <th style={{ ...thCss, textAlign: 'right' }}>Qté</th>
              <th style={{ ...thCss }}>Unité</th>
              <th style={{ ...thCss, textAlign: 'right' }}>P.U. HT</th>
              <th style={{ ...thCss }}>Remise</th>
              <th style={{ ...thCss, textAlign: 'right' }}>TVA %</th>
              <th style={{ ...thCss, textAlign: 'right', borderRight: 'none' }}>Total HT</th>
              <th style={{ ...thCss, borderRight: 'none', width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                  {disabled ? 'Aucune ligne' : 'Cliquez sur « Ajouter une ligne » pour commencer'}
                </td>
              </tr>
            ) : lines.map((line, i) => (
              <LineRow
                key={line._localId}
                line={line}
                index={i}
                clientId={clientId}
                disabled={disabled}
                onUpdate={(l) => updateLine(i, l)}
                onRemove={() => removeLine(i)}
                isDragging={dragIndex === i}
                isOver={overIndex === i && dragIndex !== i}
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => { e.preventDefault(); setOverIndex(i) }}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
              />
            ))}
          </tbody>
        </table>
      </div>

      {lines.length > 0 && !disabled && (
        <button
          type="button"
          onClick={addLine}
          style={{
            marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 'var(--radius-md)',
            border: '1.5px dashed var(--border)', background: 'transparent',
            color: 'var(--text-3)', cursor: 'pointer', fontSize: 12.5,
            fontFamily: 'var(--font-display)', fontWeight: 500, alignSelf: 'flex-start',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)' }}
        >
          <Plus size={13} /> Ajouter une ligne
        </button>
      )}
    </div>
  )
}