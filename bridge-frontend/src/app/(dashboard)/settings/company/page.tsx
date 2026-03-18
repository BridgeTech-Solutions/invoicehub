'use client'

import { useState, useEffect, useRef } from 'react'
import { Building2, MapPin, Banknote, Image as ImageIcon, Loader2, Check, Upload } from 'lucide-react'
import { useSettings, useUpdateSettings, useUploadAsset } from '@/features/settings/hooks'
import type { UpdateSettingsPayload, AssetType } from '@/features/settings/types'

// ─── Shared styles ────────────────────────────────────────────
const inputCss: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
      {children}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </label>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      <div style={{ color: 'var(--primary)' }}>{icon}</div>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
    </div>
  )
}

// ─── Asset upload tile ────────────────────────────────────────
function AssetTile({
  label, hint, currentPath, assetType, accept,
}: {
  label: string; hint: string; currentPath: string | null | undefined
  assetType: AssetType; accept?: string
}) {
  const uploadMut = useUploadAsset()
  const fileRef   = useRef<HTMLInputElement>(null)
  const uploading = uploadMut.isPending && (uploadMut.variables as { type: AssetType } | undefined)?.type === assetType

  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:3000'
  const imgSrc  = currentPath ? `${baseUrl}/${currentPath}` : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Label>{label}</Label>
      <div style={{
        width: '100%', minHeight: 90,
        border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)',
        background: 'var(--surface)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16,
        position: 'relative', cursor: 'pointer', transition: 'border-color 0.15s',
      }}
        onClick={() => fileRef.current?.click()}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        {imgSrc ? (
          <img src={imgSrc} alt={label} style={{ maxHeight: 60, maxWidth: '100%', objectFit: 'contain' }} />
        ) : (
          <Upload size={20} style={{ color: 'var(--text-3)' }} />
        )}
        {uploading
          ? <Loader2 size={13} className="animate-spin" style={{ color: 'var(--primary)' }} />
          : <span style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>{hint}</span>
        }
        <input
          ref={fileRef}
          type="file"
          accept={accept ?? 'image/png,image/jpeg,image/webp'}
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) uploadMut.mutate({ type: assetType, file })
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function CompanySettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const updateMut = useUpdateSettings()

  const [form, setForm] = useState<UpdateSettingsPayload>({})
  const [dirty, setDirty] = useState(false)

  // Initialise form once loaded
  useEffect(() => {
    if (!settings) return
    setForm({
      companyName:  settings.companyName,
      legalForm:    settings.legalForm   ?? '',
      taxNumber:    settings.taxNumber   ?? '',
      rccm:         settings.rccm        ?? '',
      address:      settings.address,
      city:         settings.city        ?? '',
      country:      settings.country     ?? '',
      postalBox:    settings.postalBox   ?? '',
      phone:        settings.phone,
      email:        settings.email,
      website:      settings.website     ?? '',
      defaultCurrency:             settings.defaultCurrency,
      defaultTaxRate:              settings.defaultTaxRate,
      defaultProformaValidityDays: settings.defaultProformaValidityDays,
      defaultInvoiceDueDays:       settings.defaultInvoiceDueDays,
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

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card" style={{ height: 200 }}>
            <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Row 1 — Identité légale + Coordonnées */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Identité légale */}
        <div className="card">
          <SectionTitle icon={<Building2 size={15} />} title="Identité légale" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label required>Raison sociale</Label>
              <input value={form.companyName ?? ''} onChange={(e) => set('companyName', e.target.value)} style={inputCss} placeholder="Bridge Technologies Solutions" required />
            </div>
            <div>
              <Label>Forme juridique</Label>
              <input value={form.legalForm ?? ''} onChange={(e) => set('legalForm', e.target.value)} style={inputCss} placeholder="SARL, SA, SAS…" />
            </div>
            <div>
              <Label>N° Contribuable (NIU)</Label>
              <input value={form.taxNumber ?? ''} onChange={(e) => set('taxNumber', e.target.value)} style={inputCss} placeholder="M052116098443F" />
            </div>
            <div>
              <Label>RCCM</Label>
              <input value={form.rccm ?? ''} onChange={(e) => set('rccm', e.target.value)} style={inputCss} placeholder="RC/DLA/2020/B/01234" />
            </div>
          </div>
        </div>

        {/* Coordonnées */}
        <div className="card">
          <SectionTitle icon={<MapPin size={15} />} title="Coordonnées" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label>Adresse</Label>
              <input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} style={inputCss} placeholder="B.P. 1418 Douala Cameroun" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <Label>Ville</Label>
                <input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} style={inputCss} placeholder="Douala" />
              </div>
              <div>
                <Label>Pays</Label>
                <input value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} style={inputCss} placeholder="Cameroun" />
              </div>
            </div>
            <div>
              <Label required>Téléphone</Label>
              <input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} style={inputCss} placeholder="+237 679 28 91 66" required />
            </div>
            <div>
              <Label required>Email</Label>
              <input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} style={inputCss} placeholder="contact@bridgetech-solutions.com" required />
            </div>
            <div>
              <Label>Site web</Label>
              <input value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} style={inputCss} placeholder="www.bridgetech-solutions.com" />
            </div>
          </div>
        </div>
      </div>

      {/* Row 2 — Branding + Paramètres financiers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Branding */}
        <div className="card">
          <SectionTitle icon={<ImageIcon size={15} />} title="Branding & Documents" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <AssetTile
              label="Logo de l'entreprise"
              hint="Affiché sur les factures et proformas — Cliquer pour changer le logo"
              currentPath={settings?.logoPath}
              assetType="logo"
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <AssetTile
                label="En-tête PDF"
                hint="+ Image en-tête PDF"
                currentPath={settings?.headerImagePath}
                assetType="header"
              />
              <AssetTile
                label="Pied de page PDF"
                hint="+ Image pied de page PDF"
                currentPath={settings?.footerImagePath}
                assetType="footer"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <AssetTile
                label="Cachet / Tampon"
                hint="+ Cachet"
                currentPath={settings?.stampPath}
                assetType="stamp"
              />
              <AssetTile
                label="Signature"
                hint="+ Signature"
                currentPath={settings?.signaturePath}
                assetType="signature"
              />
            </div>
          </div>
        </div>

        {/* Paramètres financiers */}
        <div className="card">
          <SectionTitle icon={<Banknote size={15} />} title="Paramètres financiers" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label>Devise par défaut</Label>
              <select value={form.defaultCurrency ?? 'XAF'} onChange={(e) => set('defaultCurrency', e.target.value)} style={{ ...inputCss, cursor: 'pointer' }}>
                <option value="XAF">XAF (Franc CFA)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="USD">USD (Dollar US)</option>
              </select>
            </div>
            <div>
              <Label>Taux TVA par défaut (%)</Label>
              <input
                type="number" min={0} max={100} step={0.01}
                value={form.defaultTaxRate ?? 19.25}
                onChange={(e) => set('defaultTaxRate', parseFloat(e.target.value))}
                style={inputCss} placeholder="19.25"
              />
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>SYSCOHADA — TVA Cameroun : 19,25%</p>
            </div>
            <div>
              <Label>Code entreprise (numérotation)</Label>
              <input
                value="BTS"
                readOnly
                style={{ ...inputCss, opacity: 0.6, cursor: 'not-allowed' }}
              />
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>Utilisé dans la numérotation BTS/DC/…</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label>Validité proformas (jours)</Label>
                <input
                  type="number" min={1} max={365}
                  value={form.defaultProformaValidityDays ?? 30}
                  onChange={(e) => set('defaultProformaValidityDays', parseInt(e.target.value, 10))}
                  style={inputCss}
                />
              </div>
              <div>
                <Label>Échéance factures (jours)</Label>
                <input
                  type="number" min={1} max={365}
                  value={form.defaultInvoiceDueDays ?? 30}
                  onChange={(e) => set('defaultInvoiceDueDays', parseInt(e.target.value, 10))}
                  style={inputCss}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save bar */}
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
            transition: 'all 0.2s',
          }}
        >
          {updateMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Enregistrer les modifications
        </button>
      </div>
    </form>
  )
}
