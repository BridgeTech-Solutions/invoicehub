'use client'

import { useState } from 'react'
import { Plus, Pencil, PowerOff, Power, Check, X, Loader2, GripVertical } from 'lucide-react'
import { useAllUnits, useCreateUnit, useUpdateUnit, useRemoveUnit } from '@/features/units/hooks'
import type { Unit } from '@/features/units/api'

const inputCss: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none', fontFamily: 'var(--font-body)',
}

// ─── Formulaire inline (create / edit) ───────────────────────────
function UnitForm({ initial, onSave, onCancel, pending }: {
  initial?: Unit
  onSave:   (data: { code: string; label: string; labelPlural: string; showOnPdf: boolean; sortOrder: number }) => void
  onCancel: () => void
  pending:  boolean
}) {
  const [code,        setCode]        = useState(initial?.code        ?? '')
  const [label,       setLabel]       = useState(initial?.label       ?? '')
  const [labelPlural, setLabelPlural] = useState(initial?.labelPlural ?? '')
  const [showOnPdf,   setShowOnPdf]   = useState(initial?.showOnPdf   ?? true)
  const [sortOrder,   setSortOrder]   = useState(initial?.sortOrder   ?? 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Code (ex: kg, m2)" maxLength={20}
          disabled={!!initial} style={{ ...inputCss, width: 110, opacity: initial ? 0.6 : 1 }} />
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Singulier (ex: Kilogramme)"
          style={{ ...inputCss, width: 180 }} />
        <input value={labelPlural} onChange={e => setLabelPlural(e.target.value)} placeholder="Pluriel (vide = même)"
          style={{ ...inputCss, width: 180 }} />
        <input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))}
          placeholder="Ordre" min={0} max={999} style={{ ...inputCss, width: 72 }} />
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>
          <input type="checkbox" checked={showOnPdf} onChange={e => setShowOnPdf(e.target.checked)} style={{ width: 14, height: 14 }} />
          Afficher l&apos;unité sur les lignes PDF
        </label>
        <button type="button" disabled={!code.trim() || !label.trim() || pending}
          onClick={() => onSave({ code: code.trim(), label: label.trim(), labelPlural: labelPlural.trim(), showOnPdf, sortOrder })}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: (!code.trim() || !label.trim() || pending) ? 0.6 : 1 }}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
        <button type="button" onClick={onCancel}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13 }}>
          <X size={13} /> Annuler
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────
export default function UnitsSettingsPage() {
  const { data: units = [], isLoading } = useAllUnits()
  const createM = useCreateUnit()
  const updateM = useUpdateUnit()
  const removeM = useRemoveUnit()

  const [showCreate, setShowCreate] = useState(false)
  const [editId,     setEditId]     = useState<string | null>(null)

  function handleCreate(data: { code: string; label: string; labelPlural: string; showOnPdf: boolean; sortOrder: number }) {
    createM.mutate({ ...data, labelPlural: data.labelPlural || null, isActive: true }, {
      onSuccess: () => setShowCreate(false),
    })
  }

  function handleUpdate(id: string, data: { code: string; label: string; labelPlural: string; showOnPdf: boolean; sortOrder: number }) {
    updateM.mutate({ id, ...data, labelPlural: data.labelPlural || null }, {
      onSuccess: () => setEditId(null),
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            Unités de mesure
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>
            Gérez les unités disponibles dans les lignes de factures, proformas et produits.
          </p>
        </div>
        {!showCreate && (
          <button type="button" onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 2px 8px rgba(45,125,210,0.2)' }}>
            <Plus size={14} /> Nouvelle unité
          </button>
        )}
      </div>

      {/* Formulaire création */}
      {showCreate && (
        <div className="card" style={{ padding: '12px 20px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>
            Nouvelle unité
          </p>
          <UnitForm
            onSave={handleCreate}
            onCancel={() => setShowCreate(false)}
            pending={createM.isPending}
          />

        </div>
      )}

      {/* Liste */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* En-tête */}
        <div style={{ display: 'grid', gridTemplateColumns: '32px 90px 140px 140px 80px 80px 80px', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          {['', 'Code', 'Singulier', 'Pluriel', 'PDF', 'Statut', ''].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {h}
            </span>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Chargement…</div>
        ) : units.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Aucune unité configurée.</div>
        ) : (
          units.map(unit => (
            <div key={unit.id}>
              {editId === unit.id ? (
                <div style={{ padding: '4px 16px', borderBottom: '1px solid var(--border)' }}>
                  <UnitForm
                    initial={unit}
                    onSave={(data) => handleUpdate(unit.id, data)}
                    onCancel={() => setEditId(null)}
                    pending={updateM.isPending}
                  />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '32px 90px 140px 140px 80px 80px 80px', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center', opacity: unit.isActive ? 1 : 0.5 }}>
                  <GripVertical size={14} style={{ color: 'var(--text-3)' }} />
                  <code style={{ fontSize: 12.5, color: 'var(--primary)', fontFamily: 'var(--font-mono)', background: 'var(--primary-light)', padding: '2px 6px', borderRadius: 4 }}>
                    {unit.code}
                  </code>
                  <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{unit.label}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{unit.labelPlural ?? <em style={{ color: 'var(--text-3)', fontSize: 12 }}>même</em>}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: unit.showOnPdf ? '#10b981' : 'var(--text-3)' }}>
                    {unit.showOnPdf ? 'Oui' : 'Non'}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: unit.isActive ? '#10b981' : 'var(--text-3)' }}>
                    {unit.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" onClick={() => setEditId(unit.id)} title="Modifier"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4, display: 'flex' }}>
                      <Pencil size={13} />
                    </button>
                    <button type="button"
                      onClick={() => unit.isActive
                        ? removeM.mutate(unit.id)
                        : updateM.mutate({ id: unit.id, isActive: true })
                      }
                      title={unit.isActive ? 'Désactiver' : 'Réactiver'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: unit.isActive ? '#f59e0b' : '#10b981', padding: 4, borderRadius: 4, display: 'flex' }}>
                      {unit.isActive ? <PowerOff size={13} /> : <Power size={13} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
        Les unités désactivées n&apos;apparaissent plus dans les sélecteurs mais restent visibles sur les documents existants.
      </p>
    </div>
  )
}
