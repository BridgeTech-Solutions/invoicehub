'use client'

import { useState, useCallback, useRef, useId, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Upload, CheckCircle2, AlertTriangle, FileText,
  ChevronRight, ChevronLeft, Loader2, X, RotateCcw,
  ArrowRight, AlertCircle, BookOpen,
} from 'lucide-react'
import Link from 'next/link'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useBankAccounts, useConfirmImport, useRollbackImport,
  useImportPolling, useCreateImportProfile,
} from '@/features/bank/hooks'
import { bankImportApi } from '@/features/bank/api'
import { ColumnMapper } from '@/features/bank/components/ColumnMapper'
import { ImportStatusBadge } from '@/features/bank/components/ImportStatusBadge'
import type {
  DetectFormatResult, ImportPreviewResult,
  ColumnMapping, NumberFormat,
} from '@/features/bank/types'
import { ROUTES } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'

type Step = 1 | 2 | 3

const STEP_LABELS = ['Sélection', 'Prévisualisation', 'Confirmation']

// ─── Step indicator ─────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {STEP_LABELS.map((label, i) => {
        const step = (i + 1) as Step
        const done = step < current
        const active = step === current
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', flex: step < 3 ? '1 1 auto' : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: done ? '#16a34a' : active ? 'var(--primary)' : 'var(--surface-2)',
                border: `2px solid ${done ? '#16a34a' : active ? 'var(--primary)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.25s',
              }}>
                {done
                  ? <CheckCircle2 size={16} style={{ color: '#fff' }} />
                  : <span style={{ fontSize: 13, fontWeight: 700, color: active ? '#fff' : 'var(--text-3)', fontFamily: 'var(--font-display)' }}>{step}</span>}
              </div>
              <span style={{ fontSize: 11.5, fontWeight: active ? 600 : 400, color: active ? 'var(--primary)' : done ? '#16a34a' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {step < 3 && (
              <div style={{ flex: 1, height: 2, background: done ? '#16a34a' : 'var(--border)', margin: '0 8px', marginBottom: 22, transition: 'background 0.3s' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Badge de confiance ──────────────────────────────────────────────────────

function ConfidenceBadge({ score, name }: { score: number; name: string }) {
  const high   = score >= 80
  const medium = score >= 50 && score < 80
  const color  = high ? '#16a34a' : medium ? '#d97706' : '#dc2626'
  const bg     = high ? '#dcfce7' : medium ? '#fef3c7' : '#fee2e2'
  const border = high ? '#86efac' : medium ? '#fde68a' : '#fca5a5'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: bg, border: `1px solid ${border}` }}>
      {high
        ? <CheckCircle2 size={14} style={{ color, flexShrink: 0 }} />
        : <AlertCircle  size={14} style={{ color, flexShrink: 0 }} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
          {high ? 'Format reconnu' : medium ? 'Format partiellement reconnu' : 'Format non reconnu'}
          {name && ` — ${name}`}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
          Confiance : {score}%
          {!high && ' — Vérifiez le mapping des colonnes ci-dessous'}
        </div>
      </div>
      {/* Barre de progression */}
      <div style={{ width: 60, height: 5, background: 'rgba(0,0,0,0.08)', borderRadius: 99, flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

// ─── Step 1 ──────────────────────────────────────────────────────────────────

interface Step1Props {
  accountId:      string
  setAccountId:   (v: string) => void
  file:           File | null
  setFile:        (f: File | null) => void
  accounts:       import('@/features/bank/types').BankAccount[]
  onNext:         (customMapping?: object) => void
}

function Step1({ accountId, setAccountId, file, setFile, accounts, onNext }: Step1Props) {
  const [detecting, setDetecting]   = useState(false)
  const [detected,  setDetected]    = useState<DetectFormatResult | null>(null)
  const [dragOver,  setDragOver]    = useState(false)
  const fileInputRef                = useRef<HTMLInputElement>(null)
  const fileInputId                 = useId()

  // Mapping manuel (utilisé uniquement si needsMapping)
  const [mapping,       setMapping]      = useState<ColumnMapping>({ date: '', label: '' })
  const [dateFormat,    setDateFormat]   = useState('DD/MM/YYYY')
  const [numberFormat,  setNumberFormat] = useState<NumberFormat>({ thousands: ' ', decimal: ',' })

  // Sauvegarde de profil
  const [saveProfile,  setSaveProfile]  = useState(false)
  const [profileName,  setProfileName]  = useState('')
  const [profileBank,  setProfileBank]  = useState('')
  const createProfile = useCreateImportProfile()

  // Lance la détection automatiquement quand file + account sont prêts
  const runDetect = useCallback(async (f: File, aid: string) => {
    setDetecting(true)
    setDetected(null)
    try {
      const result = await bankImportApi.detect(f, aid)
      setDetected(result)
      // Pré-remplir le mapping depuis la détection
      if (result.detectedMapping) {
        setMapping(result.detectedMapping.columnMapping)
        setDateFormat(result.detectedMapping.dateFormat)
        setNumberFormat(result.detectedMapping.numberFormat)
      }
    } catch {
      toast.error('Erreur lors de la détection du format')
    } finally {
      setDetecting(false)
    }
  }, [])

  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 Mo

  const handleFileSelect = useCallback((f: File) => {
    if (f.size > MAX_FILE_SIZE) {
      toast.error(`Fichier trop volumineux — maximum 5 Mo (reçu : ${(f.size / 1024 / 1024).toFixed(1)} Mo)`)
      return
    }
    setFile(f)
    setDetected(null)
    if (accountId) runDetect(f, accountId)
  }, [setFile, accountId, runDetect])

  // Re-détecter si le compte change et qu'un fichier est déjà sélectionné
  useEffect(() => {
    if (file && accountId) runDetect(file, accountId)
  }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFileSelect(f)
  }, [handleFileSelect])

  const needsMapping = !!detected?.needsMapping
  const canContinue  = !!file && !!accountId && !detecting &&
    (!needsMapping || (!!mapping.date && !!mapping.label && !!(mapping.debit || mapping.credit || mapping.amount)))

  const handleNext = async () => {
    if (!canContinue) return

    // Si mapping manuel + sauvegarde demandée
    if (needsMapping && saveProfile && profileName) {
      try {
        await createProfile.mutateAsync({
          name:         profileName,
          bankName:     profileBank || undefined,
          encoding:     detected?.detectedMapping?.encoding ?? 'utf-8',
          delimiter:    detected?.detectedMapping?.delimiter ?? ';',
          dateFormat,
          numberFormat,
          columnMapping: mapping,
        })
      } catch {
        // Ne pas bloquer l'import si la sauvegarde échoue
        toast.error('Le profil n\'a pas pu être sauvegardé, mais l\'import continue')
      }
    }

    // Construire le formatOverride à passer au preview si mapping manuel
    const customMapping = needsMapping
      ? {
          profileId:    null,
          profileName:  profileName || 'Mapping manuel',
          delimiter:    detected?.detectedMapping?.delimiter ?? ';',
          encoding:     detected?.detectedMapping?.encoding ?? 'utf-8',
          dateFormat,
          numberFormat,
          columnMapping: mapping,
          confidence:   0,
          source:       'user' as const,
          headerRow:    detected?.detectedMapping?.headerRow ?? 0,
        }
      : undefined

    onNext(customMapping)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sélection du compte */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="import-account" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
          Compte bancaire <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <select
          id="import-account"
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none', cursor: 'pointer' }}
          onFocus={e => e.target.style.borderColor = 'var(--primary)'}
          onBlur={e  => e.target.style.borderColor = 'var(--border)'}
        >
          <option value="">— Sélectionner un compte —</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.bankName}</option>)}
        </select>
      </div>

      {/* Zone de dépôt */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--primary)' : file ? '#16a34a' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)',
          background: dragOver ? 'rgba(45,125,210,0.04)' : file ? 'rgba(22,163,74,0.04)' : 'var(--surface-2)',
          padding: '36px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept=".csv,.ofx,.mt940,.sta,.txt"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
        />
        {file ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={22} style={{ color: '#16a34a' }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{file.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{(file.size / 1024).toFixed(1)} Ko</div>
            </div>
            <button type="button" onClick={e => { e.stopPropagation(); setFile(null); setDetected(null) }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={12} /> Supprimer
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Upload size={22} style={{ color: 'var(--text-3)' }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Glissez votre relevé ici</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>ou cliquez pour sélectionner</div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>CSV · OFX · MT940 · 5 Mo max</div>
          </div>
        )}
      </div>

      {/* Résultat de détection */}
      {detecting && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-3)' }}>
          <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
          Analyse du format en cours…
        </div>
      )}

      {detected && !detecting && (
        <ConfidenceBadge
          score={detected.confidenceScore}
          name={detected.detectedBank ?? detected.detectedMapping?.profileName ?? ''}
        />
      )}

      {/* Candidats alternatifs */}
      {detected && !detected.needsMapping && (detected.profileCandidates?.length ?? 0) > 1 && (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          Autres correspondances : {detected.profileCandidates.slice(1, 3).map(c => `${c.name} (${c.score}%)`).join(', ')}
        </div>
      )}

      {/* Mapper de colonnes (si confiance insuffisante) */}
      {detected?.needsMapping && detected.headers && (
        <div style={{ borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
              Assignez les colonnes de votre relevé
            </span>
          </div>
          <div style={{ padding: '16px' }}>
            <ColumnMapper
              headers={detected.headers}
              sampleRows={detected.sampleRows ?? []}
              mapping={mapping}
              dateFormat={dateFormat}
              numberFormat={numberFormat}
              onMappingChange={setMapping}
              onDateFormatChange={setDateFormat}
              onNumberFormatChange={setNumberFormat}
            />

            {/* Option sauvegarde de profil */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={saveProfile}
                  onChange={e => setSaveProfile(e.target.checked)}
                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-1)', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                  Mémoriser ce mapping pour les prochains imports
                </span>
              </label>

              {saveProfile && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingLeft: 23 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
                      Nom du profil <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      placeholder="ex : Afriland Compte Principal"
                      style={{ padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none' }}
                      onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                      onBlur={e  => e.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
                      Banque
                    </label>
                    <input
                      type="text"
                      value={profileBank}
                      onChange={e => setProfileBank(e.target.value)}
                      placeholder="ex : Afriland First Bank"
                      style={{ padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none' }}
                      onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                      onBlur={e  => e.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <Link
          href={ROUTES.BANK_IMPORT_PROFILES}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none' }}
        >
          <BookOpen size={13} /> Bibliothèque de profils
        </Link>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canContinue}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 22px', borderRadius: 'var(--radius-md)',
            background: canContinue ? 'var(--primary)' : 'var(--border)',
            color: canContinue ? '#fff' : 'var(--text-3)',
            border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)',
            fontWeight: 600, cursor: canContinue ? 'pointer' : 'not-allowed',
            boxShadow: canContinue ? '0 4px 12px rgba(45,125,210,0.25)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          {createProfile.isPending ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
          Prévisualiser <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ─── Step 2 ──────────────────────────────────────────────────────────────────

function Step2({
  file, accountId, customMapping, onBack, onConfirm,
}: {
  file: File; accountId: string
  customMapping?: object
  onBack: () => void
  onConfirm: (importId: string) => void
}) {
  const [preview,    setPreview]    = useState<ImportPreviewResult | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [showAll,    setShowAll]    = useState(false)
  const confirmMutation = useConfirmImport()

  const loadPreview = useCallback(async () => {
    setLoading(true)
    try {
      const result = await bankImportApi.preview(file, accountId, undefined, customMapping)
      setPreview(result)
    } catch {
      toast.error('Erreur lors de la prévisualisation')
    } finally {
      setLoading(false)
    }
  }, [file, accountId, customMapping])

  useEffect(() => { loadPreview() }, [loadPreview])

  const handleConfirm = async () => {
    if (!preview) return
    setConfirming(true)
    try {
      await confirmMutation.mutateAsync(preview.importId)
      onConfirm(preview.importId)
    } catch {
      toast.error("Erreur lors de la confirmation de l'import")
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 0' }}>
        <Loader2 size={28} style={{ color: 'var(--primary)', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontSize: 14, color: 'var(--text-2)' }}>Analyse du fichier…</div>
      </div>
    )
  }

  if (!preview) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Résumé */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {[
          { label: 'Transactions',     value: preview.totalRows,                              color: 'var(--primary)' },
          { label: 'Doublons ignorés', value: preview.duplicates,                              color: preview.duplicates > 0 ? '#d97706' : 'var(--text-3)' },
          { label: 'À importer',       value: preview.totalRows - preview.duplicates,          color: '#16a34a' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {preview.duplicates > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: '#fef3c7', border: '1px solid #fde68a' }}>
          <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#92400e' }}>
            {preview.duplicates} transaction{preview.duplicates !== 1 ? 's' : ''} déjà importée{preview.duplicates !== 1 ? 's' : ''} seront ignorées (hash identique).
          </span>
        </div>
      )}

      {/* Table de prévisualisation */}
      <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
        <table className="data-table" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th style={{ textAlign: 'right' }}>Débit</th>
              <th style={{ textAlign: 'right' }}>Crédit</th>
              <th style={{ textAlign: 'right' }}>Solde</th>
            </tr>
          </thead>
          <tbody>
            {(showAll ? preview.rows ?? [] : (preview.rows ?? []).slice(0, 10)).map((row, i) => (
              <tr key={i}>
                <td style={{ fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{row.date}</td>
                <td style={{ fontSize: 13, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#dc2626' }}>
                  {row.debit ? `−${row.debit.toLocaleString('fr-FR')}` : '—'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#16a34a' }}>
                  {row.credit ? `+${row.credit.toLocaleString('fr-FR')}` : '—'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-3)' }}>
                  {row.balance?.toLocaleString('fr-FR') ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {preview.totalRows > 10 && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              style={{ fontSize: 12.5, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, padding: '2px 0' }}
            >
              {showAll
                ? 'Réduire l\'aperçu'
                : `Voir toutes les ${preview.totalRows} lignes (+${preview.totalRows - 10} masquées)`}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <button type="button" onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
          <ChevronLeft size={15} /> Retour
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming || preview.totalRows - preview.duplicates === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: confirming ? 'wait' : 'pointer', opacity: confirming ? 0.75 : 1, boxShadow: '0 4px 12px rgba(45,125,210,0.25)' }}>
          {confirming ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
          Confirmer l'import
        </button>
      </div>
    </div>
  )
}

// ─── Confirm modal ───────────────────────────────────────────────────────────

function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel, isPending }: {
  title: string; message: string; confirmLabel: string
  onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  const titleId = useId()
  const btnRef  = useRef<HTMLButtonElement>(null)
  useEffect(() => { btnRef.current?.focus() }, [])

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div className="card" style={{ position: 'relative', width: '100%', maxWidth: 420, padding: '28px 28px 24px', zIndex: 1 }}>
        <h2 id={titleId} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 10px' }}>
          {title}
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 24px', lineHeight: 1.55 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} disabled={isPending}
            style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button ref={btnRef} type="button" onClick={onConfirm} disabled={isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 'var(--radius-md)', background: '#dc2626', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: isPending ? 'wait' : 'pointer', opacity: isPending ? 0.75 : 1 }}>
            {isPending ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 3 ──────────────────────────────────────────────────────────────────

function Step3({ importId, onReset }: { importId: string; onReset: () => void }) {
  const { data: status, isDone } = useImportPolling(importId)
  const rollback = useRollbackImport()
  const [showConfirm, setShowConfirm] = useState(false)

  const handleRollback = async () => {
    await rollback.mutateAsync(importId)
    setShowConfirm(false)
    onReset()
  }

  const isSuccess = status?.status === 'completed'
  const progress  = status?.progress ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {showConfirm && (
        <ConfirmModal
          title="Annuler cet import ?"
          message="Toutes les transactions importées seront supprimées définitivement. Cette action est irréversible."
          confirmLabel="Confirmer l'annulation"
          isPending={rollback.isPending}
          onConfirm={handleRollback}
          onCancel={() => setShowConfirm(false)}
        />
      )}
      {!isDone ? (
        <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
          <Loader2 size={36} style={{ color: 'var(--primary)', animation: 'spin 0.8s linear infinite', marginBottom: 16 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>Traitement en cours…</div>
          <div style={{ maxWidth: 300, margin: '0 auto' }}>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--primary)', borderRadius: 99, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {status?.importedRows ?? 0} / {status?.totalRows ?? '…'} transactions
            </div>
          </div>
        </div>
      ) : isSuccess ? (
        <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', border: '2px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CheckCircle2 size={28} style={{ color: '#16a34a' }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>
            Import réussi
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-3)', marginBottom: 24 }}>
            {status?.importedRows} transaction{(status?.importedRows ?? 0) !== 1 ? 's' : ''} importée{(status?.importedRows ?? 0) !== 1 ? 's' : ''} avec succès.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href={ROUTES.BANK_TRANSACTIONS} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.25)' }}>
              Voir les transactions <ArrowRight size={14} />
            </Link>
            <Link href={ROUTES.BANK_RECONCILIATIONS} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', color: 'var(--text-2)', textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
              Rapprocher maintenant
            </Link>
            <button type="button" onClick={onReset} style={{ padding: '9px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
              Nouvel import
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fee2e2', border: '2px solid #fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertTriangle size={28} style={{ color: '#dc2626' }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Import échoué</div>
          <div style={{ fontSize: 13.5, color: '#dc2626', marginBottom: 24 }}>{status?.errorMessage ?? "Une erreur s'est produite"}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button type="button" onClick={() => setShowConfirm(true)} disabled={rollback.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 'var(--radius-md)', background: '#dc2626', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}>
              <RotateCcw size={14} /> Annuler l'import
            </button>
            <button type="button" onClick={onReset} style={{ padding: '9px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
              Réessayer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BankImportPage() {
  const { can } = usePermission()
  const searchParams = useSearchParams()
  const [step,        setStep]        = useState<Step>(1)
  const [accountId,   setAccountId]   = useState(searchParams.get('accountId') ?? '')
  const [file,        setFile]        = useState<File | null>(null)
  const [importId,    setImportId]    = useState<string | null>(null)
  const [customMapping, setCustomMapping] = useState<object | undefined>(undefined)

  const { data: accounts = [] } = useBankAccounts()

  const reset = () => {
    setStep(1); setFile(null); setImportId(null); setCustomMapping(undefined)
    setAccountId(searchParams.get('accountId') ?? '')
  }

  if (!can('bank', 'read')) return <AccessDenied message="Vous n'avez pas accès au module bancaire." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Importer un relevé bancaire"
        description="Formats supportés : CSV, OFX, MT940 — Détection automatique du format"
      />

      <div className="card" style={{ maxWidth: 700, padding: '28px 32px' }}>
        <StepIndicator current={step} />

        {step === 1 && (
          <Step1
            accountId={accountId}
            setAccountId={setAccountId}
            file={file}
            setFile={setFile}
            accounts={accounts}
            onNext={(mapping) => {
              setCustomMapping(mapping)
              setStep(2)
            }}
          />
        )}
        {step === 2 && file && (
          <Step2
            file={file}
            accountId={accountId}
            customMapping={customMapping}
            onBack={() => setStep(1)}
            onConfirm={id => { setImportId(id); setStep(3) }}
          />
        )}
        {step === 3 && importId && (
          <Step3 importId={importId} onReset={reset} />
        )}
      </div>
    </div>
  )
}
