'use client'

import { useState, useId } from 'react'
import { Sliders, Plus, Trash2, Loader2, X, AlertCircle } from 'lucide-react'
import { useCustomFields, useCreateCustomField, useDeleteCustomField } from '@/features/settings-advanced/hooks'
import {
  CUSTOM_FIELD_ENTITY_LABELS, CUSTOM_FIELD_TYPE_LABELS,
  type CustomFieldEntityType, type CustomFieldType, type CreateCustomFieldPayload,
} from '@/features/settings-advanced/types'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'

const ENTITY_TYPES = Object.keys(CUSTOM_FIELD_ENTITY_LABELS) as CustomFieldEntityType[]
const FIELD_TYPES  = Object.keys(CUSTOM_FIELD_TYPE_LABELS)  as CustomFieldType[]

// ─── Type badge ────────────────────────────────────────────────
function FieldTypeBadge({ type }: { type: CustomFieldType }) {
  const colors: Record<CustomFieldType, { bg: string; color: string }> = {
    text:    { bg: 'rgba(99,102,241,0.08)',  color: '#6366f1' },
    number:  { bg: 'rgba(45,125,210,0.08)',  color: '#2D7DD2' },
    date:    { bg: 'rgba(16,185,129,0.08)',  color: '#10b981' },
    boolean: { bg: 'rgba(245,158,11,0.08)', color: '#d97706' },
    select:  { bg: 'rgba(239,68,68,0.08)',  color: '#ef4444' },
    json:    { bg: 'rgba(107,114,128,0.1)', color: 'var(--text-2)' },
  }
  const { bg, color } = colors[type]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 4,
      background: bg, color,
      fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-mono)',
    }}>
      {CUSTOM_FIELD_TYPE_LABELS[type]}
    </span>
  )
}

// ─── Create field modal ────────────────────────────────────────
function CreateFieldModal({ onClose }: { onClose: () => void }) {
  const uid = useId()
  const id = (s: string) => `${uid}-${s}`
  const createMut = useCreateCustomField()

  const [form, setForm] = useState<CreateCustomFieldPayload>({
    entityType:   'invoice',
    fieldName:    '',
    label:        '',
    fieldType:    'text',
    isRequired:   false,
    options:      null,
    defaultValue: null,
  })
  const [optionsText, setOptionsText] = useState('')

  const inputCss: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)', background: 'var(--bg)',
    fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
    outline: 'none', boxSizing: 'border-box',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.fieldName.trim() || !form.label.trim()) return

    const options = form.fieldType === 'select'
      ? optionsText.split('\n').map((s) => s.trim()).filter(Boolean)
      : null

    await createMut.mutateAsync({ ...form, options })
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 'var(--radius-lg)',
        border: '1.5px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        width: '100%', maxWidth: 500, padding: 28, maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
            Nouveau champ personnalisé
          </h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Entity + Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label htmlFor={id('entity')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
                Entité <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select id={id('entity')} value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value as CustomFieldEntityType })} style={{ ...inputCss, cursor: 'pointer' }}>
                {ENTITY_TYPES.map((t) => <option key={t} value={t}>{CUSTOM_FIELD_ENTITY_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={id('type')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
                Type <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select id={id('type')} value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value as CustomFieldType })} style={{ ...inputCss, cursor: 'pointer' }}>
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{CUSTOM_FIELD_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          </div>

          {/* Label */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor={id('label')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Libellé affiché <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input id={id('label')} type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ex : Numéro de commande client" required style={inputCss} />
          </div>

          {/* Field name */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor={id('name')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Identifiant technique <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id={id('name')}
              type="text"
              value={form.fieldName}
              onChange={(e) => setForm({ ...form, fieldName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              placeholder="customer_order_number"
              required
              style={{ ...inputCss, fontFamily: 'var(--font-mono)' }}
            />
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 0' }}>Uniquement lettres minuscules, chiffres et underscores. Utilisé dans l&apos;API.</p>
          </div>

          {/* Options (for select type) */}
          {form.fieldType === 'select' && (
            <div style={{ marginBottom: 14 }}>
              <label htmlFor={id('options')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
                Options (une par ligne) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                id={id('options')}
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder={'Option A\nOption B\nOption C'}
                rows={4}
                style={{ ...inputCss, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>
          )}

          {/* Default value */}
          {form.fieldType !== 'boolean' && form.fieldType !== 'json' && (
            <div style={{ marginBottom: 14 }}>
              <label htmlFor={id('default')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
                Valeur par défaut (optionnel)
              </label>
              <input id={id('default')} type="text" value={form.defaultValue ?? ''} onChange={(e) => setForm({ ...form, defaultValue: e.target.value || null })} style={inputCss} />
            </div>
          )}

          {/* Required checkbox */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.isRequired}
                onChange={(e) => setForm({ ...form, isRequired: e.target.checked })}
                style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-1)' }}>Champ obligatoire</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 18px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'transparent',
              color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600,
            }}>Annuler</button>
            <button
              type="submit"
              disabled={createMut.isPending || !form.fieldName.trim() || !form.label.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 20px', borderRadius: 'var(--radius-md)',
                border: 'none', background: 'var(--primary)', color: '#fff',
                cursor: (createMut.isPending || !form.fieldName.trim() || !form.label.trim()) ? 'not-allowed' : 'pointer',
                opacity: (createMut.isPending || !form.fieldName.trim() || !form.label.trim()) ? 0.65 : 1,
                fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700,
              }}
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Créer le champ
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Fields table for one entity type ─────────────────────────
function EntityFieldsSection({
  entityType,
  activeEntity,
}: {
  entityType: CustomFieldEntityType
  activeEntity: CustomFieldEntityType
}) {
  const { data: fields = [], isLoading } = useCustomFields(entityType)
  const deleteMut = useDeleteCustomField()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  if (entityType !== activeEntity) return null

  const active = fields.filter((f) => f.isActive)

  return (
    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
      {/* Column headers */}
      <div aria-hidden="true" style={{
        display: 'grid', gridTemplateColumns: '1fr 140px 120px 80px 80px',
        gap: 12, padding: '8px 16px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      }}>
        {['Libellé / Identifiant', 'Type', 'Obligatoire', 'Options', 'Actions'].map((h) => (
          <span key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {h}
          </span>
        ))}
      </div>

      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr 140px 120px 80px 80px',
            gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)',
          }}>
            {[1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="animate-pulse" style={{ height: 16, borderRadius: 4, background: 'var(--surface-2)' }} />
            ))}
          </div>
        ))
      ) : active.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <Sliders size={32} style={{ color: 'var(--border)', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: 0 }}>
            Aucun champ pour {CUSTOM_FIELD_ENTITY_LABELS[entityType]}.
          </p>
        </div>
      ) : (
        active.map((field) => (
          <div
            key={field.id}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 140px 120px 80px 80px',
              gap: 12, padding: '12px 16px', alignItems: 'center',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-body)', marginBottom: 2 }}>
                {field.label}
              </div>
              <code style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                {field.name}
              </code>
            </div>
            <FieldTypeBadge type={field.fieldType} />
            <span style={{ fontSize: 12.5, color: field.isRequired ? 'var(--text-1)' : 'var(--text-3)' }}>
              {field.isRequired ? 'Oui' : 'Non'}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
              {field.options ? `${field.options.length} valeurs` : '—'}
            </span>
            <div>
              {confirmingId === field.id ? (
                <div style={{ display: 'flex', gap: 5 }}>
                  <button
                    type="button"
                    onClick={() => { deleteMut.mutate(field.id); setConfirmingId(null) }}
                    disabled={deleteMut.isPending}
                    style={{
                      padding: '4px 8px', borderRadius: 6, border: 'none',
                      background: '#ef4444', color: '#fff', cursor: 'pointer',
                      fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                    }}
                  >
                    Suppr.
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    style={{
                      padding: '4px 6px', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'transparent',
                      color: 'var(--text-2)', cursor: 'pointer', fontSize: 11,
                    }}
                  >
                    Non
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`Supprimer le champ ${field.label}`}
                  onClick={() => setConfirmingId(field.id)}
                  style={{
                    display: 'flex', alignItems: 'center',
                    padding: '6px 10px', borderRadius: 'var(--radius-md)',
                    border: '1.5px solid rgba(239,68,68,0.3)', background: 'transparent',
                    color: '#ef4444', cursor: 'pointer', minHeight: 44,
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────
export default function CustomFieldsPage() {
  const { can } = usePermission()
  const [activeEntity, setActiveEntity] = useState<CustomFieldEntityType>('invoice')
  const [showCreate, setShowCreate] = useState(false)

  if (!can('settings', 'update')) return <AccessDenied message="La gestion des champs personnalisés est réservée aux administrateurs." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
            Champs personnalisés
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
            Étendez les formulaires avec des champs métier propres à votre activité.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 20px', borderRadius: 'var(--radius-md)',
            border: 'none', background: 'var(--primary)', color: '#fff',
            cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700,
            whiteSpace: 'nowrap', minHeight: 44,
          }}
        >
          <Plus size={14} aria-hidden="true" />
          Nouveau champ
        </button>
      </div>

      {/* Info banner */}
      <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(45,125,210,0.06)', border: '1px solid rgba(45,125,210,0.2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertCircle size={14} style={{ color: 'var(--primary)', marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
          Les champs personnalisés sont accessibles via l&apos;API sous la clé <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>customFields</code>.
          La suppression d&apos;un champ désactive son affichage sans effacer les données existantes.
        </p>
      </div>

      {/* Entity tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {ENTITY_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setActiveEntity(type)}
            style={{
              padding: '7px 16px', borderRadius: 'var(--radius-md)',
              border: `1.5px solid ${activeEntity === type ? 'var(--primary)' : 'var(--border)'}`,
              background: activeEntity === type ? 'rgba(45,125,210,0.08)' : 'transparent',
              color: activeEntity === type ? 'var(--primary)' : 'var(--text-2)',
              cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            {CUSTOM_FIELD_ENTITY_LABELS[type]}
          </button>
        ))}
      </div>

      {/* Fields table for active entity */}
      {ENTITY_TYPES.map((type) => (
        <EntityFieldsSection key={type} entityType={type} activeEntity={activeEntity} />
      ))}

      {showCreate && <CreateFieldModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
