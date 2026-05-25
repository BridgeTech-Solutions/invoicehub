'use client'

import { useState, useEffect, useId } from 'react'
import { Building2, MapPin, Loader2, Check } from 'lucide-react'
import { useSettings, useUpdateSettings } from '@/features/settings/hooks'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import type { UpdateSettingsPayload } from '@/features/settings/types'

// ─── Shared styles ────────────────────────────────────────────
const inputCss: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

function Label({ children, htmlFor, required }: { children: React.ReactNode; htmlFor: string; required?: boolean }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}
    >
      {children}
      {required && (
        <>
          <span aria-hidden="true" style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
          <span className="sr-only"> (obligatoire)</span>
        </>
      )}
    </label>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      <div aria-hidden="true" style={{ color: 'var(--primary)' }}>{icon}</div>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function CompanySettingsPage() {
  const { can }   = usePermission()
  const { data: settings, isLoading } = useSettings()
  const updateMut = useUpdateSettings()
  const isMobile  = useIsMobile()

  const [form, setForm] = useState<UpdateSettingsPayload>({})
  const [dirty, setDirty] = useState(false)

  // Field IDs
  const uid = useId()
  const id  = (s: string) => `${uid}-${s}`

  // Initialise form once loaded
  useEffect(() => {
    if (!settings) return
    setForm({
      companyName: settings.companyName,
      legalForm:   settings.legalForm ?? '',
      taxNumber:   settings.taxNumber ?? '',
      rccm:        settings.rccm      ?? '',
      companyCode: settings.companyCode,
      address:     settings.address,
      city:        settings.city    ?? '',
      country:     settings.country ?? '',
      postalBox:   settings.postalBox ?? '',
      phone:       settings.phone,
      email:       settings.email,
      website:     settings.website ?? '',
    })
    setDirty(false)
  }, [settings])

  function set<K extends keyof UpdateSettingsPayload>(key: K, value: UpdateSettingsPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    await updateMut.mutateAsync(form)
    setDirty(false)
  }

  if (!can('settings', 'read')) return <AccessDenied />

  if (isLoading) {
    return (
      <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card" style={{ height: 200 }}>
            <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} noValidate aria-busy={updateMut.isPending} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
          Informations générales
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
          Identité légale et coordonnées de l&apos;entreprise — apparaissent sur tous les documents SYSCOHADA
        </p>
      </div>

      {/* Row 1 — Identité légale + Coordonnées */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>

        {/* Identité légale */}
        <div className="card">
          <SectionTitle icon={<Building2 size={15} />} title="Identité légale" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label htmlFor={id('companyName')} required>Raison sociale</Label>
              <input id={id('companyName')} value={form.companyName ?? ''} onChange={(e) => set('companyName', e.target.value)} style={inputCss} placeholder="Bridge Technologies Solutions" required aria-required="true" />
            </div>
            <div>
              <Label htmlFor={id('legalForm')}>Forme juridique</Label>
              <input id={id('legalForm')} value={form.legalForm ?? ''} onChange={(e) => set('legalForm', e.target.value)} style={inputCss} placeholder="SARL, SA, SAS…" />
            </div>
            <div>
              <Label htmlFor={id('taxNumber')}>N° Contribuable (NIU)</Label>
              <input id={id('taxNumber')} value={form.taxNumber ?? ''} onChange={(e) => set('taxNumber', e.target.value)} style={inputCss} placeholder="M052116098443F" />
            </div>
            <div>
              <Label htmlFor={id('rccm')}>RCCM</Label>
              <input id={id('rccm')} value={form.rccm ?? ''} onChange={(e) => set('rccm', e.target.value)} style={inputCss} placeholder="RC/DLA/2020/B/01234" />
            </div>
            <div>
              <Label htmlFor={id('companyCode')} required>Code entreprise</Label>
              <input
                id={id('companyCode')}
                value={form.companyCode ?? 'BTS'}
                onChange={(e) => set('companyCode', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={10}
                style={inputCss}
                placeholder="BTS"
                required
                aria-required="true"
              />
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>
                Préfixe de numérotation SYSCOHADA — ex&nbsp;: <span style={{ fontFamily: 'var(--font-mono)' }}>{form.companyCode ?? 'BTS'}/DC/2026/01/FAC001</span>
              </p>
              {(form.companyCode ?? '') !== (settings?.companyCode ?? 'BTS') && (
                <p style={{ fontSize: 11, color: '#f59e0b', margin: '4px 0 0' }}>
                  ⚠ Ce changement s&apos;applique aux futurs documents uniquement.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Coordonnées */}
        <div className="card">
          <SectionTitle icon={<MapPin size={15} />} title="Coordonnées" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label htmlFor={id('address')}>Adresse</Label>
              <input id={id('address')} value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} style={inputCss} placeholder="B.P. 1418 Douala Cameroun" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
              <div>
                <Label htmlFor={id('city')}>Ville</Label>
                <input id={id('city')} value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} style={inputCss} placeholder="Douala" />
              </div>
              <div>
                <Label htmlFor={id('country')}>Pays</Label>
                <input id={id('country')} value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} style={inputCss} placeholder="Cameroun" />
              </div>
            </div>
            <div>
              <Label htmlFor={id('phone')} required>Téléphone</Label>
              <input id={id('phone')} value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} style={inputCss} placeholder="+237 679 28 91 66" required aria-required="true" />
            </div>
            <div>
              <Label htmlFor={id('email')} required>Email</Label>
              <input id={id('email')} type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} style={inputCss} placeholder="contact@bridgetech-solutions.com" required aria-required="true" />
            </div>
            <div>
              <Label htmlFor={id('website')}>Site web</Label>
              <input id={id('website')} value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} style={inputCss} placeholder="www.bridgetech-solutions.com" />
            </div>
          </div>
        </div>
      </div>

      {/* Save bar */}
      {can('settings', 'update') && (
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <button
          type="submit"
          disabled={updateMut.isPending || !dirty}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 28px', borderRadius: 'var(--radius-md)',
            border: 'none', background: dirty ? 'var(--primary)' : 'var(--surface-2)',
            color: dirty ? '#fff' : 'var(--text-3)',
            cursor: dirty && !updateMut.isPending ? 'pointer' : 'not-allowed',
            fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: 700,
            boxShadow: dirty ? '0 4px 14px rgba(45,125,210,0.3)' : 'none',
            transition: 'all 0.2s', opacity: updateMut.isPending ? 0.65 : 1,
          }}
        >
          {updateMut.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
          Enregistrer les modifications
        </button>
      </div>
      )}
    </form>
  )
}
