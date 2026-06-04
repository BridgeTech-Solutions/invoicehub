'use client'

import { useState, useEffect, useRef, useId } from 'react'
import { Loader2, Wrench, Package, AlertCircle, Warehouse, Info } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCreateProduct, useUpdateProduct, useProductCategories } from '../hooks'
import { adjustStock } from '@/features/stock/api'
import type { Product, CreateProductPayload } from '../types'
import { TAX_RATE_DEFAULT } from '@/lib/constants'
import { MiniRichEditor } from '@/components/ui/MiniRichEditor'
import { useSettings } from '@/features/settings/hooks'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useUnits } from '@/features/units/hooks'

interface ProductFormProps {
  product?: Product
  onClose?: () => void
  /** Nom pré-rempli (depuis la recherche dans LineItemsEditor) */
  initialName?: string
  /** Appelé avec le produit créé (pour auto-sélection dans le formulaire parent) */
  onCreated?: (product: Product) => void
  /** id HTML du <form> — permet à un bouton externe (footer drawer) de soumettre via form="id" */
  formId?: string
  /** Masque les boutons Annuler/Créer internes (quand le footer est géré par le parent) */
  hideActions?: boolean
  /** Callback appelé quand isPending change — permet au parent de suivre l'état */
  onPendingChange?: (pending: boolean) => void
}

const UNITS_FALLBACK = ['piece', 'forfait', 'heure', 'kg']
const STOCK_UNITS = ['pièce', 'unité', 'carton', 'lot', 'kg', 'g', 'litre', 'ml', 'm', 'm²', 'm³']

// ─── Field wrapper ─────────────────────────────────────────────
function Field({
  label, required, hint, children, htmlFor,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 3 }}>
        {label}
        {required && <span aria-hidden="true" style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
        {required && <span className="sr-only">(obligatoire)</span>}
      </label>
      {children}
      {hint && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>{hint}</p>
      )}
    </div>
  )
}

export function ProductForm({ product, onClose, initialName, onCreated, formId, hideActions, onPendingChange }: ProductFormProps) {
  const isEdit   = !!product
  const isMobile = useIsMobile()
  const qc       = useQueryClient()

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
  const idTrackStock   = useId()
  const idPurchasePrice = useId()
  const idStockUnit    = useId()
  const idMinLevel     = useId()
  const idMaxLevel     = useId()
  const idInitialQty   = useId()

  const [form, setForm] = useState<CreateProductPayload>({
    name:             product?.name             ?? initialName ?? '',
    type:             product?.type             ?? 'service',
    unit:             product?.unit             ?? 'heure',
    unitPriceHt:      product?.unitPriceHt      ?? 0,
    taxRateValue:     product?.taxRateValue      ?? TAX_RATE_DEFAULT,
    reference:        product?.reference        ?? '',
    description:      product?.description      ?? '',
    categoryId:       product?.categoryId       ?? '',
    isActive:         product?.isActive         ?? true,
    trackStock:       product?.trackStock        ?? false,
    purchasePriceHt:  product?.purchasePriceHt  ?? undefined,
    stockUnit:        product?.stockUnit         ?? undefined,
    stockMinLevel:    product?.stockMinLevel !== null && product?.stockMinLevel !== undefined
      ? Number(product.stockMinLevel) : undefined,
    stockMaxLevel:    product?.stockMaxLevel !== null && product?.stockMaxLevel !== undefined
      ? Number(product.stockMaxLevel) : undefined,
  })

  // Quantité initiale — local uniquement, déclenche un mouvement initial_stock après création
  const [initialStockQty, setInitialStockQty] = useState(0)
  const [stockSubmitting, setStockSubmitting] = useState(false)

  useEffect(() => {
    if (isEdit || !settings || settingsApplied.current) return
    settingsApplied.current = true
    setForm(prev => ({ ...prev, taxRateValue: settings.defaultTaxRate }))
  }, [settings, isEdit])

  // Quand on passe à 'service', désactiver trackStock
  useEffect(() => {
    if (form.type === 'service' && form.trackStock) {
      setForm(prev => ({ ...prev, trackStock: false }))
    }
  }, [form.type]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: unitsData } = useUnits()
  const UNITS = unitsData?.map(u => u.code) ?? UNITS_FALLBACK

  const createMutation = useCreateProduct()
  const updateMutation = useUpdateProduct(product?.id ?? '')
  const mutation = isEdit ? updateMutation : createMutation

  const isPending = mutation.isPending || stockSubmitting

  useEffect(() => {
    onPendingChange?.(isPending)
  }, [isPending, onPendingChange])

  const set = <K extends keyof CreateProductPayload>(field: K, value: CreateProductPayload[K]) =>
    setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const payload: CreateProductPayload = {
      ...form,
      categoryId: form.categoryId || undefined,
      reference:  form.reference  || undefined,
      // Forcer suppression des champs stock si service
      ...(form.type === 'service' && {
        trackStock:      false,
        purchasePriceHt: undefined,
        stockUnit:       undefined,
        stockMinLevel:   undefined,
        stockMaxLevel:   undefined,
      }),
    }

    if (isEdit) {
      updateMutation.mutate(payload, { onSuccess: onClose })
    } else {
      createMutation.mutate(payload, {
        onSuccess: async (created) => {
          // Créer le mouvement de stock initial si nécessaire
          if (payload.trackStock && initialStockQty > 0) {
            setStockSubmitting(true)
            try {
              await adjustStock({
                productId:  created.id,
                quantity:   initialStockQty,
                type:       'initial_stock',
                unitCostHt: payload.purchasePriceHt,
                notes:      'Stock initial à la création du produit',
              })
              qc.invalidateQueries({ queryKey: ['stock'] })
            } catch {
              toast.error('Produit créé, mais erreur lors de l\'initialisation du stock')
            } finally {
              setStockSubmitting(false)
            }
          }
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
      id={formId}
      onSubmit={handleSubmit}
      aria-busy={isPending}
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
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {unitsData?.find(ud => ud.code === u)?.label ?? u}
              </option>
            ))}
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
          <p style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, margin: 0 }}>
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

      {/* ── Section Stock (produit physique uniquement) ─────────── */}
      {form.type === 'product' && (
        <div style={{
          borderTop: '1.5px solid var(--border)',
          paddingTop: 18,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {/* En-tête section */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                background: form.trackStock ? 'rgba(45,125,210,0.1)' : 'var(--bg)',
                border: `1.5px solid ${form.trackStock ? 'rgba(45,125,210,0.3)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}>
                <Warehouse size={14} style={{ color: form.trackStock ? 'var(--primary)' : 'var(--text-3)' }} strokeWidth={1.8} aria-hidden />
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
                Gestion du stock
              </span>
            </div>

            {/* Toggle trackStock */}
            <label
              htmlFor={idTrackStock}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            >
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
                {form.trackStock ? 'Activé' : 'Désactivé'}
              </span>
              <input
                id={idTrackStock}
                type="checkbox"
                checked={form.trackStock ?? false}
                onChange={(e) => set('trackStock', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
            </label>
          </div>

          {/* Champs stock — affichés quand trackStock = true */}
          {form.trackStock && (
            <>
              {/* Prix d'achat HT + Unité de stockage */}
              <div style={grid2}>
                <Field
                  label="Prix d'achat HT (XAF)"
                  htmlFor={idPurchasePrice}
                  hint="Sert de base au CMUP (coût moyen pondéré)"
                >
                  <input
                    id={idPurchasePrice}
                    type="number" min="0" step="100"
                    value={form.purchasePriceHt ?? ''}
                    onChange={(e) => set('purchasePriceHt', parseFloat(e.target.value) || undefined)}
                    placeholder="0"
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </Field>
                <Field label="Unité de stockage" htmlFor={idStockUnit}>
                  <select
                    id={idStockUnit}
                    value={form.stockUnit ?? ''}
                    onChange={(e) => set('stockUnit', e.target.value || undefined)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                    onFocus={focusOn} onBlur={focusOff}
                  >
                    <option value="">— Même que l'unité de vente —</option>
                    {STOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
              </div>

              {/* Seuil min + Seuil max */}
              <div style={grid2}>
                <Field
                  label="Seuil minimum"
                  htmlFor={idMinLevel}
                  hint="Alerte stock bas en dessous de ce seuil"
                >
                  <input
                    id={idMinLevel}
                    type="number" min="0" step="1"
                    value={form.stockMinLevel ?? ''}
                    onChange={(e) => set('stockMinLevel', parseFloat(e.target.value) || undefined)}
                    placeholder="0"
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </Field>
                <Field
                  label="Seuil maximum"
                  htmlFor={idMaxLevel}
                  hint="Alerte surstock au-dessus de ce seuil"
                >
                  <input
                    id={idMaxLevel}
                    type="number" min="0" step="1"
                    value={form.stockMaxLevel ?? ''}
                    onChange={(e) => set('stockMaxLevel', parseFloat(e.target.value) || undefined)}
                    placeholder="0"
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </Field>
              </div>

              {/* Quantité initiale — création uniquement */}
              {!isEdit && (
                <Field
                  label="Quantité initiale en stock"
                  htmlFor={idInitialQty}
                  hint="Crée automatiquement un mouvement « Stock initial » si > 0"
                >
                  <input
                    id={idInitialQty}
                    type="number" min="0" step="1"
                    value={initialStockQty || ''}
                    onChange={(e) => setInitialStockQty(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </Field>
              )}

              {/* Quantité actuelle — édition uniquement */}
              {isEdit && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 'var(--radius-md)',
                  background: 'var(--bg)', border: '1px solid var(--border)',
                }}>
                  <Info size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} aria-hidden />
                  <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                    Stock actuel :{' '}
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {Number(product?.stockQuantity ?? 0)}
                    </strong>
                    {(form.stockUnit || product?.unit) && (
                      <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>
                        {form.stockUnit || product?.unit}
                      </span>
                    )}
                    {' '}— géré via le{' '}
                    <a href="/stock/levels" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                      module Stock
                    </a>
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

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

      {/* Actions — masquées quand le parent gère son propre footer (drawer) */}
      {!hideActions && (
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
            disabled={isPending}
            aria-disabled={isPending}
            style={{
              padding: '9px 22px', borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              color: '#fff', border: 'none',
              cursor: isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: isPending ? 0.65 : 1,
              boxShadow: isPending ? 'none' : '0 4px 12px rgba(45,125,210,0.3)',
              transition: 'opacity 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => { if (!isPending) e.currentTarget.style.boxShadow = '0 4px 18px rgba(45,125,210,0.5)' }}
            onMouseLeave={(e) => { if (!isPending) e.currentTarget.style.boxShadow = '0 4px 12px rgba(45,125,210,0.3)' }}
          >
            {isPending && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {isEdit ? 'Enregistrer' : 'Créer le produit'}
          </button>
        </div>
      )}
    </form>
  )
}
