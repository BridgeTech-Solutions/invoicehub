'use client'

import { OverlayPortal } from '@/components/ui/OverlayPortal'

/**
 * ImportProductsModal — import en masse de produits/services depuis un fichier Excel.
 *
 * Flux :
 *  1. Drag & drop ou clic pour uploader un .xlsx / .xls / .csv
 *  2. Parsing SheetJS côté client → validation locale
 *  3. Aperçu en tableau : lignes valides / erreurs / doublons potentiels
 *  4. Confirmation → POST /products/import → résumé du résultat
 *
 * Accès : admin et commercial uniquement (vérifié côté backend + UI cachée en dehors)
 */

import { useState, useCallback, useRef, useId } from 'react'
import { read, utils, writeFile } from 'xlsx'
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle,
  AlertTriangle, Loader2, Package,
} from 'lucide-react'
import { useImportProducts } from './hooks'
import type { ImportPreviewProductRow, ImportProductRow, ProductUnit, ProductCategory } from './types'

// Les unités sont dynamiques (table units) — on accepte n'importe quelle string non vide
const VALID_UNITS: ProductUnit[] = [] // conservé pour compat, non utilisé pour validation

// ─── Colonnes attendues → mapping souple (insensible à la casse) ──────────────
const COLUMN_MAP: Record<string, keyof ImportProductRow | 'categoryName'> = {
  'désignation':           'name',
  'designation':           'name',
  'nom':                   'name',
  'name':                  'name',
  'référence':             'reference',
  'reference':             'reference',
  'ref':                   'reference',
  'réf':                   'reference',
  'type':                  'type',
  'catégorie':             'categoryName',
  'categorie':             'categoryName',
  'category':              'categoryName',
  'prix ht':               'unitPriceHt',
  'prix unitaire ht':      'unitPriceHt',
  'unitpriceht':           'unitPriceHt',
  'tva %':                 'taxRateValue',
  'tva':                   'taxRateValue',
  'taxratevalue':          'taxRateValue',
  'unité':                 'unit',
  'unite':                 'unit',
  'unit':                  'unit',
  'description':           'description',
  'actif':                 'isActive',
  'isactive':              'isActive',
  'active':                'isActive',
}

// ─── Validation locale d'une ligne ───────────────────────────────────────────
function validateRow(row: ImportProductRow, idx: number): ImportPreviewProductRow {
  if (!row.name?.trim()) {
    return { ...row, _rowIndex: idx, _status: 'error', _message: 'Désignation obligatoire' }
  }
  if (row.type && !['product', 'service'].includes(row.type)) {
    return { ...row, _rowIndex: idx, _status: 'error', _message: `Type invalide (product ou service) : ${row.type}` }
  }
  if (row.unit && !row.unit.trim()) {
    return { ...row, _rowIndex: idx, _status: 'error', _message: `Unité invalide : ${row.unit} (valeurs : ${VALID_UNITS.join(', ')})` }
  }
  if (row.unitPriceHt !== undefined && (isNaN(row.unitPriceHt) || row.unitPriceHt < 0)) {
    return { ...row, _rowIndex: idx, _status: 'error', _message: `Prix HT invalide : ${row.unitPriceHt}` }
  }
  if (row.taxRateValue !== undefined && (isNaN(row.taxRateValue) || row.taxRateValue < 0 || row.taxRateValue > 100)) {
    return { ...row, _rowIndex: idx, _status: 'error', _message: `TVA invalide (0-100) : ${row.taxRateValue}` }
  }
  return { ...row, _rowIndex: idx, _status: 'valid' }
}

// ─── Normalise la valeur booléenne isActive ───────────────────────────────────
function parseBool(val: unknown): boolean {
  if (typeof val === 'boolean') return val
  if (typeof val === 'string') {
    const v = val.toLowerCase().trim()
    return v === 'oui' || v === 'yes' || v === '1' || v === 'true'
  }
  if (typeof val === 'number') return val === 1
  return true // défaut actif
}

// ─── Génération du fichier modèle ─────────────────────────────────────────────
export function downloadProductTemplate() {
  const headers = [
    'Désignation*', 'Référence', 'Type', 'Catégorie',
    'Prix HT', 'TVA %', 'Unité', 'Description', 'Actif',
  ]
  const example = [
    'Audit Sécurité', 'AUDIT-001', 'service', 'Conseil',
    '150000', '19.25', 'forfait', 'Audit complet infrastructure', 'Oui',
  ]
  const example2 = [
    'Switch 24 ports', 'HW-SW24', 'product', 'Matériel',
    '85000', '19.25', 'piece', 'Switch manageable 24 ports', 'Oui',
  ]
  const legend = [
    '* obligatoire', '', 'product / service', 'Nom de catégorie existante',
    'Nombre (ex: 150000)', '0-100 (défaut 19.25)', VALID_UNITS.join(' | '), '', 'Oui / Non',
  ]
  const ws = utils.aoa_to_sheet([headers, example, example2, [], legend])
  ws['!cols'] = headers.map((_, i) => ({ wch: i === 7 ? 30 : 20 }))
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Produits')
  writeFile(wb, 'produits_modele.xlsx')
}

// ─── Statut badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, message }: { status: ImportPreviewProductRow['_status']; message?: string }) {
  if (status === 'valid')     return <span style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 3 }}><CheckCircle2 size={12} aria-hidden />Valide</span>
  if (status === 'duplicate') return <span style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 3 }} title={message}><AlertTriangle size={12} aria-hidden />Doublon</span>
  return <span style={{ fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 3 }} title={message}><AlertCircle size={12} aria-hidden />Erreur</span>
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface ImportProductsModalProps {
  open:       boolean
  onClose:    () => void
  categories: ProductCategory[]
}

// ─── Modal principale ─────────────────────────────────────────────────────────
export function ImportProductsModal({ open, onClose, categories }: ImportProductsModalProps) {
  const importMut = useImportProducts()
  const fileId    = useId()

  const [dragging,  setDragging]  = useState(false)
  const [fileName,  setFileName]  = useState<string | null>(null)
  const [rows,      setRows]      = useState<ImportPreviewProductRow[]>([])
  const [step,      setStep]      = useState<'upload' | 'preview' | 'done'>('upload')
  const [result,    setResult]    = useState<{ created: number; duplicates: number; errors: number } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStep('upload')
    setRows([])
    setFileName(null)
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  // ── Parse le fichier Excel ────────────────────────────────────────────────
  const parseFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb   = read(e.target?.result, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const raw  = utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        if (raw.length === 0) return

        const parsed: ImportPreviewProductRow[] = raw.map((rawRow, idx) => {
          const row: Record<string, unknown> = {}
          Object.entries(rawRow).forEach(([col, val]) => {
            const key = COLUMN_MAP[col.trim().toLowerCase()]
            if (key) row[key] = val
          })

          // Normalise type
          let type = (row['type'] as string | undefined)?.toLowerCase()?.trim()
          if (type && !['product', 'service'].includes(type)) type = undefined

          // Normalise unit
          let unit = (row['unit'] as string | undefined)?.toLowerCase()?.trim() as ProductUnit | undefined
          if (unit && !VALID_UNITS.includes(unit)) unit = undefined

          const built: ImportProductRow = {
            name:          String(row['name'] ?? '').trim(),
            reference:     row['reference'] ? String(row['reference']).trim() : undefined,
            type:          (type as 'product' | 'service') ?? 'product',
            categoryName:  row['categoryName'] ? String(row['categoryName']).trim() : undefined,
            unitPriceHt:   row['unitPriceHt'] !== '' ? Number(row['unitPriceHt']) : 0,
            taxRateValue:  row['taxRateValue'] !== '' ? Number(row['taxRateValue']) : 19.25,
            unit:          unit ?? 'piece',
            description:   row['description'] ? String(row['description']).trim() : undefined,
            isActive:      parseBool(row['isActive']),
          }
          return validateRow(built, idx)
        })

        setRows(parsed)
        setFileName(file.name)
        setStep('preview')
      } catch {
        // ignore parse error
      }
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  // ── Confirmer l'import ────────────────────────────────────────────────────
  const handleConfirm = async () => {
    const valid = rows.filter(r => r._status === 'valid') as (ImportPreviewProductRow & { _status: 'valid' })[]
    if (valid.length === 0) return

    const payload: ImportProductRow[] = valid.map(({ _rowIndex: _r, _status: _s, _message: _m, ...rest }) => rest)

    importMut.mutate(payload, {
      onSuccess: (res) => {
        setResult({
          created:    res.created,
          duplicates: res.duplicates.length,
          errors:     res.errors.length,
        })
        setStep('done')
      },
    })
  }

  if (!open) return null

  const validCount     = rows.filter(r => r._status === 'valid').length
  const errorCount     = rows.filter(r => r._status === 'error').length
  const duplicateCount = rows.filter(r => r._status === 'duplicate').length

  // ── Catégories connues pour affichage ─────────────────────────────────────
  const catNames = new Set(categories.map(c => c.name.toLowerCase()))

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24,
  }

  const panelStyle: React.CSSProperties = {
    width: '100%', maxWidth: step === 'preview' ? 820 : 480,
    maxHeight: '92vh', overflowY: 'auto',
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
    display: 'flex', flexDirection: 'column',
  }

  return (
    <OverlayPortal>
    <div role="dialog" aria-modal="true" aria-label="Importer des produits" style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={17} style={{ color: 'var(--primary)' }} aria-hidden />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>Import de produits & services</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {step === 'upload'  && 'Importez jusqu\'à 500 lignes depuis un fichier Excel'}
                {step === 'preview' && `${rows.length} ligne${rows.length > 1 ? 's' : ''} détectée${rows.length > 1 ? 's' : ''} — ${fileName}`}
                {step === 'done'    && 'Import terminé'}
              </p>
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label="Fermer"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-md)' }}>
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>

          {/* ── Étape 1 : upload ── */}
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  background: dragging ? 'rgba(45,125,210,0.04)' : 'var(--bg)',
                  padding: '40px 24px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Upload size={22} style={{ color: 'var(--primary)' }} aria-hidden />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>Glissez votre fichier ici</p>
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>ou cliquez pour sélectionner — .xlsx, .xls, .csv</p>
                </div>
                <label htmlFor={fileId} className="sr-only">Sélectionner un fichier</label>
                <input
                  id={fileId}
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </div>

              {/* Info colonnes */}
              <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(45,125,210,0.05)', border: '1px solid rgba(45,125,210,0.15)' }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Colonnes reconnues</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                  {[
                    ['Désignation*', 'obligatoire'],
                    ['Référence', 'pour déduplication'],
                    ['Type', 'product / service'],
                    ['Catégorie', 'nom de catégorie existante'],
                    ['Prix HT', 'nombre décimal'],
                    ['TVA %', 'défaut 19.25'],
                    ['Unité', VALID_UNITS.slice(0, 4).join(', ') + '…'],
                    ['Actif', 'Oui / Non'],
                  ].map(([col, hint]) => (
                    <div key={col} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <code style={{ fontSize: 11, background: 'rgba(45,125,210,0.1)', color: 'var(--primary)', padding: '1px 5px', borderRadius: 4 }}>{col}</code>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{hint}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Catégories disponibles */}
              {categories.length > 0 && (
                <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Catégories disponibles</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {categories.map(cat => (
                      <span key={cat.id} style={{
                        fontSize: 11.5, padding: '3px 10px', borderRadius: 20,
                        background: cat.color ? `${cat.color}22` : 'rgba(45,125,210,0.08)',
                        color:      cat.color ?? 'var(--primary)',
                        fontFamily: 'var(--font-display)', fontWeight: 500,
                        border: `1px solid ${cat.color ? `${cat.color}44` : 'rgba(45,125,210,0.2)'}`,
                      }}>
                        {cat.icon && <span aria-hidden style={{ marginRight: 4 }}>{cat.icon}</span>}
                        {cat.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Bouton modèle */}
              <button type="button" onClick={downloadProductTemplate}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                <FileSpreadsheet size={14} aria-hidden /> Télécharger le modèle Excel
              </button>
            </div>
          )}

          {/* ── Étape 2 : preview ── */}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Stats */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[
                  { label: 'Valides',   count: validCount,     color: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
                  { label: 'Erreurs',   count: errorCount,     color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
                  { label: 'Doublons',  count: duplicateCount, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
                ].map(({ label, count, color, bg }) => (
                  <div key={label} style={{ flex: '1 1 100px', textAlign: 'center', padding: '10px 8px', borderRadius: 'var(--radius-md)', background: bg, border: `1px solid ${color}33` }}>
                    <p style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'var(--font-display)' }}>{count}</p>
                    <p style={{ fontSize: 12, color, opacity: 0.85 }}>{label}</p>
                  </div>
                ))}
              </div>

              {/* Table preview */}
              <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      {['#', 'Désignation', 'Réf.', 'Type', 'Catégorie', 'Prix HT', 'TVA', 'Unité', 'Statut'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const catUnknown = row.categoryName && !catNames.has(row.categoryName.toLowerCase())
                      return (
                        <tr key={row._rowIndex} style={{ borderBottom: '1px solid var(--border)', background: row._status === 'error' ? 'rgba(239,68,68,0.03)' : row._status === 'duplicate' ? 'rgba(245,158,11,0.03)' : undefined }}>
                          <td style={{ padding: '7px 10px', color: 'var(--text-3)' }}>{row._rowIndex + 1}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text-1)', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name || '—'}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>{row.reference || '—'}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text-2)' }}>{row.type === 'service' ? 'Prestation' : 'Produit'}</td>
                          <td style={{ padding: '7px 10px' }}>
                            {row.categoryName
                              ? <span style={{ color: catUnknown ? '#f59e0b' : 'var(--text-2)' }} title={catUnknown ? 'Catégorie inconnue — sera ignorée' : undefined}>
                                  {row.categoryName}
                                  {catUnknown && <AlertTriangle size={10} aria-hidden style={{ marginLeft: 3, display: 'inline' }} />}
                                </span>
                              : <span style={{ color: 'var(--text-3)' }}>—</span>
                            }
                          </td>
                          <td style={{ padding: '7px 10px', color: 'var(--text-2)', textAlign: 'right' }}>{(row.unitPriceHt ?? 0).toLocaleString('fr-FR')}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text-3)' }}>{row.taxRateValue ?? 19.25}%</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text-3)' }}>{row.unit ?? 'piece'}</td>
                          <td style={{ padding: '7px 10px' }}><StatusBadge status={row._status} message={row._message} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {errorCount > 0 && (
                <p style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.07)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                  {errorCount} ligne{errorCount > 1 ? 's' : ''} en erreur sera{errorCount > 1 ? 'ont' : ''} ignorée{errorCount > 1 ? 's' : ''}.
                </p>
              )}
              {duplicateCount > 0 && (
                <p style={{ fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.07)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                  {duplicateCount} doublon{duplicateCount > 1 ? 's' : ''} potentiel{duplicateCount > 1 ? 's' : ''} détecté{duplicateCount > 1 ? 's' : ''} — ces lignes seront ignorées.
                </p>
              )}
            </div>
          )}

          {/* ── Étape 3 : done ── */}
          {step === 'done' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 8 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={28} style={{ color: '#22c55e' }} aria-hidden />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>Import terminé</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', padding: '10px 20px', borderRadius: 'var(--radius-md)', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <p style={{ fontSize: 24, fontWeight: 700, color: '#22c55e', fontFamily: 'var(--font-display)' }}>{result.created}</p>
                  <p style={{ fontSize: 12, color: '#22c55e' }}>créé{result.created > 1 ? 's' : ''}</p>
                </div>
                {result.duplicates > 0 && (
                  <div style={{ textAlign: 'center', padding: '10px 20px', borderRadius: 'var(--radius-md)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <p style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-display)' }}>{result.duplicates}</p>
                    <p style={{ fontSize: 12, color: '#f59e0b' }}>doublon{result.duplicates > 1 ? 's' : ''}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: 8 }}>
          {step === 'upload' && (
            <button type="button" onClick={handleClose}
              style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
              Annuler
            </button>
          )}

          {step === 'preview' && (
            <>
              <button type="button" onClick={reset}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                ← Choisir un autre fichier
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={validCount === 0 || importMut.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 20px', borderRadius: 'var(--radius-md)', background: validCount === 0 ? 'var(--border)' : 'var(--primary)', color: '#fff', border: 'none', fontSize: 13.5, cursor: validCount === 0 ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: validCount > 0 ? '0 4px 12px rgba(45,125,210,0.3)' : 'none' }}>
                {importMut.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />}
                Importer {validCount > 0 ? `(${validCount})` : ''}
              </button>
            </>
          )}

          {step === 'done' && (
            <div style={{ marginLeft: 'auto' }}>
              <button type="button" onClick={handleClose}
                style={{ padding: '8px 20px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </OverlayPortal>
  )
}
