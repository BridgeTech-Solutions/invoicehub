'use client'

import { useState } from 'react'
import { Percent, Building, Plus, Pencil, Trash2, Check, X, Loader2, Star, Hash } from 'lucide-react'
import { useTaxRates, useCreateTaxRate, useUpdateTaxRate, useDeleteTaxRate } from '@/features/tax-rates/hooks'
import { useOffices, useCreateOffice, useUpdateOffice, useDeleteOffice } from '@/features/offices/hooks'
import type { TaxRate, CreateTaxRatePayload } from '@/features/tax-rates/types'
import type { Office, CreateOfficePayload } from '@/features/offices/types'

const inputCss: React.CSSProperties = {
  padding: '8px 11px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

function SectionHeader({ icon, title, onAdd, addLabel }: {
  icon: React.ReactNode; title: string; onAdd?: () => void; addLabel?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ color: 'var(--primary)' }}>{icon}</div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
      </div>
      {onAdd && (
        <button type="button" onClick={onAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          <Plus size={12} /> {addLabel}
        </button>
      )}
    </div>
  )
}

// ─── Tax Rate form (inline) ────────────────────────────────────
function TaxRateForm({ initial, onSave, onCancel, isPending }: {
  initial?: Partial<CreateTaxRatePayload>; onSave: (v: CreateTaxRatePayload) => void
  onCancel: () => void; isPending: boolean
}) {
  const [form, setForm] = useState<CreateTaxRatePayload>({
    name: initial?.name ?? '', code: initial?.code ?? '',
    rate: initial?.rate ?? 0, description: initial?.description ?? '',
    isDefault: initial?.isDefault ?? false,
  })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px auto auto auto', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'rgba(45,125,210,0.04)', borderRadius: 'var(--radius-md)', border: '1.5px dashed rgba(45,125,210,0.25)' }}>
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nom (ex: TVA Standard)" style={inputCss} />
      <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="Code" style={inputCss} />
      <input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: parseFloat(e.target.value) })} placeholder="%" min={0} max={100} step={0.01} style={inputCss} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
        Défaut
      </label>
      <button type="button" onClick={() => onSave(form)} disabled={!form.name || !form.code || isPending}
        style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
        {isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
      </button>
      <button type="button" onClick={onCancel}
        style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
        <X size={13} />
      </button>
    </div>
  )
}

// ─── Tax Rates section ────────────────────────────────────────
function TaxRatesSection() {
  const { data: rates = [], isLoading } = useTaxRates(true)
  const createMut = useCreateTaxRate()
  const updateMut = useUpdateTaxRate()
  const deleteMut = useDeleteTaxRate()
  const [creating, setCreating] = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)

  return (
    <div className="card">
      <SectionHeader icon={<Percent size={15} />} title="Taux de TVA" onAdd={() => setCreating(true)} addLabel="Ajouter" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px auto 80px', gap: 8, padding: '0 12px' }}>
          {['Nom', 'Code', 'Taux %', '', 'Actions'].map((h) => (
            <span key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
          ))}
        </div>
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: 40, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />)
          : rates.map((r) => editId === r.id
            ? (
              <TaxRateForm
                key={r.id}
                initial={{ ...r, description: r.description ?? undefined }}
                isPending={updateMut.isPending}
                onSave={(v) => updateMut.mutate({ id: r.id, ...v }, { onSuccess: () => setEditId(null) })}
                onCancel={() => setEditId(null)}
              />
            )
            : (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px auto 80px', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', opacity: r.isActive ? 1 : 0.5 }}>
                <span style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: r.isDefault ? 600 : 400, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {r.isDefault && <Star size={11} style={{ color: '#f59e0b', fill: '#f59e0b' }} />}
                  {r.name}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.code}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{r.rate}%</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: r.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)', color: r.isActive ? '#10b981' : '#6b7280', fontFamily: 'var(--font-display)', fontWeight: 700, width: 'fit-content' }}>
                  {r.isActive ? 'Actif' : 'Inactif'}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" onClick={() => setEditId(r.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}>
                    <Pencil size={13} />
                  </button>
                  {!r.isDefault && (
                    <button type="button"
                      onClick={() => { if (confirm(`Supprimer "${r.name}" ?`)) deleteMut.mutate(r.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            )
          )
        }
        {creating && (
          <TaxRateForm
            isPending={createMut.isPending}
            onSave={(v) => createMut.mutate(v, { onSuccess: () => setCreating(false) })}
            onCancel={() => setCreating(false)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Office form (inline) ──────────────────────────────────────
function OfficeForm({ initial, onSave, onCancel, isPending }: {
  initial?: Partial<CreateOfficePayload>; onSave: (v: CreateOfficePayload) => void
  onCancel: () => void; isPending: boolean
}) {
  const [form, setForm] = useState<CreateOfficePayload>({
    code: initial?.code ?? '', name: initial?.name ?? '',
    city: initial?.city ?? '', address: initial?.address ?? '',
    isDefault: initial?.isDefault ?? false,
  })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr auto auto auto', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'rgba(45,125,210,0.04)', borderRadius: 'var(--radius-md)', border: '1.5px dashed rgba(45,125,210,0.25)' }}>
      <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="Code (DC)" style={inputCss} maxLength={10} />
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nom du bureau" style={inputCss} />
      <input value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Ville" style={inputCss} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
        Principal
      </label>
      <button type="button" onClick={() => onSave(form)} disabled={!form.code || !form.name || isPending}
        style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
        {isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
      </button>
      <button type="button" onClick={onCancel}
        style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
        <X size={13} />
      </button>
    </div>
  )
}

// ─── Offices section ──────────────────────────────────────────
function OfficesSection() {
  const { data: offices = [], isLoading } = useOffices()
  const createMut = useCreateOffice()
  const updateMut = useUpdateOffice()
  const deleteMut = useDeleteOffice()
  const [creating, setCreating] = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)

  return (
    <div className="card">
      <SectionHeader icon={<Building size={15} />} title="Bureaux & Agences" onAdd={() => setCreating(true)} addLabel="Ajouter un bureau" />
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
        Les codes bureaux sont utilisés dans la numérotation SYSCOHADA : BTS/<strong>DC</strong>/2026/01/FAC001
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr auto 80px', gap: 8, padding: '0 12px' }}>
          {['Code', 'Nom', 'Ville', '', 'Actions'].map((h) => (
            <span key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
          ))}
        </div>
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => <div key={i} style={{ height: 40, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />)
          : offices.filter((o) => !o.deletedAt).map((o) => editId === o.id
            ? (
              <OfficeForm
                key={o.id}
                initial={{ ...o, city: o.city ?? undefined, address: o.address ?? undefined }}
                isPending={updateMut.isPending}
                onSave={(v) => updateMut.mutate({ id: o.id, ...v }, { onSuccess: () => setEditId(null) })}
                onCancel={() => setEditId(null)}
              />
            )
            : (
              <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr auto 80px', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{o.code}</span>
                <span style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: o.isDefault ? 600 : 400, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {o.isDefault && <Star size={11} style={{ color: '#f59e0b', fill: '#f59e0b' }} />}
                  {o.name}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{o.city ?? '—'}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: o.isDefault ? 'rgba(45,125,210,0.1)' : 'var(--surface-2)', color: o.isDefault ? 'var(--primary)' : 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, width: 'fit-content' }}>
                  {o.isDefault ? 'Principal' : 'Agence'}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" onClick={() => setEditId(o.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}>
                    <Pencil size={13} />
                  </button>
                  {!o.isDefault && (
                    <button type="button"
                      onClick={() => { if (confirm(`Supprimer le bureau "${o.name}" ?`)) deleteMut.mutate(o.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            )
          )
        }
        {creating && (
          <OfficeForm
            isPending={createMut.isPending}
            onSave={(v) => createMut.mutate(v, { onSuccess: () => setCreating(false) })}
            onCancel={() => setCreating(false)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Document sequences section ───────────────────────────────
function DocumentSequencesSection() {
  const { data: offices = [], isLoading } = useOffices()
  const now   = new Date()
  const year  = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')

  const activeOffices = offices.filter((o) => !o.deletedAt)

  return (
    <div className="card">
      <SectionHeader icon={<Hash size={15} />} title="Séquences de numérotation" />
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 16px' }}>
        Format SYSCOHADA — numérotation atomique via la fonction PostgreSQL{' '}
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 3 }}>fn_next_document_number()</code>.
        Les séquences sont gapless et garanties atomiques même en charge concurrente.
      </p>
      {isLoading
        ? Array.from({ length: 2 }).map((_, i) => (
          <div key={i} style={{ height: 80, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 8 }} className="animate-pulse" />
        ))
        : activeOffices.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '16px 0' }}>Aucun bureau configuré</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeOffices.map((o) => (
                <div key={o.id} style={{ padding: '14px 16px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: `1.5px solid ${o.isDefault ? 'rgba(45,125,210,0.3)' : 'var(--border)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: o.isDefault ? 'var(--primary)' : 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>{o.code}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{o.name}</span>
                    {o.isDefault && (
                      <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 100, background: 'rgba(45,125,210,0.1)', color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>Principal</span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Facture', prefix: 'FAC', color: '#10b981', bg: 'rgba(16,185,129,0.07)' },
                      { label: 'Proforma', prefix: 'PFM', color: '#6366f1', bg: 'rgba(99,102,241,0.07)' },
                      { label: 'Acompte', prefix: 'ACP', color: '#f59e0b', bg: 'rgba(245,158,11,0.07)' },
                      { label: 'Avoir', prefix: 'AVO', color: '#ef4444', bg: 'rgba(239,68,68,0.07)' },
                    ].map(({ label, prefix, color, bg }) => (
                      <div key={prefix} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--radius-md)', background: bg, border: `1px solid ${color}22` }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 54 }}>{label}</span>
                        <code style={{ fontSize: 11.5, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
                          BTS/{o.code}/{year}/{month}/{prefix}<span style={{ color }}>###</span>
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
      }
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function BillingSettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <TaxRatesSection />
      <OfficesSection />
      <DocumentSequencesSection />
    </div>
  )
}
