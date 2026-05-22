'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCreateSupplier } from '@/features/suppliers/hooks'
import { ROUTES } from '@/lib/constants'

const CURRENCIES = ['XAF', 'EUR', 'USD', 'GBP']

export default function NewSupplierPage() {
  const createMutation = useCreateSupplier()

  const [form, setForm] = useState({
    name:               '',
    email:              '',
    phone:              '',
    address:            '',
    city:               '',
    country:            'CM',
    taxNumber:          '',
    rccm:               '',
    website:            '',
    paymentTermDays:    30,
    currency:           'XAF',
    accountingAccount:  '401000',
    notes:              '',
  })
  const [errors, setErrors] = useState<Partial<typeof form>>({})

  function set(field: keyof typeof form, value: string | number) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }))
  }

  function validate() {
    const e: Partial<typeof form> = {}
    if (!form.name.trim()) e.name = 'Le nom est requis'
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email invalide'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    createMutation.mutate({
      name:               form.name.trim(),
      email:              form.email || undefined,
      phone:              form.phone || undefined,
      address:            form.address || undefined,
      city:               form.city || undefined,
      country:            form.country || undefined,
      taxNumber:          form.taxNumber || undefined,
      rccm:               form.rccm || undefined,
      website:            form.website || undefined,
      paymentTermDays:    Number(form.paymentTermDays),
      currency:           form.currency,
      accountingAccount:  form.accountingAccount || undefined,
      notes:              form.notes || undefined,
    })
  }

  const inputStyle = (err?: string): React.CSSProperties => ({
    width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
    border: `1.5px solid ${err ? '#dc2626' : 'var(--border)'}`,
    background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none',
  })
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font-display)' }
  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 0 }
  const errStyle:   React.CSSProperties = { fontSize: 11.5, color: '#dc2626', marginTop: 4 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820, animation: 'page-in 0.2s ease' }}>
      <div>
        <Link href={ROUTES.SUPPLIERS} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <ChevronLeft size={14} /> Fournisseurs
        </Link>
        <PageHeader title="Nouveau fournisseur" description="Ajoutez un fournisseur à votre répertoire" />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="card" style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Identification */}
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
              Identification
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1', ...fieldStyle }}>
                <label style={labelStyle}>Raison sociale <span style={{ color: '#dc2626' }}>*</span></label>
                <input value={form.name} onChange={e => set('name', e.target.value)}
                  style={inputStyle(errors.name)} placeholder="Ex : Société Générale de Fournitures"
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = errors.name ? '#dc2626' : 'var(--border)')} />
                {errors.name && <span style={errStyle} role="alert">{errors.name}</span>}
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>NIU</label>
                <input value={form.taxNumber} onChange={e => set('taxNumber', e.target.value)}
                  style={inputStyle()} placeholder="Ex : M123456789A"
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>RCCM</label>
                <input value={form.rccm} onChange={e => set('rccm', e.target.value)}
                  style={inputStyle()} placeholder="Ex : RC/DLA/2020/B/12345"
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Contact */}
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
              Contact
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Email</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                  style={inputStyle(errors.email)} placeholder="contact@fournisseur.cm"
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = errors.email ? '#dc2626' : 'var(--border)')} />
                {errors.email && <span style={errStyle} role="alert">{errors.email}</span>}
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Téléphone</label>
                <input value={form.phone} onChange={e => set('phone', e.target.value)}
                  style={inputStyle()} placeholder="+237 6XX XXX XXX"
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Adresse</label>
                <input value={form.address} onChange={e => set('address', e.target.value)}
                  style={inputStyle()} placeholder="Rue, Quartier…"
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Ville</label>
                  <input value={form.city} onChange={e => set('city', e.target.value)}
                    style={inputStyle()} placeholder="Douala"
                    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Pays</label>
                  <input value={form.country} onChange={e => set('country', e.target.value)}
                    style={inputStyle()} placeholder="CM"
                    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
                </div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Site web</label>
                <input value={form.website} onChange={e => set('website', e.target.value)}
                  style={inputStyle()} placeholder="https://…"
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Conditions commerciales */}
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
              Conditions commerciales
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Délai de paiement (jours)</label>
                <input type="number" min={0} max={365} value={form.paymentTermDays} onChange={e => set('paymentTermDays', e.target.value)}
                  style={inputStyle()} placeholder="30"
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Devise</label>
                <select value={form.currency} onChange={e => set('currency', e.target.value)}
                  style={{ ...inputStyle(), cursor: 'pointer' }}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Compte SYSCOHADA</label>
                <input value={form.accountingAccount} onChange={e => set('accountingAccount', e.target.value)}
                  style={inputStyle()} placeholder="401000"
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Notes */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Notes internes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3} placeholder="Informations complémentaires…"
              style={{ ...inputStyle(), resize: 'vertical', minHeight: 80 }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 4 }}>
            <Link href={ROUTES.SUPPLIERS}
              style={{ padding: '9px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
              Annuler
            </Link>
            <button type="submit" disabled={createMutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 24px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: createMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.3)', opacity: createMutation.isPending ? 0.7 : 1 }}>
              {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Enregistrer le fournisseur
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
