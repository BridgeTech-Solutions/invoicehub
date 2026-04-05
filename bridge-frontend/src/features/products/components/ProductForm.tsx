'use client'

import { useState, useEffect, useRef, useId } from 'react'
import { Loader2, Wrench, Package, AlertCircle } from 'lucide-react'
import { useCreateProduct, useUpdateProduct, useProductCategories } from '../hooks'
import type { Product, CreateProductPayload } from '../types'
import { TAX_RATE_DEFAULT } from '@/lib/constants'
import { MiniRichEditor } from '@/components/ui/MiniRichEditor'
import { useSettings } from '@/features/settings/hooks'
import { useIsMobile } from '@/hooks/useMediaQuery'

interface ProductFormProps {
  product?: Product
  onClose?: () => void
  /** Nom pré-rempli (depuis la recherche dans LineItemsEditor) */
  initialName?: string
  /** Appelé avec le produit créé (pour auto-sélection dans le formulaire parent) */
  onCreated?: (product: Product) => void
}

const UNITS = ['heure', 'jour', 'mois', 'forfait', 'unité', 'licence', 'poste', 'm²', 'km']

// ─── Field wrapper ─────────────────────────────────────────────
function Field({
  label, required, children, htmlFor,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 3 }}>
        {label}
        {required && <span aria-hidden="true" style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
        {required && <span className="sr-only">(obligatoire)</span>}
      </label>
      {children}
    </div>
  )
}

export function ProductForm({ product, onClose, initialName, onCreated }: ProductFormProps) {
  const isEdit   = !!product
  const isMobile = useIsMobile()

  const { data: categories = [] } = useProductCategories()
  const { data: settings } = useSettings()
  const settingsApplied = useRef(false)

  // ─── Unique IDs ───────────────────────────────────────────────
  const idType         = useId()
  const idName         = useId()
  const idReference    = useId()
  const idCategory     = useId()
  const idPrice        = useId()
  const idUnit         = useId()
  const idTax          = useId()
  const idDescription  = useId()
  const idIsActive     = useId()

  const [form, setForm] = useState<CreateProductPayload>({
    name:         product?.name         ?? initialName ?? '',
    type:         product?.type         ?? 'service',
    unit:         product?.unit         ?? 'heure',
    unitPriceHt:  product?.unitPriceHt  ?? 0,
    taxRateValue: product?.taxRateValue ?? TAX_RATE_DEFAULT,
    reference:    product?.reference    ?? '',
    description:  product?.description  ?? '',
    categoryId:   product?.categoryId   ?? '',
    isActive:     product?.isActive     ?? true,
  })

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
      createMutation.mutate(payload, {
        onSuccess: (created) => {
          onCreated?.(created)
          onClose?.()
        },
      })
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--surface)', fontSize: 14, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
  }
  const focusOn  = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)'
  }
  const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'
  }

  const grid2: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12,
  }

  const ttcValue = form.unitPriceHt > 0
    ? Math.round(form.unitPriceHt * (1 + form.taxRateValue / 100))
    : 0

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={mutation.isPending}
      noValidate
      style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      {/* Error banner */}
      {mutation.isError && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.25)', color: '#dc2626' }}>
          <AlertCircle size={14} aria-hidden />
          <span style={{ fontSize: 13 }}>
            {isEdit ? 'Erreur lors de la mise à jour.' : 'Erreur lors de la création.'} Veuillez réessayer.
          </span>
        </div>
      )}

      {/* Type : Service / Produit */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span id={idType} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
          Type <span aria-hidden="true" style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
          <span className="sr-only">(obligatoire)</span>
        </span>
        <div role="radiogroup" aria-labelledby={idType} style={{ display: 'flex', gap: 8 }}>
          {([
            { value: 'service', label: 'Prestation / Service', icon: Wrench },
            { value: 'product', label: 'Produit physique',     icon: Package },
          ] as const).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={form.type === value}
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
              <Icon size={14} strokeWidth={2} aria-hidden />{label}
            </button>
          ))}
        </div>
      </div>

      {/* Nom */}
      <Field label="Nom du produit / service" required htmlFor={idName}>
        <input
          id={idName}
          type="text"
          value={form.name}
          required
          aria-required
          onChange={(e) => set('name', e.target.value)}
          placeholder="Ex: Installation réseau Wi-Fi"
          style={inputStyle}
          onFocus={focusOn} onBlur={focusOff}
        />
      </Field>

      {/* Référence + Catégorie */}
      <div style={grid2}>
        <Field label="Référence" htmlFor={idReference}>
          <input
            id={idReference}
            type="text"
            value={form.reference ?? ''}
            onChange={(e) => set('reference', e.target.value)}
            placeholder="INF-001"
            style={inputStyle}
            onFocus={focusOn} onBlur={focusOff}
          />
        </Field>
        <Field label="Catégorie" htmlFor={idCategory}>
          <select
            id={idCategory}
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
        </Field>
      </div>

      {/* Prix HT + Unité + TVA */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1.5fr 1fr', gap: 12 }}>
        <Field label="Prix unitaire HT (XAF)" required htmlFor={idPrice}>
          <input
            id={idPrice}
            type="number" min="0" step="100"
            value={form.unitPriceHt}
            onChange={(e) => set('unitPriceHt', parseFloat(e.target.value) || 0)}
            placeholder="0"
            required
            aria-required
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
            onFocus={focusOn} onBlur={focusOff}
          />
        </Field>
        <Field label="Unité" required htmlFor={idUnit}>
          <select
            id={idUnit}
            value={form.unit}
            onChange={(e) => set('unit', e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
            onFocus={focusOn} onBlur={focusOff}
          >
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="TVA (%)" htmlFor={idTax}>
          <input
            id={idTax}
            type="number" min="0" max="100" step="0.01"
            value={form.taxRateValue}
            onChange={(e) => set('taxRateValue', parseFloat(e.target.value) || 0)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
            onFocus={focusOn} onBlur={focusOff}
          />
        </Field>
      </div>

      {/* Prix TTC calculé (readonly) */}
      {form.unitPriceHt > 0 && (
        <div
          aria-live="polite"
          style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            background: 'rgba(45,125,210,0.06)', border: '1px solid rgba(45,125,210,0.2)',
          }}
        >
          <p style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500 }}>
            Prix TTC calculé :{' '}
            <span className="amount" style={{ fontSize: 14, fontWeight: 700 }}>
              {new Intl.NumberFormat('fr-FR').format(ttcValue)} XAF
            </span>
            {' '}/ {form.unit}
          </p>
        </div>
      )}

      {/* Description */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor={idDescription} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
          Description
        </label>
        <MiniRichEditor
          value={form.description ?? ''}
          onChange={(html) => set('description', html)}
          placeholder="Description détaillée du produit ou service (supporte gras, italique, listes…)"
          minHeight={96}
        />
      </div>

      {/* Statut actif */}
      <label htmlFor={idIsActive} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minHeight: 44 }}>
        <input
          id={idIsActive}
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
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-2)', fontSize: 13.5,
              fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)';  e.currentTarget.style.color = 'var(--text-2)' }}
          >
            Annuler
          </button>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          aria-disabled={mutation.isPending}
          style={{
            padding: '9px 22px', borderRadius: 'var(--radius-md)',
            background: 'var(--primary)',
            color: '#fff', border: 'none',
            cursor: mutation.isPending ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: mutation.isPending ? 0.65 : 1,
            boxShadow: mutation.isPending ? 'none' : '0 4px 12px rgba(45,125,210,0.3)',
            transition: 'opacity 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => { if (!mutation.isPending) e.currentTarget.style.boxShadow = '0 4px 18px rgba(45,125,210,0.5)' }}
          onMouseLeave={(e) => { if (!mutation.isPending) e.currentTarget.style.boxShadow = '0 4px 12px rgba(45,125,210,0.3)' }}
        >
          {mutation.isPending && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {isEdit ? 'Enregistrer' : 'Créer le produit'}
        </button>
      </div>
    </form>
  )
}
