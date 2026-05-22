'use client'

import type { ColumnMapping, ColumnRole, NumberFormat } from '../types'

// ── Constantes ────────────────────────────────────────────────────────────────

const ROLES: Array<{ value: ColumnRole; label: string; required?: boolean }> = [
  { value: 'date',      label: 'Date',           required: true },
  { value: 'label',     label: 'Libellé',         required: true },
  { value: 'debit',     label: 'Débit' },
  { value: 'credit',    label: 'Crédit' },
  { value: 'amount',    label: 'Montant (signé)' },
  { value: 'direction', label: 'Sens (D/C)' },
  { value: 'reference', label: 'Référence' },
  { value: 'balance',   label: 'Solde' },
  { value: 'valueDate', label: 'Date valeur' },
  { value: 'ignore',    label: '— Ignorer —' },
]

const DATE_FORMATS = [
  'DD/MM/YYYY', 'DD/MM/YY', 'MM/DD/YYYY',
  'YYYY-MM-DD', 'DD-MM-YYYY', 'MMM DD YYYY',
]

const THOUSANDS_OPTIONS = [
  { value: '',  label: 'Aucun' },
  { value: ' ', label: 'Espace' },
  { value: '.', label: 'Point (.)' },
  { value: ',', label: 'Virgule (,)' },
]

const DECIMAL_OPTIONS = [
  { value: ',', label: 'Virgule (,)' },
  { value: '.', label: 'Point (.)' },
]

// ── Utilitaires ───────────────────────────────────────────────────────────────

function roleForColumn(col: string, mapping: ColumnMapping): ColumnRole {
  if (mapping.date         === col) return 'date'
  if (mapping.label        === col) return 'label'
  if (mapping.debit        === col) return 'debit'
  if (mapping.credit       === col) return 'credit'
  if (mapping.amount       === col) return 'amount'
  if (mapping.direction    === col) return 'direction'
  if (mapping.reference    === col) return 'reference'
  if (mapping.balanceAfter === col) return 'balance'
  if (mapping.valueDate    === col) return 'valueDate'
  return 'ignore'
}

function applyRole(
  col: string,
  role: ColumnRole,
  prev: ColumnMapping,
): ColumnMapping {
  // Retirer col de toutes les clés existantes
  const next: ColumnMapping = {
    date:         prev.date         === col ? '' : prev.date,
    label:        prev.label        === col ? '' : prev.label,
    debit:        prev.debit        === col ? undefined : prev.debit,
    credit:       prev.credit       === col ? undefined : prev.credit,
    amount:       prev.amount       === col ? undefined : prev.amount,
    direction:    prev.direction    === col ? undefined : prev.direction,
    reference:    prev.reference    === col ? undefined : prev.reference,
    balanceAfter: prev.balanceAfter === col ? undefined : prev.balanceAfter,
    valueDate:    prev.valueDate    === col ? undefined : prev.valueDate,
  }
  // Appliquer le nouveau rôle
  if (role === 'date')      next.date         = col
  if (role === 'label')     next.label        = col
  if (role === 'debit')     next.debit        = col
  if (role === 'credit')    next.credit       = col
  if (role === 'amount')    next.amount       = col
  if (role === 'direction') next.direction    = col
  if (role === 'reference') next.reference    = col
  if (role === 'balance')   next.balanceAfter = col
  if (role === 'valueDate') next.valueDate    = col
  return next
}

function isValid(mapping: ColumnMapping): boolean {
  return !!mapping.date && !!mapping.label &&
    !!(mapping.debit || mapping.credit || mapping.amount)
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ColumnMapperProps {
  headers:      string[]
  sampleRows:   string[][]
  mapping:      ColumnMapping
  dateFormat:   string
  numberFormat: NumberFormat
  onMappingChange:     (m: ColumnMapping) => void
  onDateFormatChange:  (f: string) => void
  onNumberFormatChange:(f: NumberFormat) => void
}

// ── Composant ─────────────────────────────────────────────────────────────────

export function ColumnMapper({
  headers, sampleRows, mapping, dateFormat, numberFormat,
  onMappingChange, onDateFormatChange, onNumberFormatChange,
}: ColumnMapperProps) {
  const valid = isValid(mapping)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Avertissement si configuration incomplète */}
      {!valid && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: '#fef3c7', border: '1px solid #fde68a', fontSize: 12.5, color: '#92400e' }}>
          Assignez au minimum : <strong>Date</strong>, <strong>Libellé</strong> et un champ montant (<strong>Débit+Crédit</strong> ou <strong>Montant signé</strong>).
        </div>
      )}

      {/* Table de mapping */}
      <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', borderBottom: '1px solid var(--border)' }}>Colonne</th>
              <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', borderBottom: '1px solid var(--border)' }}>Exemples</th>
              <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', borderBottom: '1px solid var(--border)', minWidth: 160 }}>Rôle</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((col, ci) => {
              const role    = roleForColumn(col, mapping)
              const samples = sampleRows.map(row => row[ci] ?? '').filter(Boolean).slice(0, 2)
              const isAssigned = role !== 'ignore'
              const isRequired = role === 'date' || role === 'label'

              return (
                <tr key={ci} style={{ borderBottom: '1px solid var(--border)', background: isAssigned ? 'rgba(45,125,210,0.02)' : undefined }}>
                  <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: isAssigned ? 'var(--primary)' : 'var(--text-2)', fontWeight: isAssigned ? 600 : 400 }}>
                    {col}
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--text-3)', fontSize: 12 }}>
                    {samples.length > 0
                      ? samples.map((s, i) => (
                          <span key={i} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{s}</span>
                        ))
                      : <span style={{ fontStyle: 'italic' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '7px 14px' }}>
                    <select
                      value={role}
                      onChange={e => onMappingChange(applyRole(col, e.target.value as ColumnRole, mapping))}
                      style={{
                        width: '100%', padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1.5px solid ${isRequired ? 'var(--primary)' : isAssigned ? 'rgba(45,125,210,0.4)' : 'var(--border)'}`,
                        background: 'var(--surface)', color: 'var(--text-1)',
                        fontSize: 12.5, fontFamily: 'var(--font-display)',
                        outline: 'none', cursor: 'pointer',
                      }}
                    >
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Options de format */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>Format de date</label>
          <select
            value={dateFormat}
            onChange={e => onDateFormatChange(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none', cursor: 'pointer' }}
          >
            {DATE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>Séparateur milliers</label>
          <select
            value={numberFormat.thousands}
            onChange={e => onNumberFormatChange({ ...numberFormat, thousands: e.target.value })}
            style={{ padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none', cursor: 'pointer' }}
          >
            {THOUSANDS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>Séparateur décimal</label>
          <select
            value={numberFormat.decimal}
            onChange={e => onNumberFormatChange({ ...numberFormat, decimal: e.target.value })}
            style={{ padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none', cursor: 'pointer' }}
          >
            {DECIMAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Indicateur d'état */}
      <div style={{ fontSize: 12, color: valid ? '#16a34a' : 'var(--text-3)' }}>
        {valid
          ? '✓ Mapping complet — vous pouvez prévisualiser'
          : `Manquant : ${[!mapping.date && 'date', !mapping.label && 'libellé', !(mapping.debit || mapping.credit || mapping.amount) && 'montant'].filter(Boolean).join(', ')}`
        }
      </div>
    </div>
  )
}
