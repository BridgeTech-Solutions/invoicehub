'use client'

import { useState, useId } from 'react'
import { Loader2, AlertCircle, Lock } from 'lucide-react'
import { useCreateSupplier, useUpdateSupplier } from '../hooks'
import { usePermission } from '@/hooks/usePermission'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { Supplier, CreateSupplierPayload } from '../types'

const CURRENCIES = ['XAF', 'EUR', 'USD', 'GBP']

interface SupplierFormProps {
  supplier?: Supplier
  onClose?: () => void
  /** wide=true : layout 2 colonnes pour page dédiée (pas modal) */
  wide?: boolean
}

// ─── Section divider with label ──────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 2px' }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--text-3)',
        fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
      }}>
        {children}
      </span>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

// ─── Field wrapper ────────────────────────────────────────────
function Field({
  label, required, children, span, htmlFor,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  span?: number
  htmlFor?: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5,
      gridColumn: span ? `span ${span}` : undefined,
    }}>
      <label htmlFor={htmlFor} style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
        fontFamily: 'var(--font-display)', letterSpacing: '0.015em',
        display: 'flex', alignItems: 'center', gap: 3,
      }}>
        {label}
        {required && <span aria-hidden="true" style={{ color: '#ef4444', fontSize: 13, lineHeight: 1 }}>*</span>}
        {required && <span className="sr-only">(obligatoire)</span>}
      </label>
      {children}
    </div>
  )
}

type FormState = {
  name:               string
  email:              string
  phone:              string
  address:            string
  city:               string
  country:            string
  taxNumber:          string
  rccm:               string
  website:            string
  paymentTermDays:    number
  currency:           string
  accountingAccount:  string
  notes:              string
  isActive:           boolean
}

export function SupplierForm({ supplier, onClose, wide = false }: SupplierFormProps) {
  const isEdit  = !!supplier
  const { can } = usePermission()
  const isMobile = useIsMobile()
  const canSeeInternalNotes = can('client', 'update')

  // ─── Unique IDs ──────────────────────────────────────────────
  const idName              = useId()
  const idEmail             = useId()
  const idPhone             = useId()
  const idAddress           = useId()
  const idCity              = useId()
  const idCountry           = useId()
  const idTaxNumber         = useId()
  const idRccm              = useId()
  const idWebsite           = useId()
  const idPaymentTermDays   = useId()
  const idCurrency          = useId()
  const idAccountingAccount = useId()
  const idNotes             = useId()

  const [form, setForm] = useState<FormState>({
    name:              supplier?.name               ?? '',
    email:             supplier?.email              ?? '',
    phone:             supplier?.phone              ?? '',
    address:           supplier?.address            ?? '',
    city:              supplier?.city               ?? '',
    country:           supplier?.country            ?? 'CM',
    taxNumber:         supplier?.taxNumber          ?? '',
    rccm:              supplier?.rccm               ?? '',
    website:           supplier?.website            ?? '',
    paymentTermDays:   supplier?.paymentTermDays    ?? 30,
    currency:          supplier?.currency           ?? 'XAF',
    accountingAccount: supplier?.accountingAccount  ?? '401000',
    notes:             supplier?.notes              ?? '',
    isActive:          supplier?.isActive           ?? true,
  })

  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  const createMutation = useCreateSupplier()
  const updateMutation = useUpdateSupplier(supplier?.id ?? '')
  const mutation = isEdit ? updateMutation : createMutation

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }))
  }

  function validate() {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.name.trim()) e.name = 'La raison sociale est requise'
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email invalide'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const payload: CreateSupplierPayload = {
      name:              form.name.trim(),
      email:             form.email              || undefined,
      phone:             form.phone              || undefined,
      address:           form.address            || undefined,
      city:              form.city               || undefined,
      country:           form.country            || undefined,
      taxNumber:         form.taxNumber          || undefined,
      rccm:              form.rccm               || undefined,
      website:           form.website            || undefined,
      paymentTermDays:   Number(form.paymentTermDays),
      currency:          form.currency,
      accountingAccount: form.accountingAccount  || undefined,
      notes:             form.notes              || undefined,
    }
    if (isEdit) {
      updateMutation.mutate({ ...payload, isActive: form.isActive }, { onSuccess: onClose })
    } else {
      createMutation.mutate(payload)
    }
  }

  // ─── Shared input styles ─────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)',
    background: 'var(--surface)',
    fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none',
    boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  const focus = {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      e.target.style.borderColor = errors[e.target.name as keyof FormState] ? '#ef4444' : 'var(--primary)'
      e.target.style.boxShadow   = '0 0 0 3px var(--primary-light)'
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      e.target.style.borderColor = errors[e.target.name as keyof FormState] ? '#ef4444' : 'var(--border)'
      e.target.style.boxShadow   = 'none'
    },
  }

  const grid2: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
    gap: 12,
  }

  // ─── Identification ──────────────────────────────────────────
  const sectionIdentification = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionTitle>Identification</SectionTitle>
      <Field label="Raison sociale" required htmlFor={idName}>
        <input
          id={idName} name="name"
          value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="Ex : Société Générale de Fournitures"
          required aria-required
          style={{ ...inputStyle, borderColor: errors.name ? '#ef4444' : 'var(--border)' }}
          {...focus}
        />
        {errors.name && (
          <span role="alert" style={{ fontSize: 11.5, color: '#ef4444', marginTop: 2 }}>
            {errors.name}
          </span>
        )}
      </Field>
      <div style={grid2}>
        <Field label="NIU" htmlFor={idTaxNumber}>
          <input id={idTaxNumber} name="taxNumber" value={form.taxNumber}
            onChange={e => set('taxNumber', e.target.value)}
            placeholder="M123456789A" style={inputStyle} {...focus} />
        </Field>
        <Field label="RCCM" htmlFor={idRccm}>
          <input id={idRccm} name="rccm" value={form.rccm}
            onChange={e => set('rccm', e.target.value)}
            placeholder="RC/DLA/2020/B/12345" style={inputStyle} {...focus} />
        </Field>
      </div>
    </div>
  )

  // ─── Contact & Localisation ──────────────────────────────────
  const sectionContact = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionTitle>Contact &amp; localisation</SectionTitle>
      <div style={grid2}>
        <Field label="Email" htmlFor={idEmail}>
          <input id={idEmail} name="email" type="email" value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="contact@fournisseur.cm"
            style={{ ...inputStyle, borderColor: errors.email ? '#ef4444' : 'var(--border)' }}
            {...focus} />
          {errors.email && (
            <span role="alert" style={{ fontSize: 11.5, color: '#ef4444', marginTop: 2 }}>
              {errors.email}
            </span>
          )}
        </Field>
        <Field label="Téléphone" htmlFor={idPhone}>
          <input id={idPhone} name="phone" type="tel" value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="+237 6XX XXX XXX" style={inputStyle} {...focus} />
        </Field>
        <Field label="Adresse" htmlFor={idAddress}>
          <input id={idAddress} name="address" value={form.address}
            onChange={e => set('address', e.target.value)}
            placeholder="Rue, Quartier…" style={inputStyle} {...focus} />
        </Field>
        <Field label="Site web" htmlFor={idWebsite}>
          <input id={idWebsite} name="website" type="url" value={form.website}
            onChange={e => set('website', e.target.value)}
            placeholder="https://…" style={inputStyle} {...focus} />
        </Field>
        <Field label="Ville" htmlFor={idCity}>
          <input id={idCity} name="city" value={form.city}
            onChange={e => set('city', e.target.value)}
            placeholder="Douala" style={inputStyle} {...focus} />
        </Field>
        <Field label="Pays" htmlFor={idCountry}>
          <input id={idCountry} name="country" value={form.country}
            onChange={e => set('country', e.target.value)}
            placeholder="CM" style={inputStyle} {...focus} />
        </Field>
      </div>
    </div>
  )

  // ─── Conditions commerciales ─────────────────────────────────
  const sectionConditions = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionTitle>Conditions commerciales</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
        <Field label="Délai de paiement (jours)" htmlFor={idPaymentTermDays}>
          <input id={idPaymentTermDays} name="paymentTermDays" type="number" min={0} max={365}
            value={form.paymentTermDays}
            onChange={e => set('paymentTermDays', Number(e.target.value))}
            placeholder="30" style={inputStyle} {...focus} />
        </Field>
        <Field label="Devise" htmlFor={idCurrency}>
          <select id={idCurrency} name="currency" value={form.currency}
            onChange={e => set('currency', e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
            {...focus}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Compte SYSCOHADA" htmlFor={idAccountingAccount}>
          <input id={idAccountingAccount} name="accountingAccount" value={form.accountingAccount}
            onChange={e => set('accountingAccount', e.target.value)}
            placeholder="401000" style={inputStyle} {...focus} />
        </Field>
      </div>
    </div>
  )

  // ─── Notes internes ──────────────────────────────────────────
  const sectionNotes = canSeeInternalNotes ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px', background: 'rgba(245,158,11,0.04)', border: '1.5px solid rgba(245,158,11,0.25)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Lock size={11} aria-hidden style={{ color: '#d97706' }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#d97706', fontFamily: 'var(--font-display)' }}>
          Notes internes — confidentiel
        </span>
      </div>
      <Field label="Notes internes" htmlFor={idNotes}>
        <textarea
          id={idNotes}
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Informations confidentielles réservées au staff"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, background: 'rgba(245,158,11,0.03)', borderColor: form.notes ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.2)' }}
          onFocus={e => { e.target.style.borderColor = '#f59e0b'; e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.12)' }}
          onBlur={e  => { e.target.style.borderColor = form.notes ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.2)'; e.target.style.boxShadow = 'none' }}
        />
      </Field>
      <p style={{ fontSize: 11, color: '#b45309', margin: 0 }}>Visible uniquement par les administrateurs et commerciaux.</p>
    </div>
  ) : null

  // ─── Statut (edit only) ──────────────────────────────────────
  const sectionStatut = isEdit ? (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', width: 'fit-content' }}>
      <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)}
        style={{ width: 16, height: 16, cursor: 'pointer' }} />
      <span style={{ fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)' }}>
        Fournisseur actif
      </span>
    </label>
  ) : null

  // ─── Error banner ────────────────────────────────────────────
  const errorBanner = mutation.isError ? (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.25)', color: '#dc2626' }}>
      <AlertCircle size={14} aria-hidden />
      <span style={{ fontSize: 13 }}>
        {isEdit ? 'Erreur lors de la mise à jour.' : 'Erreur lors de la création.'} Veuillez réessayer.
      </span>
    </div>
  ) : null

  // ─── Actions ─────────────────────────────────────────────────
  const actions = (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{ padding: '9px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)';  e.currentTarget.style.color = 'var(--text-2)' }}
        >
          Annuler
        </button>
      )}
      <button
        type="submit"
        disabled={mutation.isPending}
        aria-disabled={mutation.isPending}
        style={{
          padding: '9px 24px', borderRadius: 'var(--radius-md)',
          background: 'var(--primary)', color: '#fff', border: 'none',
          cursor: mutation.isPending ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
          display: 'flex', alignItems: 'center', gap: 7,
          opacity: mutation.isPending ? 0.65 : 1,
          boxShadow: mutation.isPending ? 'none' : '0 2px 12px rgba(45,125,210,0.35)',
          transition: 'opacity 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { if (!mutation.isPending) e.currentTarget.style.boxShadow = '0 4px 18px rgba(45,125,210,0.5)' }}
        onMouseLeave={e => { if (!mutation.isPending) e.currentTarget.style.boxShadow = '0 2px 12px rgba(45,125,210,0.35)' }}
      >
        {mutation.isPending && <Loader2 size={14} className="animate-spin" aria-hidden />}
        {isEdit ? 'Enregistrer les modifications' : 'Créer le fournisseur'}
      </button>
    </div>
  )

  // ─── Layout narrow (modal) ───────────────────────────────────
  if (!wide) {
    return (
      <form onSubmit={handleSubmit} aria-busy={mutation.isPending} noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {errorBanner}
        {sectionIdentification}
        {sectionContact}
        {sectionConditions}
        {sectionNotes}
        {sectionStatut}
        {actions}
      </form>
    )
  }

  // ─── Layout wide (page dédiée) ───────────────────────────────
  const col2: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
    gap: isMobile ? 20 : 32,
    alignItems: 'start',
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={mutation.isPending} noValidate
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {errorBanner}

      {/* Identification | Contact */}
      <div style={col2}>
        {sectionIdentification}
        {sectionContact}
      </div>

      {/* Conditions commerciales */}
      {sectionConditions}

      {/* Notes + statut */}
      {canSeeInternalNotes ? (
        <div style={col2}>
          {sectionNotes}
          {sectionStatut && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: isMobile ? 0 : 4 }}>
              {sectionStatut}
            </div>
          )}
        </div>
      ) : (
        <>
          {sectionNotes}
          {sectionStatut}
        </>
      )}

      {actions}
    </form>
  )
}
