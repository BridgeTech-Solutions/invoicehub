'use client'

import { useState } from 'react'
import { Loader2, Building2, User, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { useCreateClient, useUpdateClient } from '../hooks'
import { useAuthStore } from '@/features/auth/store'
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
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

// ─── Field wrapper ────────────────────────────────────────────
function Field({
  label, required, children, span,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  span?: number
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5,
      gridColumn: span ? `span ${span}` : undefined,
    }}>
      <label style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
        fontFamily: 'var(--font-display)', letterSpacing: '0.015em',
        display: 'flex', alignItems: 'center', gap: 3,
      }}>
        {label}
        {required && <span style={{ color: '#ef4444', fontSize: 13, lineHeight: 1 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

export function ClientForm({ client, onClose, wide = false }: ClientFormProps) {
  const isEdit   = !!client
  const { user } = useAuthStore()
  const canSeeInternalNotes = user?.role === 'admin' || user?.role === 'commercial'

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
    bankName:            client?.bankName            ?? '',
    bankAccount:         client?.bankAccount         ?? '',
    defaultPaymentTerms: client?.defaultPaymentTerms ?? '',
    internalNotes:       client?.internalNotes       ?? '',
  })

  const [bankOpen, setBankOpen] = useState(!!(client?.bankName || client?.bankAccount))

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
  const input: React.CSSProperties = {
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
    opts: { type?: string; placeholder?: string; required?: boolean } = {}
  ) => (
    <input
      type={opts.type ?? 'text'}
      value={(form[key] as string) ?? ''}
      onChange={(e) => set(key, e.target.value)}
      placeholder={opts.placeholder}
      required={opts.required}
      style={input}
      {...focus}
    />
  )

  const grid2: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
  }

  // ─── Reusable section block ──────────────────────────────────
  const typeToggle = (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 4,
      background: 'var(--surface-2)', borderRadius: 'calc(var(--radius-md) + 4px)',
      border: '1px solid var(--border)',
    }}>
      {([
        { value: 'company',    label: 'Entreprise', Icon: Building2 },
        { value: 'individual', label: 'Particulier', Icon: User },
      ] as const).map(({ value, label, Icon }) => {
        const active = form.type === value
        return (
          <button key={value} type="button" onClick={() => set('type', value)}
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
            <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
            {label}
          </button>
        )
      })}
    </div>
  )

  const sectionIdentite = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionTitle>Identité &amp; contact</SectionTitle>
      <Field label="Nom / Raison sociale" required>
        {inp('name', { required: true, placeholder: form.type === 'company' ? 'SABC Cameroun SA' : 'Jean-Pierre Kamga' })}
      </Field>
      <div style={grid2}>
        <Field label="Email">
          {inp('email', { type: 'email', placeholder: 'contact@client.cm' })}
        </Field>
        <Field label="Téléphone principal">
          {inp('phone', { type: 'tel', placeholder: '+237 6XX XX XX XX' })}
        </Field>
        <Field label="Téléphone secondaire">
          {inp('phone2', { type: 'tel', placeholder: '+237 6XX XX XX XX' })}
        </Field>
      </div>
    </div>
  )

  const sectionLocalisation = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionTitle>Localisation</SectionTitle>
      <div style={grid2}>
        <Field label="Ville">{inp('city', { placeholder: 'Douala' })}</Field>
        <Field label="Pays">{inp('country', { placeholder: 'Cameroun' })}</Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
        <Field label="Boîte postale">{inp('postalBox', { placeholder: 'BP 1234' })}</Field>
        <Field label="Adresse">
          <input type="text" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)}
            placeholder="Rue, Quartier…" style={input} {...focus} />
        </Field>
      </div>
    </div>
  )

  const sectionLegal = form.type === 'company' ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionTitle>Informations légales</SectionTitle>
      <div style={grid2}>
        <Field label="Numéro fiscal">{inp('taxNumber', { placeholder: 'M081234567890A' })}</Field>
        <Field label="RCCM">{inp('rccm', { placeholder: 'RC/DLA/2020/B/0001' })}</Field>
      </div>
    </div>
  ) : null

  const sectionBanque = (
    <div style={{ borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', overflow: 'hidden' }}>
      <button type="button" onClick={() => setBankOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: bankOpen ? 'var(--surface-2)' : 'transparent',
          border: 'none', cursor: 'pointer', transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { if (!bankOpen) e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={(e) => { if (!bankOpen) e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
          Coordonnées bancaires
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {(form.bankName || form.bankAccount) && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: 'rgba(45,125,210,0.1)', color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>
              Renseigné
            </span>
          )}
          {bankOpen ? <ChevronUp size={14} style={{ color: 'var(--text-3)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-3)' }} />}
        </span>
      </button>
      {bankOpen && (
        <div style={{ padding: '14px', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--surface)' }}>
          <Field label="Établissement bancaire">{inp('bankName', { placeholder: 'BICEC, SCB Cameroun…' })}</Field>
          <Field label="Numéro de compte">{inp('bankAccount', { placeholder: '01234-56789-00000-00' })}</Field>
        </div>
      )}
    </div>
  )

  const sectionConditions = (
    <Field label="Conditions de paiement par défaut">
      <textarea value={form.defaultPaymentTerms ?? ''} onChange={(e) => set('defaultPaymentTerms', e.target.value)}
        placeholder="Ex : Paiement à 30 jours fin de mois, virement bancaire uniquement"
        rows={2} style={{ ...input, resize: 'vertical', lineHeight: 1.6 }} {...focus} />
    </Field>
  )

  const sectionNotes = canSeeInternalNotes ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px', background: 'rgba(245,158,11,0.04)', border: '1.5px solid rgba(245,158,11,0.25)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Lock size={11} style={{ color: '#d97706' }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#d97706', fontFamily: 'var(--font-display)' }}>
          Notes internes — confidentiel
        </span>
      </div>
      <textarea value={form.internalNotes ?? ''} onChange={(e) => set('internalNotes', e.target.value)}
        placeholder="Informations confidentielles réservées au staff"
        rows={2}
        style={{ ...input, resize: 'vertical', lineHeight: 1.6, background: 'rgba(245,158,11,0.03)', borderColor: form.internalNotes ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.2)' }}
        onFocus={(e) => { e.target.style.borderColor = '#f59e0b'; e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.12)' }}
        onBlur={(e)  => { e.target.style.borderColor = form.internalNotes ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.2)'; e.target.style.boxShadow = 'none' }}
      />
      <p style={{ fontSize: 11, color: '#b45309', margin: 0 }}>Visible uniquement par les administrateurs et commerciaux.</p>
    </div>
  ) : null

  const actions = (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
      {onClose && (
        <button type="button" onClick={onClose}
          style={{ padding: '9px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)';  e.currentTarget.style.color = 'var(--text-2)' }}
        >
          Annuler
        </button>
      )}
      <button type="submit" disabled={mutation.isPending}
        style={{ padding: '9px 24px', borderRadius: 'var(--radius-md)', background: mutation.isPending ? '#93b8e0' : 'var(--primary)', color: '#fff', border: 'none', cursor: mutation.isPending ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 7, boxShadow: mutation.isPending ? 'none' : '0 2px 12px rgba(45,125,210,0.35)', transition: 'box-shadow 0.15s' }}
        onMouseEnter={(e) => { if (!mutation.isPending) e.currentTarget.style.boxShadow = '0 4px 18px rgba(45,125,210,0.5)' }}
        onMouseLeave={(e) => { if (!mutation.isPending) e.currentTarget.style.boxShadow = '0 2px 12px rgba(45,125,210,0.35)' }}
      >
        {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
        {isEdit ? 'Enregistrer les modifications' : 'Créer le client'}
      </button>
    </div>
  )

  // ─── Layout narrow (modal) ────────────────────────────────────
  if (!wide) {
    return (
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {typeToggle}
        {sectionIdentite}
        {sectionLocalisation}
        {sectionLegal}
        {sectionBanque}
        {sectionConditions}
        {sectionNotes}
        {actions}
      </form>
    )
  }

  // ─── Layout wide (page dédiée) — 2 colonnes ───────────────────
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Type toggle — pleine largeur */}
      <div style={{ maxWidth: 360 }}>
        {typeToggle}
      </div>

      {/* 2 colonnes : Identité | Localisation */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' }}>
        {sectionIdentite}
        {sectionLocalisation}
      </div>

      {/* Légal + Banque côte à côte si company, sinon banque pleine largeur */}
      {form.type === 'company' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' }}>
          {sectionLegal}
          {sectionBanque}
        </div>
      ) : (
        sectionBanque
      )}

      {/* Conditions + Notes côte à côte */}
      {canSeeInternalNotes ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' }}>
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
