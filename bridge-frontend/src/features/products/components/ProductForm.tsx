'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Wrench, Package } from 'lucide-react'
import { useCreateProduct, useUpdateProduct, useProductCategories } from '../hooks'
import type { Product, CreateProductPayload } from '../types'
import { TAX_RATE_DEFAULT } from '@/lib/constants'
import { MiniRichEditor } from '@/components/ui/MiniRichEditor'
import { useSettings } from '@/features/settings/hooks'

interface ProductFormProps {
  product?: Product
  onClose?: () => void
}

const UNITS = ['heure', 'jour', 'mois', 'forfait', 'unité', 'licence', 'poste', 'm²', 'km']

const fieldLabel = (label: string, required = false) => (
  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
    {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
  </span>
)

export function ProductForm({ product, onClose }: ProductFormProps) {
  const isEdit = !!product
  const { data: categories = [] } = useProductCategories()
  const { data: settings } = useSettings()
  const settingsApplied = useRef(false)

  const [form, setForm] = useState<CreateProductPayload>({
    name:         product?.name         ?? '',
    type:         product?.type         ?? 'service',
    unit:         product?.unit         ?? 'heure',
    unitPriceHt:  product?.unitPriceHt  ?? 0,
    taxRateValue: product?.taxRateValue ?? TAX_RATE_DEFAULT,
    reference:    product?.reference    ?? '',
    description:  product?.description  ?? '',
    categoryId:   product?.categoryId   ?? '',
    isActive:     product?.isActive     ?? true,
  })

  // Apply defaultTaxRate from settings on new products
  useEffect(() => {
    if (isEdit || !settings || settingsApplied.current) return
    settingsApplied.current = true
    setForm(prev => ({ ...prev, taxRateValue: settings.defaultTaxRate }))
  }, [settings, isEdit])

  const createMutation = useCreateProduct()
  const updateMutation = useUpdateProduct(product?.id ?? '')
  const mutation = isEdit ? updateMutation : createMutation

  const set = <K extends keyof CreateProductPayload>(field: K, value: CreateProductPayload[K]) =>
    setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...form,
      categoryId: form.categoryId || undefined,
      reference:  form.reference  || undefined,
    }
    if (isEdit) {
      updateMutation.mutate(payload, { onSuccess: onClose })
    } else {
      createMutation.mutate(payload, { onSuccess: onClose })
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--surface)', fontSize: 14, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none',
  }
  const focusOn  = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)'
  }
  const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Type : Service / Produit */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {fieldLabel('Type', true)}
        <div style={{ display: 'flex', gap: 8 }}>
          {([
            { value: 'service', label: 'Prestation / Service', icon: Wrench },
            { value: 'product', label: 'Produit physique',     icon: Package },
          ] as const).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => set('type', value)}
              style={{
                flex: 1, padding: '9px 10px',
                borderRadius: 'var(--radius-md)',
                border: `2px solid ${form.type === value ? 'var(--primary)' : 'var(--border)'}`,
                background: form.type === value ? 'rgba(45,125,210,0.06)' : 'var(--surface)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                fontSize: 13, fontWeight: form.type === value ? 600 : 400,
                color: form.type === value ? 'var(--primary)' : 'var(--text-2)',
                fontFamily: 'var(--font-display)', transition: 'all 0.15s',
              }}
            >
              <Icon size={14} strokeWidth={2} />{label}
            </button>
          ))}
        </div>
      </div>

      {/* Nom */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {fieldLabel('Nom du produit / service', true)}
        <input type="text" value={form.name} required
          onChange={(e) => set('name', e.target.value)}
          placeholder="Ex: Installation réseau Wi-Fi"
          style={inputStyle} onFocus={focusOn} onBlur={focusOff}
        />
      </div>

      {/* Référence + Catégorie */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fieldLabel('Référence')}
          <input type="text" value={form.reference ?? ''}
            onChange={(e) => set('reference', e.target.value)}
            placeholder="INF-001"
            style={inputStyle} onFocus={focusOn} onBlur={focusOff}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fieldLabel('Catégorie')}
          <select
            value={form.categoryId ?? ''}
            onChange={(e) => set('categoryId', e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
            onFocus={focusOn} onBlur={focusOff}
          >
            <option value="">— Aucune catégorie —</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Prix HT + Unité + TVA */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fieldLabel('Prix unitaire HT (XAF)', true)}
          <input
            type="number" min="0" step="100"
            value={form.unitPriceHt}
            onChange={(e) => set('unitPriceHt', parseFloat(e.target.value) || 0)}
            placeholder="0"
            required
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
            onFocus={focusOn} onBlur={focusOff}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fieldLabel('Unité', true)}
          <select
            value={form.unit}
            onChange={(e) => set('unit', e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
            onFocus={focusOn} onBlur={focusOff}
          >
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fieldLabel('TVA (%)')}
          <input
            type="number" min="0" max="100" step="0.01"
            value={form.taxRateValue}
            onChange={(e) => set('taxRateValue', parseFloat(e.target.value) || 0)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
            onFocus={focusOn} onBlur={focusOff}
          />
        </div>
      </div>

      {/* Prix TTC calculé (readonly) */}
      {form.unitPriceHt > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--radius-md)',
          background: 'rgba(45,125,210,0.06)', border: '1px solid rgba(45,125,210,0.2)',
        }}>
          <p style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500 }}>
            Prix TTC calculé :{' '}
            <span className="amount" style={{ fontSize: 14, fontWeight: 700 }}>
              {new Intl.NumberFormat('fr-FR').format(Math.round(form.unitPriceHt * (1 + form.taxRateValue / 100)))} XAF
            </span>
            {' '}/ {form.unit}
          </p>
        </div>
      )}

      {/* Description — éditeur texte enrichi (HTML, conforme CDC) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {fieldLabel('Description')}
        <MiniRichEditor
          value={form.description ?? ''}
          onChange={(html) => set('description', html)}
          placeholder="Description détaillée du produit ou service (supporte gras, italique, listes…)"
          minHeight={96}
        />
      </div>

      {/* Statut actif */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={form.isActive ?? true}
          onChange={(e) => set('isActive', e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 13.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
          Produit actif (disponible dans les documents)
        </span>
      </label>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
        {onClose && (
          <button type="button" onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-2)', fontSize: 13.5,
              fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer',
            }}
          >
            Annuler
          </button>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          style={{
            padding: '9px 22px', borderRadius: 'var(--radius-md)',
            background: mutation.isPending ? '#93b8e0' : 'var(--primary)',
            color: '#fff', border: 'none',
            cursor: mutation.isPending ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: mutation.isPending ? 'none' : '0 4px 12px rgba(45,125,210,0.3)',
          }}
        >
          {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
          {isEdit ? 'Enregistrer' : 'Créer le produit'}
        </button>
      </div>
    </form>
  )
}
