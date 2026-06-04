'use client'

import { useState } from 'react'
import { Plus, Pencil, PowerOff, Power, Check, X, Loader2 } from 'lucide-react'
import { useAllUnits, useCreateUnit, useUpdateUnit, useRemoveUnit } from '@/features/units/hooks'
import type { Unit } from '@/features/units/api'

const inputCss: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', outline: 'none',
  fontFamily: 'var(--font-body)', width: '100%', boxSizing: 'border-box',
}

// ─── Formulaire création / édition ────────────────────────────────
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

  const canSubmit = code.trim() && label.trim() && !pending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 70px', gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            Code *
          </label>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="kg, m2…"
            maxLength={20} disabled={!!initial}
            style={{ ...inputCss, opacity: initial ? 0.6 : 1, fontFamily: 'var(--font-mono)' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            Singulier *
          </label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Kilogramme" style={inputCss} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            Pluriel <span style={{ fontWeight: 400, textTransform: 'none' }}>(vide = même)</span>
          </label>
          <input value={labelPlural} onChange={e => setLabelPlural(e.target.value)} placeholder="Kilogrammes" style={inputCss} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            Ordre
          </label>
          <input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))}
            min={0} max={999} style={inputCss} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>
          <input type="checkbox" checked={showOnPdf} onChange={e => setShowOnPdf(e.target.checked)}
            style={{ width: 14, height: 14, cursor: 'pointer' }} />
          Afficher l&apos;unité sur les lignes PDF
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onCancel}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            <X size={13} /> Annuler
          </button>
          <button type="button" disabled={!canSubmit}
            onClick={() => onSave({ code: code.trim(), label: label.trim(), labelPlural: labelPlural.trim(), showOnPdf, sortOrder })}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: canSubmit ? 'pointer' : 'not-allowed', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: canSubmit ? 1 : 0.55 }}>
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {initial ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Badge statut ─────────────────────────────────────────────────
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-display)',
      padding: '2px 8px', borderRadius: 20,
      color:       active ? '#059669' : 'var(--text-3)',
      background:  active ? 'rgba(16,185,129,0.1)' : 'var(--surface-2)',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? '#059669' : 'var(--border)', flexShrink: 0 }} />
      {active ? 'Active' : 'Inactive'}
    </span>
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

  function handleCreate(data: Parameters<typeof createM['mutate']>[0]) {
    createM.mutate({ ...data, isActive: true }, { onSuccess: () => setShowCreate(false) })
  }

  function handleUpdate(id: string, data: { code: string; label: string; labelPlural: string | null; showOnPdf: boolean; sortOrder: number }) {
    updateM.mutate({ id, ...data }, { onSuccess: () => setEditId(null) })
  }

  const thCss: React.CSSProperties = {
    padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
    fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em',
    textAlign: 'left', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  }
  const tdCss: React.CSSProperties = {
    padding: '11px 12px', fontSize: 13, color: 'var(--text-1)',
    borderBottom: '1px solid var(--border)', verticalAlign: 'middle',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            Unités de mesure
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>
            Configurez les unités disponibles dans les lignes de documents et les produits.
          </p>
        </div>
        {!showCreate && (
          <button type="button" onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 2px 8px rgba(45,125,210,0.2)', flexShrink: 0 }}>
            <Plus size={14} /> Nouvelle unité
          </button>
        )}
      </div>

      {/* Formulaire création */}
      {showCreate && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
            Nouvelle unité
          </p>
          <UnitForm
            onSave={d => handleCreate({ ...d, labelPlural: d.labelPlural || null, isActive: true })}
            onCancel={() => setShowCreate(false)}
            pending={createM.isPending}
          />
        </div>
      )}

      {/* Tableau */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thCss}>Code</th>
              <th style={thCss}>Singulier</th>
              <th style={thCss}>Pluriel</th>
              <th style={{ ...thCss, textAlign: 'center' }}>Sur PDF</th>
              <th style={{ ...thCss, textAlign: 'center' }}>Ordre</th>
              <th style={{ ...thCss, textAlign: 'center' }}>Statut</th>
              <th style={{ ...thCss, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ ...tdCss, textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                  <Loader2 size={18} className="animate-spin" style={{ display: 'inline' }} />
                </td>
              </tr>
            ) : units.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...tdCss, textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                  Aucune unité configurée.
                </td>
              </tr>
            ) : units.map(unit => (
              editId === unit.id ? (
                <tr key={unit.id}>
                  <td colSpan={7} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <UnitForm
                      initial={unit}
                      onSave={d => handleUpdate(unit.id, { ...d, labelPlural: d.labelPlural || null })}
                      onCancel={() => setEditId(null)}
                      pending={updateM.isPending}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={unit.id} style={{ opacity: unit.isActive ? 1 : 0.5 }}>
                  <td style={tdCss}>
                    <code style={{ fontSize: 12.5, color: 'var(--primary)', fontFamily: 'var(--font-mono)', background: 'var(--primary-light)', padding: '2px 7px', borderRadius: 4 }}>
                      {unit.code}
                    </code>
                  </td>
                  <td style={tdCss}>{unit.label}</td>
                  <td style={{ ...tdCss, color: unit.labelPlural ? 'var(--text-1)' : 'var(--text-3)' }}>
                    {unit.labelPlural ?? <em style={{ fontSize: 12 }}>même</em>}
                  </td>
                  <td style={{ ...tdCss, textAlign: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: unit.showOnPdf ? '#059669' : 'var(--text-3)' }}>
                      {unit.showOnPdf ? 'Oui' : 'Non'}
                    </span>
                  </td>
                  <td style={{ ...tdCss, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>
                    {unit.sortOrder}
                  </td>
                  <td style={{ ...tdCss, textAlign: 'center' }}>
                    <StatusBadge active={unit.isActive} />
                  </td>
                  <td style={{ ...tdCss, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => setEditId(unit.id)} title="Modifier"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                        <Pencil size={12} /> Modifier
                      </button>
                      <button type="button"
                        onClick={() => unit.isActive ? removeM.mutate(unit.id) : updateM.mutate({ id: unit.id, isActive: true })}
                        title={unit.isActive ? 'Désactiver' : 'Réactiver'}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 'var(--radius-md)', border: `1.5px solid ${unit.isActive ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.4)'}`, background: unit.isActive ? 'rgba(245,158,11,0.06)' : 'rgba(16,185,129,0.06)', color: unit.isActive ? '#d97706' : '#059669', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                        {unit.isActive ? <><PowerOff size={12} /> Désactiver</> : <><Power size={12} /> Réactiver</>}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
        Les unités désactivées n&apos;apparaissent plus dans les sélecteurs mais restent visibles sur les documents existants.
      </p>
    </div>
  )
}
