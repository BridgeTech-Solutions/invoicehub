'use client'

import { useState, useEffect, useRef, useId } from 'react'
import { Image as ImageIcon, Loader2, Check, Upload, Stamp, PenLine, Layout, Info } from 'lucide-react'
import { useSettings, useUpdateSettings, useUploadAsset } from '@/features/settings/hooks'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import type { AssetType } from '@/features/settings/types'

// ─── Shared styles ────────────────────────────────────────────
const inputCss: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div aria-hidden="true" style={{ color: 'var(--primary)' }}>{icon}</div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
      </div>
      {subtitle && <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0 23px' }}>{subtitle}</p>}
    </div>
  )
}

// ─── Asset upload zone ────────────────────────────────────────
function AssetUploadZone({
  label, description, currentPath, assetType, accept,
  previewWidth, previewHeight,
}: {
  label: string
  description: string
  currentPath: string | null | undefined
  assetType: AssetType
  accept?: string
  previewWidth?: number
  previewHeight?: number
}) {
  const uploadMut = useUploadAsset()
  const fileRef   = useRef<HTMLInputElement>(null)
  const uploading = uploadMut.isPending &&
    (uploadMut.variables as { type: AssetType } | undefined)?.type === assetType

  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:3000'
  const imgSrc  = currentPath ? `${baseUrl}/${currentPath}` : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 2 }}>
          {label}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{description}</span>
      </div>

      <button
        type="button"
        aria-label={imgSrc ? `Changer ${label}` : `Ajouter ${label}`}
        aria-busy={uploading}
        onClick={() => fileRef.current?.click()}
        style={{
          width: '100%',
          minHeight: previewHeight ? Math.max(previewHeight, 80) : 110,
          border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)',
          background: 'var(--surface)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20,
          cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--primary)'
          e.currentTarget.style.background  = 'rgba(45,125,210,0.02)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.background  = 'var(--surface)'
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--primary)'
          e.currentTarget.style.outline     = '2px solid rgba(45,125,210,0.25)'
          e.currentTarget.style.outlineOffset = '2px'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.outline     = 'none'
        }}
      >
        {uploading ? (
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--primary)' }} aria-hidden="true" />
        ) : imgSrc ? (
          <img
            src={imgSrc}
            alt={label}
            style={{
              maxHeight: previewHeight ?? 60,
              maxWidth: previewWidth ? Math.min(previewWidth, 400) : '100%',
              objectFit: 'contain',
            }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Upload size={20} style={{ color: 'var(--text-3)' }} aria-hidden="true" />
            <span style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center' }}>
              Cliquer pour ajouter
            </span>
          </div>
        )}
        {imgSrc && !uploading && (
          <span style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            Cliquer pour modifier
          </span>
        )}
      </button>

      <input
        ref={fileRef}
        type="file"
        aria-label={`Sélectionner un fichier pour ${label}`}
        accept={accept ?? 'image/png,image/jpeg,image/webp,image/svg+xml'}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) uploadMut.mutate({ type: assetType, file })
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function BrandingSettingsPage() {
  const { can }   = usePermission()
  const { data: settings, isLoading } = useSettings()
  const updateMut = useUpdateSettings()

  const uid = useId()
  const [safeZone, setSafeZone] = useState<number>(20)
  const [dirty, setDirty]       = useState(false)

  useEffect(() => {
    if (!settings) return
    setSafeZone(settings.footerSafeZonePx ?? 20)
    setDirty(false)
  }, [settings])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    await updateMut.mutateAsync({ footerSafeZonePx: safeZone })
    setDirty(false)
  }

  if (!can('settings', 'read')) return <AccessDenied />

  if (isLoading) {
    return (
      <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card" style={{ height: 220 }}>
            <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
          Branding & Documents
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
          Assets visuels injectés dans les PDFs générés (factures, proformas)
        </p>
      </div>

      {/* 1. Logo principal */}
      <div className="card">
        <SectionTitle
          icon={<ImageIcon size={15} />}
          title="Logo de l'entreprise"
          subtitle="Affiché en haut à gauche de chaque document PDF"
        />
        <AssetUploadZone
          label="Logo principal"
          description="Format PNG ou SVG avec fond transparent recommandé — max 2 MB"
          currentPath={settings?.logoPath}
          assetType="logo"
          accept="image/png,image/svg+xml,image/webp"
          previewHeight={72}
          previewWidth={280}
        />
      </div>

      {/* 2. En-tête & Pied de page PDF */}
      <div className="card">
        <SectionTitle
          icon={<Layout size={15} />}
          title="En-tête et pied de page PDF"
          subtitle="Bandes graphiques affichées en haut et en bas de chaque page de vos documents"
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <AssetUploadZone
            label="Image d'en-tête PDF"
            description="Recommandé : 800 × 120 px minimum — PNG, JPG"
            currentPath={settings?.headerImagePath}
            assetType="header"
            accept="image/png,image/jpeg,image/webp"
            previewHeight={60}
          />
          <AssetUploadZone
            label="Image de pied de page PDF"
            description="Recommandé : 800 × 60 px minimum — PNG, JPG"
            currentPath={settings?.footerImagePath}
            assetType="footer"
            accept="image/png,image/jpeg,image/webp"
            previewHeight={40}
          />

          {/* Footer safe zone */}
          <div>
            <label
              htmlFor={`${uid}-safezone`}
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}
            >
              Marge de sécurité (pied de page)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                id={`${uid}-safezone`}
                type="number"
                min={0}
                max={120}
                value={safeZone}
                onChange={(e) => { setSafeZone(parseInt(e.target.value, 10)); setDirty(true) }}
                style={{ ...inputCss, width: 100 }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>px</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>
              Espace réservé en bas de page pour éviter que le contenu chevauche l&apos;image de pied.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Cachet & Signature */}
      <div className="card">
        <SectionTitle
          icon={<Stamp size={15} />}
          title="Cachet et signature"
          subtitle="Apposés automatiquement sur les documents lors de leur émission"
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <AssetUploadZone
            label="Cachet officiel"
            description="Format carré recommandé, ex: 200 × 200 px"
            currentPath={settings?.stampPath}
            assetType="stamp"
            previewHeight={80}
            previewWidth={80}
          />
          <AssetUploadZone
            label="Signature"
            description="Recommandé : 200 × 80 px, fond transparent"
            currentPath={settings?.signaturePath}
            assetType="signature"
            previewHeight={50}
            previewWidth={160}
          />
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(45,125,210,0.04)', border: '1px solid rgba(45,125,210,0.15)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Info size={13} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
            Le cachet et la signature sont appliqués au moment de l&apos;émission du document.
            Ils ne sont <strong>pas rétroactifs</strong> sur les documents déjà émis.
          </p>
        </div>
      </div>

      {/* Save bar — only for footerSafeZonePx */}
      {dirty && can('settings', 'update') && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={updateMut.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 28px', borderRadius: 'var(--radius-md)',
              border: 'none', background: 'var(--primary)', color: '#fff',
              cursor: updateMut.isPending ? 'not-allowed' : 'pointer',
              fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: 700,
              boxShadow: '0 4px 14px rgba(45,125,210,0.3)',
              transition: 'all 0.2s', opacity: updateMut.isPending ? 0.65 : 1,
            }}
          >
            {updateMut.isPending
              ? <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              : <Check size={15} aria-hidden="true" />
            }
            Enregistrer les modifications
          </button>
        </div>
      )}
    </form>
  )
}
