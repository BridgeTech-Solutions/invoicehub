'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useSupplier, useUpdateSupplier } from '@/features/suppliers/hooks'
import { ROUTES } from '@/lib/constants'

const CURRENCIES = ['XAF', 'EUR', 'USD', 'GBP']

export default function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }      = use(params)
  const { data: supplier, isLoading } = useSupplier(id)
  const updateMutation = useUpdateSupplier(id)

  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', city: '', country: 'CM',
    taxNumber: '', rccm: '', website: '', paymentTermDays: 30,
    currency: 'XAF', accountingAccount: '401000', notes: '', isActive: true,
  })
  const [errors, setErrors] = useState<Partial<typeof form>>({})
  const [ready,  setReady]  = useState(false)

  useEffect(() => {
    if (supplier && !ready) {
      setForm({
        name:              supplier.name,
        email:             supplier.email ?? '',
        phone:             supplier.phone ?? '',
        address:           supplier.address ?? '',
        city:              supplier.city ?? '',
        country:           supplier.country ?? 'CM',
        taxNumber:         supplier.taxNumber ?? '',
        rccm:              supplier.rccm ?? '',
        website:           supplier.website ?? '',
        paymentTermDays:   supplier.paymentTermDays,
        currency:          supplier.currency,
        accountingAccount: supplier.accountingAccount ?? '401000',
        notes:             supplier.notes ?? '',
        isActive:          supplier.isActive,
      })
      setReady(true)
    }
  }, [supplier, ready])

  function set(field: keyof typeof form, value: string | number | boolean) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field as keyof typeof errors]) setErrors(e => ({ ...e, [field]: '' }))
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
    updateMutation.mutate({
      name:              form.name.trim(),
      email:             form.email || undefined,
      phone:             form.phone || undefined,
      address:           form.address || undefined,
      city:              form.city || undefined,
      country:           form.country || undefined,
      taxNumber:         form.taxNumber || undefined,
      rccm:              form.rccm || undefined,
      website:           form.website || undefined,
      paymentTermDays:   Number(form.paymentTermDays),
      currency:          form.currency,
      accountingAccount: form.accountingAccount || undefined,
      notes:             form.notes || undefined,
      isActive:          form.isActive,
    })
  }

  const inp = (err?: string): React.CSSProperties => ({
    width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
    border: `1.5px solid ${err ? '#dc2626' : 'var(--border)'}`,
    background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none',
  })
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font-display)' }
  const fld: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 0 }
  const err: React.CSSProperties = { fontSize: 11.5, color: '#dc2626', marginTop: 4 }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820 }}>
        <div style={{ height: 20, width: 160, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div className="card animate-pulse" style={{ height: 400 }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820, animation: 'page-in 0.2s ease' }}>
      <div>
        <Link href={`${ROUTES.SUPPLIERS}/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <ChevronLeft size={14} /> {supplier?.name ?? 'Fournisseur'}
        </Link>
        <PageHeader title="Modifier le fournisseur" description={`Mise à jour de ${supplier?.name ?? ''}`} />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="card" style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Identification</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1', ...fld }}>
                <label style={lbl}>Raison sociale <span style={{ color: '#dc2626' }}>*</span></label>
                <input value={form.name} onChange={e => set('name', e.target.value)} style={inp(errors.name)}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = errors.name ? '#dc2626' : 'var(--border)')} />
                {errors.name && <span style={err} role="alert">{errors.name}</span>}
              </div>
              <div style={fld}>
                <label style={lbl}>NIU</label>
                <input value={form.taxNumber} onChange={e => set('taxNumber', e.target.value)} placeholder="M123456789A"
                  style={inp()} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div style={fld}>
                <label style={lbl}>RCCM</label>
                <input value={form.rccm} onChange={e => set('rccm', e.target.value)} placeholder="RC/DLA/2020/B/12345"
                  style={inp()} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Contact</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={fld}>
                <label style={lbl}>Email</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={inp(errors.email)}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = errors.email ? '#dc2626' : 'var(--border)')} />
                {errors.email && <span style={err} role="alert">{errors.email}</span>}
              </div>
              <div style={fld}>
                <label style={lbl}>Téléphone</label>
                <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+237 6XX XXX XXX"
                  style={inp()} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div style={fld}>
                <label style={lbl}>Adresse</label>
                <input value={form.address} onChange={e => set('address', e.target.value)}
                  style={inp()} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={fld}>
                  <label style={lbl}>Ville</label>
                  <input value={form.city} onChange={e => set('city', e.target.value)}
                    style={inp()} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                </div>
                <div style={fld}>
                  <label style={lbl}>Pays</label>
                  <input value={form.country} onChange={e => set('country', e.target.value)}
                    style={inp()} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                </div>
              </div>
              <div style={fld}>
                <label style={lbl}>Site web</label>
                <input value={form.website} onChange={e => set('website', e.target.value)}
                  style={inp()} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Conditions commerciales</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div style={fld}>
                <label style={lbl}>Délai paiement (jours)</label>
                <input type="number" min={0} max={365} value={form.paymentTermDays} onChange={e => set('paymentTermDays', e.target.value)}
                  style={inp()} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div style={fld}>
                <label style={lbl}>Devise</label>
                <select value={form.currency} onChange={e => set('currency', e.target.value)}
                  style={{ ...inp(), cursor: 'pointer' }}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={fld}>
                <label style={lbl}>Compte SYSCOHADA</label>
                <input value={form.accountingAccount} onChange={e => set('accountingAccount', e.target.value)}
                  style={inp()} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={fld}>
              <label style={lbl}>Notes internes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                style={{ ...inp(), resize: 'vertical', minHeight: 80 }}
                onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <span style={{ fontSize: 13.5, color: 'var(--text-1)' }}>Fournisseur actif</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 4 }}>
            <Link href={`${ROUTES.SUPPLIERS}/${id}`}
              style={{ padding: '9px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
              Annuler
            </Link>
            <button type="submit" disabled={updateMutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 24px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: updateMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: updateMutation.isPending ? 0.7 : 1 }}>
              {updateMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Enregistrer les modifications
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
