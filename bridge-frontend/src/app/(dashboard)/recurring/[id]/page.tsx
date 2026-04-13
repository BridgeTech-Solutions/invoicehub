'use client'

import { useState, useEffect, useRef, useId } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Play, Pause, Zap, Trash2, Edit2, RefreshCw,
  Calendar, Clock, AlertCircle, AlertTriangle,
} from 'lucide-react'
import {
  useRecurring, useActivateRecurring, useDeactivateRecurring,
  useDeleteRecurring, useGenerateRecurring,
} from '@/features/recurring/hooks'
import { usePermission } from '@/hooks/usePermission'
import { formatDate, getInitials } from '@/lib/utils'
import { computeLineValues } from '@/lib/document-math'
import { ROUTES } from '@/lib/constants'
import type { RecurringInterval } from '@/features/recurring/types'
import type { DiscountType } from '@/features/proformas/types'

// ─── Constantes ────────────────────────────────────────────────

const INTERVAL_LABELS: Record<RecurringInterval, string> = {
  monthly:   'Mensuelle',
  quarterly: 'Trimestrielle',
  biannual:  'Semestrielle',
  annual:    'Annuelle',
}

const INTERVAL_STYLE: Record<RecurringInterval, React.CSSProperties> = {
  monthly:   { background: 'rgba(45,125,210,0.1)',  color: '#2563eb' },
  quarterly: { background: 'rgba(16,185,129,0.1)',  color: '#059669' },
  biannual:  { background: 'rgba(139,92,246,0.1)',  color: '#7c3aed' },
  annual:    { background: 'rgba(245,158,11,0.1)',  color: '#d97706' },
}

// ─── Confirm delete modal ──────────────────────────────────────

function ConfirmDeleteModal({
  onConfirm, onCancel, isPending,
}: { onConfirm: () => void; onCancel: () => void; isPending: boolean }) {
  const titleId    = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { confirmRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: '28px 28px 24px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={18} aria-hidden style={{ color: '#ef4444' }} />
          </div>
          <div>
            <h3 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6, fontFamily: 'var(--font-display)' }}>
              Supprimer ce gabarit ?
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              Ce gabarit sera supprimé définitivement. Les factures déjà générées ne seront pas affectées.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '8px 18px', minHeight: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={isPending}
            style={{ padding: '8px 18px', minHeight: 44, borderRadius: 'var(--radius-md)', background: '#ef4444', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.65 : 1 }}>
            {isPending ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Badge intervalle ──────────────────────────────────────────

function IntervalBadge({ interval }: { interval: RecurringInterval }) {
  const s = INTERVAL_STYLE[interval]
  return (
    <span style={{
      ...s, fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700,
      letterSpacing: '0.04em', padding: '4px 12px', borderRadius: 20,
      textTransform: 'uppercase',
    }}>
      {INTERVAL_LABELS[interval]}
    </span>
  )
}

// ─── Badge statut ──────────────────────────────────────────────

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span style={{
      fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      padding: '4px 12px', borderRadius: 20,
      background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.15)',
      color:      isActive ? '#16a34a'             : '#64748b',
    }}>
      {isActive ? 'Actif' : 'Inactif'}
    </span>
  )
}

// ─── Skeleton ──────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ height: 13, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div style={{ height: 28, width: 260, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div className="card" style={{ padding: 24, height: 180 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 6, opacity: 0.5 }} className="animate-pulse" />
      </div>
    </div>
  )
}

// ─── Detail view ───────────────────────────────────────────────

function RecurringDetailView({ id }: { id: string }) {
  const router      = useRouter()
  const { data: template, isLoading } = useRecurring(id)
  const { can }     = usePermission()
  const activateM   = useActivateRecurring()
  const deactivateM = useDeactivateRecurring()
  const deleteM     = useDeleteRecurring()
  const generateM   = useGenerateRecurring()
  const canEdit     = can('invoice', 'create')
  const canDelete   = can('invoice', 'delete')

  const [generating, setGenerating]       = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  if (isLoading) return <Skeleton />
  if (!template) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Gabarit introuvable</p>
      <Link href={ROUTES.RECURRING} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
        ← Retour aux gabarits
      </Link>
    </div>
  )

  // Calculs corrects avec remises (via computeLineValues — miroir du backend)
  const computedLines = template.lines.map(l => computeLineValues(
    Number(l.quantity), Number(l.unitPriceHt),
    l.discountType as DiscountType, Number(l.discountValue), Number(l.taxRate),
  ))
  const lineTotal = computedLines.reduce((s, l) => s + l.netHt, 0)
  const taxTotal  = computedLines.reduce((s, l) => s + l.taxAmount, 0)
  const totalTtc  = lineTotal + taxTotal

  const isOverdue = template.isActive && new Date(template.nextInvoiceDate) < new Date()

  function handleGenerate() {
    setGenerating(true)
    generateM.mutate(template!.id, { onSettled: () => setGenerating(false) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      <Link href={ROUTES.RECURRING} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Retour aux gabarits
      </Link>

      {/* Header */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <h1 className="font-display" style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>
                {template.subject ?? `Gabarit ${template.client.name}`}
              </h1>
              <IntervalBadge interval={template.interval} />
              <StatusBadge isActive={template.isActive} />
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: isOverdue ? '#ef4444' : 'var(--text-3)' }}>
                <Calendar size={13} />
                Prochaine facture : {formatDate(template.nextInvoiceDate)}
                {isOverdue && <span style={{ marginLeft: 4, fontWeight: 700, color: '#ef4444' }}>— En retard</span>}
              </div>
              {template.endDate && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                  <Clock size={13} /> Fin : {formatDate(template.endDate)}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                <RefreshCw size={13} /> {INTERVAL_LABELS[template.interval]}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Montant HT</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-mono)', margin: 0 }}>
              {new Intl.NumberFormat('fr-FR').format(Math.round(lineTotal))} XAF
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '3px 0 0', fontFamily: 'var(--font-mono)' }}>
              TTC : {new Intl.NumberFormat('fr-FR').format(Math.round(totalTtc))} XAF
            </p>
          </div>
        </div>

        {/* Overdue warning */}
        {isOverdue && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(239,68,68,0.07)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: '#dc2626', margin: 0, fontWeight: 500 }}>
              La prochaine facture aurait dû être générée le {formatDate(template.nextInvoiceDate)}. Utilisez « Générer maintenant » pour la créer manuellement.
            </p>
          </div>
        )}

        {/* Actions */}
        {canEdit && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={handleGenerate}
              disabled={generating || generateM.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: (generating || generateM.isPending) ? 0.7 : 1 }}
            >
              <Zap size={14} /> Générer maintenant
            </button>

            <Link
              href={`${ROUTES.RECURRING}/${template.id}/edit`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', color: 'var(--text-2)', border: '1.5px solid var(--border)', textDecoration: 'none', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}
            >
              <Edit2 size={14} /> Modifier
            </Link>

            {!template.isActive ? (
              <button
                onClick={() => activateM.mutate(template.id)}
                disabled={activateM.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}
              >
                <Play size={14} /> Activer
              </button>
            ) : (
              <button
                onClick={() => deactivateM.mutate(template.id)}
                disabled={deactivateM.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(148,163,184,0.1)', color: '#64748b', border: '1px solid rgba(148,163,184,0.3)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}
              >
                <Pause size={14} /> Désactiver
              </button>
            )}

            {canDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleteM.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, marginLeft: 'auto' }}
              >
                <Trash2 size={14} /> Supprimer
              </button>
            )}
          </div>
        )}
      </div>

      {/* Body grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>

        {/* Main */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Lines */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
              Lignes ({template.lines.length})
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr>
                    {['#', 'Désignation', 'Qté', 'Unité', 'P.U. HT', 'TVA %', 'Total HT'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', background: 'var(--surface-2)', borderBottom: '2px solid var(--border)', textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {template.lines.map((line, i) => (
                      <tr key={line.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '11px 10px', fontSize: 12, color: 'var(--text-3)', width: 32 }}>{i + 1}</td>
                        <td style={{ padding: '11px 10px', minWidth: 160 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{line.designation}</p>
                          {line.description && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: line.description }} />}
                        </td>
                        <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)' }}>{Number(line.quantity)}</td>
                        <td style={{ padding: '11px 10px', fontSize: 12.5, color: 'var(--text-3)' }}>{line.unit}</td>
                        <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                          {new Intl.NumberFormat('fr-FR').format(Number(line.unitPriceHt))}
                        </td>
                        <td style={{ padding: '11px 10px', textAlign: 'right', fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{Number(line.taxRate)}%</td>
                        <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                          {new Intl.NumberFormat('fr-FR').format(Math.round(computedLines[i].netHt))} XAF
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Total HT</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>
                    {new Intl.NumberFormat('fr-FR').format(Math.round(lineTotal))} XAF
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>TVA</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                    {new Intl.NumberFormat('fr-FR').format(Math.round(taxTotal))} XAF
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--border)', paddingTop: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-1)' }}>Total TTC</span>
                  <span style={{ fontSize: 15, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--primary)' }}>
                    {new Intl.NumberFormat('fr-FR').format(Math.round(totalTtc))} XAF
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes & conditions */}
          {(template.notes || template.paymentConditions) && (
            <div className="card" style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
                Conditions & Notes
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: template.paymentConditions && template.notes ? '1fr 1fr' : '1fr', gap: 16 }}>
                {template.paymentConditions && (
                  <div>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Conditions de paiement</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>{template.paymentConditions}</p>
                  </div>
                )}
                {template.notes && (
                  <div>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Notes</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>{template.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Schedule */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>Planification</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <RefreshCw size={12} /> Fréquence
                </span>
                <IntervalBadge interval={template.interval} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Calendar size={12} /> Prochaine
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: isOverdue ? '#ef4444' : 'var(--text-2)' }}>
                  {formatDate(template.nextInvoiceDate)}
                </span>
              </div>
              {template.endDate && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={12} /> Fin
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{formatDate(template.endDate)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Statut</span>
                <StatusBadge isActive={template.isActive} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Devise</span>
                <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{template.currency}</span>
              </div>
            </div>
          </div>

          {/* Client */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>Client</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                {getInitials(template.client.name)}
              </span>
              <div>
                <Link href={`${ROUTES.CLIENTS}/${template.client.id}`} style={{ textDecoration: 'none' }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{template.client.name}</p>
                </Link>
              </div>
            </div>
            <Link href={`${ROUTES.CLIENTS}/${template.client.id}`} style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
              Voir la fiche client →
            </Link>
          </div>

          {/* Meta */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>Informations</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {([
                ['Créé par',         `${template.createdBy.firstName} ${template.createdBy.lastName}`],
                ['Créé le',          formatDate(template.createdAt)],
                ['Lignes',           `${template.lines.length} ligne${template.lines.length > 1 ? 's' : ''}`],
                ...(template.lastGeneratedAt ? [['Dernière génération', formatDate(template.lastGeneratedAt)]] : []),
              ] as [string, string][]).map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{l}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500, maxWidth: 150, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          isPending={deleteM.isPending}
          onConfirm={() => deleteM.mutate(template.id, { onSuccess: () => router.push(ROUTES.RECURRING) })}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────

export default function RecurringDetailPage() {
  const { id } = useParams<{ id: string }>()
  return <RecurringDetailView id={id} />
}
