'use client'

import { useState, useId } from 'react'
import { Loader2, Building2, User, Lock, AlertCircle } from 'lucide-react'
import { useCreateClient, useUpdateClient } from '../hooks'
import { usePermission } from '@/hooks/usePermission'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { Client, CreateClientPayload } from '../types'

interface ClientFormProps {
  client?: Client
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

export function ClientForm({ client, onClose, wide = false }: ClientFormProps) {
  const isEdit  = !!client
  const { can } = usePermission()
  const isMobile = useIsMobile()
  const canSeeInternalNotes      = can('client', 'update')
  const canEditAccountingAccount = can('accounting', 'update')

  // ─── Unique IDs for label/input association ──────────────────
  const idName            = useId()
  const idEmail           = useId()
  const idPhone           = useId()
  const idPhone2          = useId()
  const idCity            = useId()
  const idCountry         = useId()
  const idPostalBox       = useId()
  const idAddress         = useId()
  const idTaxNumber       = useId()
  const idRccm            = useId()
  const idPaymentTerms        = useId()
  const idInternalNotes       = useId()
  const idAccountingAccount   = useId()
  const typeGroupId           = useId()

  const [form, setForm] = useState<CreateClientPayload>({
    name:                client?.name                ?? '',
    type:                client?.type                ?? 'company',
    email:               client?.email               ?? '',
    phone:               client?.phone               ?? '',
    phone2:              client?.phone2              ?? '',
    city:                client?.city                ?? '',
    country:             client?.country             ?? 'Cameroun',
    address:             client?.address             ?? '',
    postalBox:           client?.postalBox           ?? '',
    taxNumber:           client?.taxNumber           ?? '',
    rccm:                client?.rccm                ?? '',
    accountingAccount:   client?.accountingAccount   ?? '',
    defaultPaymentTerms: client?.defaultPaymentTerms ?? '',
    internalNotes:       client?.internalNotes       ?? '',
  })

  const createMutation = useCreateClient()
  const updateMutation = useUpdateClient(client?.id ?? '')
  const mutation = isEdit ? updateMutation : createMutation

  const set = (field: keyof CreateClientPayload, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, v]) => v !== '')
    ) as CreateClientPayload
    if (isEdit) {
      updateMutation.mutate(payload, { onSuccess: onClose })
    } else {
      createMutation.mutate(payload)
    }
  }

  // ─── Shared input styles ────────────────────────────────────
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
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.target.style.borderColor = 'var(--primary)'
      e.target.style.boxShadow   = '0 0 0 3px var(--primary-light)'
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.target.style.borderColor = 'var(--border)'
      e.target.style.boxShadow   = 'none'
    },
  }

  const inp = (
    key: keyof CreateClientPayload,
    opts: { type?: string; placeholder?: string; required?: boolean; id?: string } = {}
  ) => (
    <input
      id={opts.id}
      type={opts.type ?? 'text'}
      value={(form[key] as string) ?? ''}
      onChange={(e) => set(key, e.target.value)}
      placeholder={opts.placeholder}
      required={opts.required}
      aria-required={opts.required}
      style={inputStyle}
      {...focus}
    />
  )

  const grid2: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
    gap: 12,
  }

  // ─── Type toggle ─────────────────────────────────────────────
  const typeToggle = (
    <div
      id={typeGroupId}
      role="radiogroup"
      aria-label="Type de client"
      style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 4,
        background: 'var(--surface-2)', borderRadius: 'calc(var(--radius-md) + 4px)',
        border: '1px solid var(--border)',
      }}
    >
      {([
        { value: 'company',    label: 'Entreprise', Icon: Building2 },
        { value: 'individual', label: 'Particulier', Icon: User },
      ] as const).map(({ value, label, Icon }) => {
        const active = form.type === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => set('type', value)}
            style={{
              padding: '10px 16px', borderRadius: 'var(--radius-md)',
              border: active ? '1.5px solid var(--primary)' : '1.5px solid transparent',
              background: active ? 'var(--surface)' : 'transparent',
              boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 13.5, fontWeight: active ? 600 : 400,
              color: active ? 'var(--primary)' : 'var(--text-3)',
              fontFamily: 'var(--font-display)', transition: 'all 0.15s',
            }}
          >
            <Icon size={15} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
            {label}
          </button>
        )
      })}
    </div>
  )

  // ─── Identité section ────────────────────────────────────────
  const sectionIdentite = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionTitle>Identité &amp; contact</SectionTitle>
      <Field label="Nom / Raison sociale" required htmlFor={idName}>
        {inp('name', { required: true, id: idName, placeholder: form.type === 'company' ? 'SABC Cameroun SA' : 'Jean-Pierre Kamga' })}
      </Field>
      <div style={grid2}>
        <Field label="Email" htmlFor={idEmail}>
          {inp('email', { type: 'email', id: idEmail, placeholder: 'contact@client.cm' })}
        </Field>
        <Field label="Téléphone principal" htmlFor={idPhone}>
          {inp('phone', { type: 'tel', id: idPhone, placeholder: '+237 6XX XX XX XX' })}
        </Field>
        <Field label="Téléphone secondaire" htmlFor={idPhone2}>
          {inp('phone2', { type: 'tel', id: idPhone2, placeholder: '+237 6XX XX XX XX' })}
        </Field>
      </div>
    </div>
  )

  // ─── Localisation section ────────────────────────────────────
  const sectionLocalisation = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionTitle>Localisation</SectionTitle>
      <div style={grid2}>
        <Field label="Ville" htmlFor={idCity}>{inp('city', { id: idCity, placeholder: 'Douala' })}</Field>
        <Field label="Pays" htmlFor={idCountry}>{inp('country', { id: idCountry, placeholder: 'Cameroun' })}</Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: 12 }}>
        <Field label="Boîte postale" htmlFor={idPostalBox}>{inp('postalBox', { id: idPostalBox, placeholder: 'BP 1234' })}</Field>
        <Field label="Adresse" htmlFor={idAddress}>
          {inp('address', { id: idAddress, placeholder: 'Rue, Quartier…' })}
        </Field>
      </div>
    </div>
  )

  // ─── Accounting account field (read-only si pas de droit accounting:update) ──
  const accountingAccountField = (
    <Field label="Compte comptable (SYSCOHADA)" htmlFor={idAccountingAccount}>
      {canEditAccountingAccount ? (
        inp('accountingAccount', { id: idAccountingAccount, placeholder: '4111' })
      ) : (
        <div style={{
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          border: '1.5px solid var(--border)',
          background: 'var(--surface-2)',
          fontSize: 13.5,
          color: form.accountingAccount ? 'var(--text-2)' : 'var(--text-3)',
          fontFamily: 'var(--font-body)',
        }}>
          {form.accountingAccount || '—'}
        </div>
      )}
    </Field>
  )

  // ─── Legal section ───────────────────────────────────────────
  const sectionLegal = form.type === 'company' ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionTitle>Informations légales</SectionTitle>
      <div style={grid2}>
        <Field label="Numéro fiscal" htmlFor={idTaxNumber}>{inp('taxNumber', { id: idTaxNumber, placeholder: 'M081234567890A' })}</Field>
        <Field label="RCCM" htmlFor={idRccm}>{inp('rccm', { id: idRccm, placeholder: 'RC/DLA/2020/B/0001' })}</Field>
      </div>
      {accountingAccountField}
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionTitle>Comptabilité</SectionTitle>
      {accountingAccountField}
    </div>
  )

  // ─── Conditions section ──────────────────────────────────────
  const sectionConditions = (
    <Field label="Conditions de paiement par défaut" htmlFor={idPaymentTerms}>
      <textarea
        id={idPaymentTerms}
        value={form.defaultPaymentTerms ?? ''}
        onChange={(e) => set('defaultPaymentTerms', e.target.value)}
        placeholder="Ex : Paiement à 30 jours fin de mois, virement bancaire uniquement"
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
        {...focus}
      />
    </Field>
  )

  // ─── Notes section ───────────────────────────────────────────
  const sectionNotes = canSeeInternalNotes ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px', background: 'rgba(245,158,11,0.04)', border: '1.5px solid rgba(245,158,11,0.25)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Lock size={11} aria-hidden style={{ color: '#d97706' }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#d97706', fontFamily: 'var(--font-display)' }}>
          Notes internes — confidentiel
        </span>
      </div>
      <Field label="Notes internes" htmlFor={idInternalNotes}>
        <textarea
          id={idInternalNotes}
          value={form.internalNotes ?? ''}
          onChange={(e) => set('internalNotes', e.target.value)}
          placeholder="Informations confidentielles réservées au staff"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, background: 'rgba(245,158,11,0.03)', borderColor: form.internalNotes ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.2)' }}
          onFocus={(e) => { e.target.style.borderColor = '#f59e0b'; e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.12)' }}
          onBlur={(e)  => { e.target.style.borderColor = form.internalNotes ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.2)'; e.target.style.boxShadow = 'none' }}
        />
      </Field>
      <p style={{ fontSize: 11, color: '#b45309', margin: 0 }}>Visible uniquement par les administrateurs et commerciaux.</p>
    </div>
  ) : null

  // ─── Error banner ────────────────────────────────────────────
  const errorBanner = mutation.isError ? (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.25)', color: '#dc2626' }}>
      <AlertCircle size={14} aria-hidden />
      <span style={{ fontSize: 13 }}>
        {isEdit ? 'Erreur lors de la mise à jour du client.' : 'Erreur lors de la création du client.'} Veuillez réessayer.
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
          padding: '9px 24px', borderRadius: 'var(--radius-md)',
          background: 'var(--primary)', color: '#fff', border: 'none',
          cursor: mutation.isPending ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
          display: 'flex', alignItems: 'center', gap: 7,
          opacity: mutation.isPending ? 0.65 : 1,
          boxShadow: mutation.isPending ? 'none' : '0 2px 12px rgba(45,125,210,0.35)',
          transition: 'opacity 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={(e) => { if (!mutation.isPending) e.currentTarget.style.boxShadow = '0 4px 18px rgba(45,125,210,0.5)' }}
        onMouseLeave={(e) => { if (!mutation.isPending) e.currentTarget.style.boxShadow = '0 2px 12px rgba(45,125,210,0.35)' }}
      >
        {mutation.isPending && <Loader2 size={14} className="animate-spin" aria-hidden />}
        {isEdit ? 'Enregistrer les modifications' : 'Créer le client'}
      </button>
    </div>
  )

  // ─── Layout narrow (modal) ────────────────────────────────────
  if (!wide) {
    return (
      <form
        onSubmit={handleSubmit}
        aria-busy={mutation.isPending}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
      >
        {errorBanner}
        {typeToggle}
        {sectionIdentite}
        {sectionLocalisation}
        {sectionLegal}
        {sectionConditions}
        {sectionNotes}
        {actions}
      </form>
    )
  }

  // ─── Layout wide (page dédiée) — responsive ───────────────────
  const col2: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
    gap: isMobile ? 20 : 32,
    alignItems: 'start',
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={mutation.isPending}
      noValidate
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {errorBanner}

      {/* Type toggle — pleine largeur */}
      <div style={{ maxWidth: isMobile ? '100%' : 360 }}>
        {typeToggle}
      </div>

      {/* Identité | Localisation */}
      <div style={col2}>
        {sectionIdentite}
        {sectionLocalisation}
      </div>

      {/* Légal + Comptabilité */}
      {sectionLegal}

      {/* Conditions + Notes côte à côte */}
      {canSeeInternalNotes ? (
        <div style={col2}>
          {sectionConditions}
          {sectionNotes}
        </div>
      ) : (
        sectionConditions
      )}

      {actions}
    </form>
  )
}
