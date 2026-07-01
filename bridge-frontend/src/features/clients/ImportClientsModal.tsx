'use client'

import { OverlayPortal } from '@/components/ui/OverlayPortal'

/**
 * ImportClientsModal — import en masse de clients depuis un fichier Excel.
 *
 * Flux :
 *  1. Drag & drop ou clic pour uploader un .xlsx / .xls / .csv
 *  2. Parsing SheetJS côté client → validation locale
 *  3. Aperçu en tableau : lignes valides / erreurs / doublons potentiels
 *  4. Confirmation → POST /clients/import → résumé du résultat
 *
 * Accès : admin et commercial uniquement (vérifié côté backend + UI cachée en dehors)
 */

import { useState, useCallback, useRef, useId } from 'react'
import { read, utils, writeFile } from 'xlsx'
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle,
  AlertTriangle, Download, Loader2, Users,
} from 'lucide-react'
import { useImportClients } from './hooks'
import type { ImportPreviewRow, ImportClientRow } from './types'

// ─── Colonnes attendues → mapping souple (insensible à la casse) ──────────────
const COLUMN_MAP: Record<string, keyof ImportClientRow> = {
  'nom':                    'name',
  'name':                   'name',
  'type':                   'type',
  'email':                  'email',
  'téléphone':              'phone',
  'telephone':              'phone',
  'phone':                  'phone',
  'téléphone 2':            'phone2',
  'telephone 2':            'phone2',
  'phone2':                 'phone2',
  'adresse':                'address',
  'address':                'address',
  'ville':                  'city',
  'city':                   'city',
  'pays':                   'country',
  'country':                'country',
  'boîte postale':          'postalBox',
  'boite postale':          'postalBox',
  'postalbox':              'postalBox',
  'nif':                    'taxNumber',
  'niu':                    'taxNumber',
  'taxnumber':              'taxNumber',
  'rccm':                   'rccm',
  'devise':                 'currency',
  'currency':               'currency',
  'conditions de paiement': 'defaultPaymentTerms',
  'defaultpaymentterms':    'defaultPaymentTerms',
  'notes internes':         'internalNotes',
  'internalnotes':          'internalNotes',
}

// ─── Validation locale d'une ligne ───────────────────────────────────────────
function validateRow(row: ImportClientRow, idx: number): ImportPreviewRow {
  if (!row.name?.trim()) {
    return { ...row, _rowIndex: idx, _status: 'error', _message: 'Nom obligatoire' }
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    return { ...row, _rowIndex: idx, _status: 'error', _message: `Email invalide : ${row.email}` }
  }
  if (row.type && !['company', 'individual'].includes(row.type)) {
    return { ...row, _rowIndex: idx, _status: 'error', _message: `Type invalide (company ou individual) : ${row.type}` }
  }
  if (row.currency && row.currency.length !== 3) {
    return { ...row, _rowIndex: idx, _status: 'error', _message: `Devise invalide (3 lettres) : ${row.currency}` }
  }
  return { ...row, _rowIndex: idx, _status: 'valid' }
}

// ─── Génération du fichier modèle ─────────────────────────────────────────────
export function downloadTemplate() {
  const headers = [
    'Nom*', 'Type', 'Email', 'Téléphone', 'Téléphone 2',
    'Adresse', 'Ville', 'Pays', 'Boîte postale',
    'NIF', 'RCCM',
    'Devise', 'Conditions de paiement', 'Notes internes',
  ]
  const example = [
    'Société Exemple SA', 'company', 'contact@exemple.cm', '699 000 001', '',
    'Rue de la Paix, Akwa', 'Douala', 'Cameroun', 'BP 1234',
    'M012345678901Z', 'RC/DLA/2020/B/1234',
    'XAF', 'Paiement à 30 jours', '',
  ]
  const ws = utils.aoa_to_sheet([headers, example])
  ws['!cols'] = headers.map(() => ({ wch: 22 }))
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Clients')
  writeFile(wb, 'clients_modele.xlsx')
}

// ─── Statut badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, message }: { status: ImportPreviewRow['_status']; message?: string }) {
  if (status === 'valid')     return <span style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 3 }}><CheckCircle2 size={12} aria-hidden />Valide</span>
  if (status === 'duplicate') return <span style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 3 }} title={message}><AlertTriangle size={12} aria-hidden />Doublon</span>
  return <span style={{ fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 3 }} title={message}><AlertCircle size={12} aria-hidden />Erreur</span>
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface ImportClientsModalProps {
  open:    boolean
  onClose: () => void
}

// ─── Modal principale ─────────────────────────────────────────────────────────
export function ImportClientsModal({ open, onClose }: ImportClientsModalProps) {
  const importMut  = useImportClients()
  const fileId     = useId()

  const [dragging,  setDragging]  = useState(false)
  const [fileName,  setFileName]  = useState<string | null>(null)
  const [rows,      setRows]      = useState<ImportPreviewRow[]>([])
  const [step,      setStep]      = useState<'upload' | 'preview' | 'done'>('upload')
  const [result,    setResult]    = useState<{ created: number; duplicates: number; errors: number } | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const reset = useCallback(() => {
    setDragging(false); setFileName(null); setRows([]); setStep('upload'); setResult(null)
  }, [])

  const handleClose = useCallback(() => { reset(); onClose() }, [reset, onClose])

  // ── Parsing du fichier Excel ────────────────────────────────────────────────
  const parseFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb   = read(e.target?.result, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const raw  = utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        const parsed: ImportPreviewRow[] = raw.map((rawRow, idx) => {
          const row: Partial<ImportClientRow> = {}
          for (const [col, val] of Object.entries(rawRow)) {
            const key = COLUMN_MAP[col.toLowerCase().trim().replace('*', '')]
            if (key) (row as Record<string, unknown>)[key] = String(val).trim() || undefined
          }
          // Normaliser le type
          if (row.type) {
            const t = row.type.toLowerCase()
            row.type = t === 'individual' || t === 'particulier' ? 'individual' : 'company'
          }
          return validateRow(row as ImportClientRow, idx)
        })

        setRows(parsed)
        setFileName(file.name)
        setStep('preview')
      } catch {
        alert('Fichier invalide. Veuillez utiliser le modèle Excel fourni.')
      }
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    e.target.value = ''
  }, [parseFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }, [parseFile])

  // ── Confirmation de l'import ────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    const validRows = rows.filter(r => r._status === 'valid').map(({ _rowIndex, _status, _message, ...row }) => row as ImportClientRow)
    if (validRows.length === 0) return
    const res = await importMut.mutateAsync(validRows)
    setResult({ created: res.created, duplicates: res.duplicates.length, errors: res.errors.length })
    setStep('done')
  }, [rows, importMut])

  // ── Stats de la preview ─────────────────────────────────────────────────────
  const validCount     = rows.filter(r => r._status === 'valid').length
  const errorCount     = rows.filter(r => r._status === 'error').length
  const duplicateCount = rows.filter(r => r._status === 'duplicate').length

  if (!open) return null

  return (
    <OverlayPortal>
    <div
      role="dialog" aria-modal="true" aria-label="Import de clients"
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', padding: 16 }}
      onClick={handleClose}
    >
      <div
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: step === 'preview' ? 760 : 500, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={15} style={{ color: 'var(--primary)' }} aria-hidden />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              {step === 'done' ? 'Import terminé' : 'Importer des clients'}
            </h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0 }}>
              {step === 'upload' && 'Chargez un fichier Excel (.xlsx) pour créer des clients en masse'}
              {step === 'preview' && `${rows.length} ligne${rows.length > 1 ? 's' : ''} détectée${rows.length > 1 ? 's' : ''} dans ${fileName}`}
              {step === 'done' && 'Les clients ont été créés avec succès'}
            </p>
          </div>
          <button type="button" onClick={handleClose} aria-label="Fermer"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, display: 'flex' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent' }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ÉTAPE 1 : Upload */}
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Zone drag & drop */}
              <div
                ref={dropRef}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  background: dragging ? 'var(--primary-light)' : 'var(--surface)',
                  padding: '32px 20px',
                  textAlign: 'center',
                  transition: 'border-color 0.15s, background 0.15s',
                  cursor: 'pointer',
                }}
                onClick={() => document.getElementById(fileId)?.click()}
              >
                <FileSpreadsheet size={32} style={{ color: dragging ? 'var(--primary)' : 'var(--text-3)', margin: '0 auto 12px' }} aria-hidden />
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
                  Glissez votre fichier ici
                </p>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
                  ou cliquez pour choisir un fichier
                </p>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>
                  .xlsx · .xls · .csv — max 1 000 lignes
                </span>
                <input
                  id={fileId} type="file" accept=".xlsx,.xls,.csv"
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                />
              </div>

              {/* Télécharger le modèle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <FileSpreadsheet size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} aria-hidden />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Pas encore de fichier ?</p>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Téléchargez le modèle Excel avec toutes les colonnes et une ligne d'exemple</p>
                </div>
                <button type="button" onClick={downloadTemplate}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  <Download size={13} aria-hidden /> Modèle
                </button>
              </div>

              {/* Colonnes attendues */}
              <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Colonnes reconnues</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {['Nom*', 'Type', 'Email', 'Téléphone', 'Adresse', 'Ville', 'Pays', 'NIF', 'RCCM', 'Devise', 'Notes internes'].map(col => (
                    <span key={col} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: col.endsWith('*') ? 'rgba(45,125,210,0.1)' : 'var(--surface-2)', color: col.endsWith('*') ? 'var(--primary)' : 'var(--text-2)', border: `1px solid ${col.endsWith('*') ? 'rgba(45,125,210,0.2)' : 'var(--border)'}`, fontFamily: 'var(--font-mono)' }}>
                      {col}
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '6px 0 0' }}>* Obligatoire</p>
              </div>
            </div>
          )}

          {/* ÉTAPE 2 : Preview */}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Stats */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: 'Prêts à importer', count: validCount,     color: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
                  { label: 'Erreurs',           count: errorCount,     color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
                  { label: 'Doublons potentiels', count: duplicateCount, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
                ].map(s => (
                  <div key={s.label} style={{ flex: '1 1 120px', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: s.bg, border: `1px solid ${s.color}30` }}>
                    <p style={{ fontSize: 20, fontWeight: 800, color: s.color, margin: '0 0 2px', fontFamily: 'var(--font-display)' }}>{s.count}</p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: 0 }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Tableau */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)', position: 'sticky', top: 0 }}>
                        {['#', 'Nom', 'Type', 'Email', 'Ville', 'NIF', 'Statut'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row._rowIndex}
                          style={{ background: row._status === 'error' ? 'rgba(239,68,68,0.04)' : row._status === 'duplicate' ? 'rgba(245,158,11,0.04)' : 'transparent', borderBottom: '1px solid var(--border)' }}
                        >
                          <td style={{ padding: '7px 12px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{row._rowIndex + 1}</td>
                          <td style={{ padding: '7px 12px', fontWeight: 500, color: 'var(--text-1)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name || '—'}</td>
                          <td style={{ padding: '7px 12px', color: 'var(--text-2)' }}>{row.type === 'individual' ? 'Particulier' : 'Entreprise'}</td>
                          <td style={{ padding: '7px 12px', color: 'var(--text-2)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.email || '—'}</td>
                          <td style={{ padding: '7px 12px', color: 'var(--text-2)' }}>{row.city || '—'}</td>
                          <td style={{ padding: '7px 12px', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{row.taxNumber || '—'}</td>
                          <td style={{ padding: '7px 12px' }}><StatusBadge status={row._status} message={row._message} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {errorCount > 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                  Les lignes en erreur et les doublons seront ignorés. Seules les <strong>{validCount}</strong> lignes valides seront créées.
                </p>
              )}
            </div>
          )}

          {/* ÉTAPE 3 : Résultat */}
          {step === 'done' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '16px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={28} style={{ color: '#22c55e' }} aria-hidden />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 4px' }}>
                  {result.created} client{result.created > 1 ? 's' : ''} créé{result.created > 1 ? 's' : ''}
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
                  {result.duplicates > 0 && `${result.duplicates} doublon${result.duplicates > 1 ? 's' : ''} ignoré${result.duplicates > 1 ? 's' : ''}`}
                  {result.duplicates > 0 && result.errors > 0 && ' · '}
                  {result.errors > 0 && `${result.errors} erreur${result.errors > 1 ? 's' : ''} ignorée${result.errors > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 8, background: 'var(--surface)' }}>
          {step === 'upload' && (
            <button type="button" onClick={handleClose}
              style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}>
              Annuler
            </button>
          )}

          {step === 'preview' && (
            <>
              <button type="button" onClick={reset}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}>
                ← Changer de fichier
              </button>
              <button type="button" onClick={handleConfirm} disabled={validCount === 0 || importMut.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: validCount === 0 ? 'var(--border)' : 'var(--primary)', color: validCount === 0 ? 'var(--text-3)' : '#fff', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: validCount === 0 || importMut.isPending ? 'not-allowed' : 'pointer', opacity: importMut.isPending ? 0.65 : 1 }}>
                {importMut.isPending
                  ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Import en cours…</>
                  : <><Upload size={14} aria-hidden /> Importer {validCount} client{validCount > 1 ? 's' : ''}</>}
              </button>
            </>
          )}

          {step === 'done' && (
            <button type="button" onClick={handleClose}
              style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}>
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
    </OverlayPortal>
  )
}
