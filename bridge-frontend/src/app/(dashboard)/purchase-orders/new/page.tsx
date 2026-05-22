'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCreatePurchaseOrder } from '@/features/purchase-orders/hooks'
import { useSuppliers } from '@/features/suppliers/hooks'
import { ROUTES, TAX_RATE_DEFAULT } from '@/lib/constants'
import { formatXAF } from '@/lib/utils'
import type { CreatePOLine } from '@/features/purchase-orders/types'

interface LineState extends CreatePOLine {
  _id: string
}

let _lineId = 0
function newLine(): LineState {
  return {
    _id:         String(++_lineId),
    designation: '',
    description: '',
    unit:        'U',
    quantity:    1,
    unitPriceHt: 0,
    taxRate:     TAX_RATE_DEFAULT,
  }
}

function calcLine(l: LineState) {
  const ht  = l.quantity * l.unitPriceHt
  const tax = ht * ((l.taxRate ?? TAX_RATE_DEFAULT) / 100)
  return { ht, tax, ttc: ht + tax }
}

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--border)', background: 'var(--bg)',
  fontSize: 13, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none',
}
const label: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
  marginBottom: 4, fontFamily: 'var(--font-display)',
}

export default function NewPurchaseOrderPage() {
  const searchParams   = useSearchParams()
  const defaultSupplier = searchParams.get('supplierId') ?? ''
  const createMutation = useCreatePurchaseOrder()

  const [supplierId,      setSupplierId]      = useState(defaultSupplier)
  const [orderDate,       setOrderDate]       = useState(new Date().toISOString().slice(0, 10))
  const [expectedDate,    setExpectedDate]    = useState('')
  const [reference,       setReference]       = useState('')
  const [paymentTermDays, setPaymentTermDays] = useState(30)
  const [notes,           setNotes]           = useState('')
  const [lines,           setLines]           = useState<LineState[]>([newLine()])
  const [errors,          setErrors]          = useState<Record<string, string>>({})

  const { data: suppliersData } = useSuppliers({ limit: 200 })
  const suppliers = suppliersData?.data ?? []

  // prefill payment terms when supplier selected
  useEffect(() => {
    const sup = suppliers.find(s => s.id === supplierId)
    if (sup) setPaymentTermDays(sup.paymentTermDays ?? 30)
  }, [supplierId, suppliers])

  function addLine()           { setLines(l => [...l, newLine()]) }
  function removeLine(id: string) { setLines(l => l.filter(x => x._id !== id)) }
  function setLine<K extends keyof LineState>(id: string, key: K, val: LineState[K]) {
    setLines(l => l.map(x => x._id === id ? { ...x, [key]: val } : x))
  }

  const totals = lines.reduce(
    (acc, l) => { const c = calcLine(l); return { ht: acc.ht + c.ht, tax: acc.tax + c.tax, ttc: acc.ttc + c.ttc } },
    { ht: 0, tax: 0, ttc: 0 },
  )

  function validate() {
    const e: Record<string, string> = {}
    if (!supplierId)    e.supplierId = 'Fournisseur requis'
    if (!orderDate)     e.orderDate  = 'Date requise'
    if (lines.length === 0) e.lines = 'Au moins une ligne requise'
    lines.forEach((l, i) => {
      if (!l.designation.trim()) e[`line_${i}`] = 'Désignation requise'
      if (l.quantity <= 0)       e[`qty_${i}`]  = 'Quantité invalide'
      if (l.unitPriceHt < 0)    e[`prc_${i}`]  = 'Prix invalide'
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    createMutation.mutate({
      supplierId,
      orderDate,
      expectedDate:    expectedDate || undefined,
      reference:       reference || undefined,
      notes:           notes || undefined,
      paymentTermDays: Number(paymentTermDays),
      lines: lines.map((l, i) => ({
        designation: l.designation,
        description: l.description || undefined,
        unit:        l.unit || 'U',
        quantity:    Number(l.quantity),
        unitPriceHt: Number(l.unitPriceHt),
        taxRate:     Number(l.taxRate),
        sortOrder:   i + 1,
      })),
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1080, animation: 'page-in 0.2s ease' }}>
      <div>
        <Link href={ROUTES.PURCHASE_ORDERS} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <ChevronLeft size={14} /> Bons de commande
        </Link>
        <PageHeader title="Nouveau bon de commande" description="Créez un bon de commande fournisseur" />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* En-tête */}
          <div className="card" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
              En-tête
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

              {/* Fournisseur */}
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 0 }}>
                <label style={label}>Fournisseur <span style={{ color: '#dc2626' }}>*</span></label>
                <select value={supplierId} onChange={e => { setSupplierId(e.target.value); setErrors(er => ({ ...er, supplierId: '' })) }}
                  style={{ ...inp, cursor: 'pointer', borderColor: errors.supplierId ? '#dc2626' : 'var(--border)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = errors.supplierId ? '#dc2626' : 'var(--border)')}>
                  <option value="">— Sélectionner un fournisseur —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {errors.supplierId && <span style={{ fontSize: 11.5, color: '#dc2626', marginTop: 4 }} role="alert">{errors.supplierId}</span>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <label style={label}>Date de commande <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                  style={{ ...inp, borderColor: errors.orderDate ? '#dc2626' : 'var(--border)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = errors.orderDate ? '#dc2626' : 'var(--border)')} />
                {errors.orderDate && <span style={{ fontSize: 11.5, color: '#dc2626', marginTop: 4 }} role="alert">{errors.orderDate}</span>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <label style={label}>Livraison prévue</label>
                <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                  style={inp}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <label style={label}>Délai paiement (jours)</label>
                <input type="number" min={0} value={paymentTermDays} onChange={e => setPaymentTermDays(Number(e.target.value))}
                  style={inp}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <label style={label}>Référence interne</label>
                <input value={reference} onChange={e => setReference(e.target.value)}
                  placeholder="Ex : REF-2026-001"
                  style={inp}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <label style={label}>Notes</label>
                <input value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Instructions particulières…"
                  style={inp}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>
          </div>

          {/* Lignes */}
          <div className="card" style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Lignes de commande
              </h2>
              <button type="button" onClick={addLine}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--primary)', background: 'rgba(45,125,210,0.06)', color: 'var(--primary)', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                <Plus size={13} /> Ajouter une ligne
              </button>
            </div>

            {errors.lines && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: '#fef2f2', border: '1px solid #fecaca', marginBottom: 12 }}>
                <AlertCircle size={14} style={{ color: '#dc2626' }} />
                <span style={{ fontSize: 13, color: '#dc2626' }}>{errors.lines}</span>
              </div>
            )}

            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 0.8fr 0.5fr 36px', gap: 8, padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
              {['Désignation', 'Unité', 'Qté', 'P.U. HT', 'TVA %', 'Total TTC', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>

            {lines.map((l, i) => {
              const c = calcLine(l)
              return (
                <div key={l._id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 0.8fr 0.5fr 36px', gap: 8, alignItems: 'start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input value={l.designation} onChange={e => setLine(l._id, 'designation', e.target.value)}
                      placeholder="Désignation *"
                      style={{ ...inp, borderColor: errors[`line_${i}`] ? '#dc2626' : 'var(--border)' }}
                      onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                      onBlur={e  => (e.target.style.borderColor = errors[`line_${i}`] ? '#dc2626' : 'var(--border)')} />
                    <input value={l.description ?? ''} onChange={e => setLine(l._id, 'description', e.target.value)}
                      placeholder="Description (facultatif)"
                      style={{ ...inp, fontSize: 12, color: 'var(--text-3)' }}
                      onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                      onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
                    {errors[`line_${i}`] && <span style={{ fontSize: 11, color: '#dc2626' }}>{errors[`line_${i}`]}</span>}
                  </div>

                  <input value={l.unit} onChange={e => setLine(l._id, 'unit', e.target.value)}
                    placeholder="U"
                    style={inp}
                    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />

                  <input type="number" min={0.01} step="any" value={l.quantity}
                    onChange={e => setLine(l._id, 'quantity', Number(e.target.value))}
                    style={{ ...inp, borderColor: errors[`qty_${i}`] ? '#dc2626' : 'var(--border)', fontFamily: 'var(--font-mono)' }}
                    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={e  => (e.target.style.borderColor = errors[`qty_${i}`] ? '#dc2626' : 'var(--border)')} />

                  <input type="number" min={0} step="any" value={l.unitPriceHt}
                    onChange={e => setLine(l._id, 'unitPriceHt', Number(e.target.value))}
                    style={{ ...inp, fontFamily: 'var(--font-mono)' }}
                    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />

                  <input type="number" min={0} max={100} step="any" value={l.taxRate}
                    onChange={e => setLine(l._id, 'taxRate', Number(e.target.value))}
                    style={{ ...inp, fontFamily: 'var(--font-mono)' }}
                    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />

                  <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)', padding: '8px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {new Intl.NumberFormat('fr-FR').format(Math.round(c.ttc))}
                  </span>

                  <button type="button" onClick={() => removeLine(l._id)} disabled={lines.length === 1}
                    style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: lines.length === 1 ? 'not-allowed' : 'pointer', opacity: lines.length === 1 ? 0.3 : 1, color: '#dc2626' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Totaux + actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Link href={ROUTES.PURCHASE_ORDERS}
                style={{ padding: '9px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                Annuler
              </Link>
              <button type="submit" disabled={createMutation.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 24px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: createMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.3)', opacity: createMutation.isPending ? 0.7 : 1 }}>
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Créer le bon de commande
              </button>
            </div>

            {/* Totaux */}
            <div className="card" style={{ padding: '16px 24px', minWidth: 300 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>Sous-total HT</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{formatXAF(totals.ht)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>TVA</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{formatXAF(totals.tax)}</span>
              </div>
              <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Total TTC</span>
                <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{formatXAF(totals.ttc)}</span>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
