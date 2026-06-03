'use client'

import { useState, useId, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Pencil, Trash2, BookOpen,
  Check, Loader2, X, ChevronDown, ChevronUp,
} from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { ROUTES } from '@/lib/constants'
import {
  useImportProfiles, useCreateImportProfile,
  useUpdateImportProfile, useDeleteImportProfile,
} from '@/features/bank/hooks'
import type {
  BankImportProfile, CreateImportProfilePayload, ColumnMapping, NumberFormat,
} from '@/features/bank/types'
import { ColumnMapper } from '@/features/bank/components/ColumnMapper'

// Libellés FR des rôles de colonne (au lieu des clés techniques brutes)
const COLUMN_ROLE_LABEL: Record<string, string> = {
  date:         'Date',
  label:        'Libellé',
  debit:        'Débit',
  credit:       'Crédit',
  amount:       'Montant',
  direction:    'Sens (D/C)',
  reference:    'Référence',
  balanceAfter: 'Solde après',
  valueDate:    'Date de valeur',
}

const ENCODING_LABEL: Record<string, string> = {
  'utf-8':     'UTF-8',
  'iso-8859-1': 'ISO-8859-1 (Latin-1)',
  'windows-1252': 'Windows-1252',
}

// ─── Carte profil ─────────────────────────────────────────────────────────────

function ProfileCard({
  profile,
  onEdit,
  onDelete,
  canManage,
}: {
  profile: BankImportProfile
  onEdit:  () => void
  onDelete: () => void
  canManage: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const cm = profile.columnMapping
  const mappedFields = [
    cm.date && 'Date', cm.label && 'Libellé',
    cm.debit && 'Débit', cm.credit && 'Crédit',
    cm.amount && 'Montant', cm.reference && 'Référence',
    cm.balanceAfter && 'Solde',
  ].filter(Boolean)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* En-tête */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
              {profile.name}
            </span>
            {profile.bankName && (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{profile.bankName}</span>
            )}
          </div>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
              {profile.fileFormat.toUpperCase()} · {profile.delimiter === '\t' ? 'TAB' : profile.delimiter} · {profile.dateFormat} · {profile.encoding}
            </span>
            {profile.usageCount > 0 && (
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                Utilisé {profile.usageCount} fois
              </span>
            )}
          </div>
          {/* Colonnes mappées */}
          <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {mappedFields.map(f => (
              <span key={f} style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>{f}</span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setExpanded(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? 'Moins' : 'Détails'}
          </button>
          {canManage && (
            <>
              <button
                type="button"
                onClick={onEdit}
                title="Modifier"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                title="Supprimer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-sm)', border: '1px solid transparent', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Détails étendus */}
      {expanded && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'var(--font-display)' }}>Mapping des colonnes</div>
            {Object.entries(cm).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 6, marginBottom: 3, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-3)', minWidth: 96, flexShrink: 0 }}>{COLUMN_ROLE_LABEL[k] ?? k}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-1)' }}>« {v as string} »</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'var(--font-display)' }}>Format du fichier</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span>Date : <b style={{ fontFamily: 'var(--font-mono)' }}>{profile.dateFormat}</b></span>
              <span>Séparateur milliers : <b>{profile.numberFormat.thousands ? `« ${profile.numberFormat.thousands} »` : '(aucun)'}</b></span>
              <span>Décimale : <b>{`« ${profile.numberFormat.decimal} »`}</b></span>
              <span>Délimiteur : <b style={{ fontFamily: 'var(--font-mono)' }}>{profile.delimiter === '\t' ? '⇥ tabulation' : `« ${profile.delimiter} »`}</b></span>
              <span>Encodage : <b>{ENCODING_LABEL[profile.encoding] ?? profile.encoding}</b></span>
              {profile.skipFirstRows > 0 && <span>Lignes d’en-tête sautées : <b>{profile.skipFirstRows}</b></span>}
              {profile.amountSign && <span>Signe montant : <b>{profile.amountSign}</b></span>}
            </div>
          </div>
          {profile.skipRowsContaining && profile.skipRowsContaining.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'var(--font-display)' }}>Lignes ignorées si contient</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {profile.skipRowsContaining.map(s => (
                  <span key={s} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#dc2626', fontFamily: 'var(--font-mono)' }}>{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Drawer création / édition ────────────────────────────────────────────────

interface DrawerProps {
  profile?: BankImportProfile
  onClose: () => void
}

function ProfileDrawer({ profile, onClose }: DrawerProps) {
  const titleId    = useId()
  const isEdit     = !!profile
  const createM    = useCreateImportProfile()
  const updateM    = useUpdateImportProfile()
  const isPending  = createM.isPending || updateM.isPending

  const [name,         setName]         = useState(profile?.name         ?? '')
  const [bankName,     setBankName]     = useState(profile?.bankName     ?? '')
  const [mapping,      setMapping]      = useState<ColumnMapping>(profile?.columnMapping ?? { date: '', label: '' })
  const [dateFormat,   setDateFormat]   = useState(profile?.dateFormat   ?? 'DD/MM/YYYY')
  const [numberFormat, setNumberFormat] = useState<NumberFormat>(profile?.numberFormat ?? { thousands: ' ', decimal: ',' })
  const [delimiter,    setDelimiter]    = useState(profile?.delimiter    ?? ';')
  const [encoding,     setEncoding]     = useState(profile?.encoding     ?? 'utf-8')

  // Pour le mapper manuel : headers fictifs basés sur le mapping existant
  const syntheticHeaders = Object.values(mapping).filter((v): v is string => !!v)
  const [extraHeader, setExtraHeader] = useState('')

  const valid = !!name && !!mapping.date && !!mapping.label &&
    !!(mapping.debit || mapping.credit || mapping.amount)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: CreateImportProfilePayload = {
      name, bankName: bankName || undefined,
      encoding, delimiter, dateFormat, numberFormat, columnMapping: mapping,
    }
    if (isEdit) {
      await updateM.mutateAsync({ id: profile.id, data: payload })
    } else {
      await createM.mutateAsync(payload)
    }
    onClose()
  }

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex' }}
    >
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{ width: '100%', maxWidth: 620, background: 'var(--surface)', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
        {/* En-tête */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h2 id={titleId} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            {isEdit ? 'Modifier le profil' : 'Nouveau profil d\'import'}
          </h2>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--surface-2)', cursor: 'pointer' }}>
            <X size={15} />
          </button>
        </div>

        {/* Corps scrollable */}
        <form id={`${titleId}-form`} onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Infos générales */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
                Nom <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required
                placeholder="ex : Afriland Compte Principal"
                style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                onBlur={e  => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>Banque</label>
              <input type="text" value={bankName} onChange={e => setBankName(e.target.value)}
                placeholder="ex : Afriland First Bank"
                style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                onBlur={e  => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
          </div>

          {/* Options techniques */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>Délimiteur</label>
              <select value={delimiter} onChange={e => setDelimiter(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none', cursor: 'pointer' }}>
                <option value=";">Point-virgule (;)</option>
                <option value=",">Virgule (,)</option>
                <option value="|">Pipe (|)</option>
                <option value={'\t'}>Tabulation</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>Encodage</label>
              <select value={encoding} onChange={e => setEncoding(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none', cursor: 'pointer' }}>
                <option value="utf-8">UTF-8</option>
                <option value="win1252">Windows-1252</option>
                <option value="iso-8859-1">ISO-8859-1</option>
                <option value="utf-16le">UTF-16 LE</option>
              </select>
            </div>
          </div>

          {/* Mapping des colonnes — ajout de colonne fictive pour l'éditeur */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>Colonnes du fichier</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={extraHeader}
                onChange={e => setExtraHeader(e.target.value)}
                placeholder="Ajouter une colonne (nom exact)"
                style={{ flex: 1, padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none' }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && extraHeader.trim()) {
                    e.preventDefault()
                    // La colonne est déjà dans syntheticHeaders si dans le mapping
                    setExtraHeader('')
                  }
                }}
                onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                onBlur={e  => e.target.style.borderColor = 'var(--border)'}
              />
              <button
                type="button"
                onClick={() => {
                  if (!extraHeader.trim()) return
                  // Ajouter comme colonne ignorée dans le mapping pour qu'elle apparaisse
                  setMapping(m => ({ ...m }))
                  setExtraHeader('')
                }}
                style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer', color: 'var(--text-2)' }}
              >
                Ajouter
              </button>
            </div>

            {syntheticHeaders.length > 0 ? (
              <ColumnMapper
                headers={syntheticHeaders}
                sampleRows={[]}
                mapping={mapping}
                dateFormat={dateFormat}
                numberFormat={numberFormat}
                onMappingChange={setMapping}
                onDateFormatChange={setDateFormat}
                onNumberFormatChange={setNumberFormat}
              />
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)', background: 'var(--surface-2)' }}>
                Ajoutez les noms de colonnes de votre fichier CSV pour configurer le mapping
              </div>
            )}
          </div>
        </form>

        {/* Pied */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={isPending}
            style={{ padding: '9px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button type="submit" form={`${titleId}-form`} disabled={isPending || !valid}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 'var(--radius-md)', background: valid ? 'var(--primary)' : 'var(--border)', color: valid ? '#fff' : 'var(--text-3)', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: valid && !isPending ? 'pointer' : 'not-allowed', boxShadow: valid ? '0 4px 12px rgba(45,125,210,0.2)' : 'none' }}>
            {isPending ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Check size={14} />}
            {isEdit ? 'Enregistrer' : 'Créer le profil'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─── Modale de confirmation ───────────────────────────────────────────────────

function DeleteConfirmModal({ name, onConfirm, onCancel, isPending }: {
  name: string; onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  const titleId = useId()
  const btnRef  = useRef<HTMLButtonElement>(null)
  useEffect(() => { btnRef.current?.focus() }, [])

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={titleId}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div className="card" style={{ position: 'relative', width: '100%', maxWidth: 400, padding: '24px', zIndex: 1 }}>
        <h2 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>
          Supprimer ce profil ?
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 20px', lineHeight: 1.55 }}>
          Le profil <strong>{name}</strong> sera définitivement supprimé. Les imports passés ne sont pas affectés.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} disabled={isPending}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer' }}>
            Annuler
          </button>
          <button ref={btnRef} type="button" onClick={onConfirm} disabled={isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: '#dc2626', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}>
            {isPending ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
            Supprimer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ImportProfilesPage() {
  const { can } = usePermission()
  const router = useRouter()
  const { data: profiles = [], isLoading } = useImportProfiles()
  const deleteM = useDeleteImportProfile()

  const [showDrawer,    setShowDrawer]    = useState(false)
  const [editProfile,   setEditProfile]   = useState<BankImportProfile | undefined>()
  const [deleteTarget,  setDeleteTarget]  = useState<BankImportProfile | null>(null)

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    await deleteM.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }

  if (!can('bank', 'read')) return <AccessDenied message="Vous n'avez pas accès au module bancaire." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860, margin: '0 auto', width: '100%' }}>

      {/* Modales */}
      {(showDrawer || editProfile) && (
        <ProfileDrawer
          profile={editProfile}
          onClose={() => { setShowDrawer(false); setEditProfile(undefined) }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          name={deleteTarget.name}
          isPending={deleteM.isPending}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Retour */}
      <button type="button" onClick={() => router.push(ROUTES.BANK_IMPORT)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, padding: 0, alignSelf: 'flex-start' }}>
        <ArrowLeft size={15} /> Retour à l'import
      </button>

      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            Profils d'import
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>
            Mappings CSV mémorisés — réutilisés automatiquement à chaque import
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEditProfile(undefined); setShowDrawer(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(45,125,210,0.25)', flexShrink: 0 }}
        >
          <Plus size={15} /> Nouveau profil
        </button>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '24px', color: 'var(--text-3)', fontSize: 13 }}>
          <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
          Chargement des profils…
        </div>
      )}

      {/* Liste unifiée des profils */}
      {profiles.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {profiles.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              canManage={can('bank', 'manage')}
              onEdit={() => { setEditProfile(p); setShowDrawer(false) }}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </section>
      )}

      {/* État vide */}
      {!isLoading && profiles.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-3)' }}>
          <BookOpen size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Aucun profil</div>
          <div style={{ fontSize: 13 }}>Les profils sont créés automatiquement lors d'un import ou manuellement ici.</div>
        </div>
      )}
    </div>
  )
}
