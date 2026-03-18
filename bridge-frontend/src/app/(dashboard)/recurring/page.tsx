'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw, Play, Pause, Trash2, Eye, Zap } from 'lucide-react'
import { useRecurringList, useActivateRecurring, useDeactivateRecurring, useDeleteRecurring, useGenerateRecurring } from '@/features/recurring/hooks'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePermission } from '@/hooks/usePermission'
import { formatDate, formatXAF, getInitials } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import type { RecurringTemplate, RecurringInterval } from '@/features/recurring/types'

// ─── Constantes ────────────────────────────────────────────────

const INTERVAL_LABELS: Record<RecurringInterval, string> = {
  monthly:   'Mensuelle',
  quarterly: 'Trimestrielle',
  biannual:  'Semestrielle',
  annual:    'Annuelle',
}

const INTERVAL_STYLE: Record<RecurringInterval, React.CSSProperties> = {
  monthly:   { background: 'rgba(45,125,210,0.1)',   color: '#2563eb' },
  quarterly: { background: 'rgba(16,185,129,0.1)',   color: '#059669' },
  biannual:  { background: 'rgba(139,92,246,0.1)',   color: '#7c3aed' },
  annual:    { background: 'rgba(245,158,11,0.1)',   color: '#d97706' },
}

// ─── Badge intervalle ──────────────────────────────────────────

function IntervalBadge({ interval }: { interval: RecurringInterval }) {
  const s = INTERVAL_STYLE[interval]
  return (
    <span style={{
      ...s, fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
      letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 20,
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
      fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 20,
      background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.15)',
      color:      isActive ? '#16a34a'             : '#64748b',
    }}>
      {isActive ? 'Actif' : 'Inactif'}
    </span>
  )
}

// ─── Actions ligne ─────────────────────────────────────────────

function RowActions({ t }: { t: RecurringTemplate }) {
  const { can }      = usePermission()
  const router       = useRouter()
  const activateM    = useActivateRecurring()
  const deactivateM  = useDeactivateRecurring()
  const generateM    = useGenerateRecurring()
  const deleteM      = useDeleteRecurring()
  const canEdit      = can('invoice', 'create')

  const items = [
    { label: 'Voir détail', icon: Eye, onClick: () => router.push(`${ROUTES.RECURRING}/${t.id}`) },
    ...(canEdit && !t.isActive ? [{ label: 'Activer',    icon: Play,  onClick: () => activateM.mutate(t.id), separator: true }] : []),
    ...(canEdit &&  t.isActive ? [{ label: 'Désactiver', icon: Pause, onClick: () => deactivateM.mutate(t.id), separator: true }] : []),
    ...(canEdit ? [{ label: 'Générer maintenant', icon: Zap, onClick: () => generateM.mutate(t.id) }] : []),
    ...(can('invoice', 'delete') ? [{ label: 'Supprimer', icon: Trash2, onClick: () => { if (confirm('Supprimer ce gabarit ?')) deleteM.mutate(t.id) }, danger: true, separator: true }] : []),
  ]

  return <ActionMenu items={items} />
}

// ─── Skeleton ──────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[160, 120, 100, 90, 100, 80, 60].map((w, i) => (
        <td key={i} style={{ padding: '14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

// ─── Page ──────────────────────────────────────────────────────

export default function RecurringPage() {
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined)
  const { can } = usePermission()

  const { data, isLoading } = useRecurringList({
    limit: 50,
    ...(activeFilter !== undefined && { isActive: activeFilter }),
  })

  const templates = data?.data ?? []

  const totalHt = templates.reduce((sum, t) =>
    sum + t.lines.reduce((s, l) => s + Number(l.unitPriceHt) * Number(l.quantity), 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Factures récurrentes"
        description={data ? `${data.total} gabarit${data.total !== 1 ? 's' : ''}` : undefined}
        actions={
          can('invoice', 'create') ? (
            <Link
              href={`${ROUTES.RECURRING}/new`}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 'var(--radius-md)',
                background: 'var(--primary)', color: '#fff',
                textDecoration: 'none', fontSize: 13.5,
                fontFamily: 'var(--font-display)', fontWeight: 600,
                boxShadow: '0 4px 12px rgba(45,125,210,0.3)',
              }}
            >
              <Plus size={15} strokeWidth={2.5} /> Nouveau gabarit
            </Link>
          ) : undefined
        }
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Toolbar */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          {[
            { label: 'Tous',     value: undefined },
            { label: 'Actifs',   value: true },
            { label: 'Inactifs', value: false },
          ].map(({ label, value }) => (
            <button
              key={label}
              onClick={() => setActiveFilter(value)}
              style={{
                padding: '6px 13px', borderRadius: 'var(--radius-md)',
                border: activeFilter === value ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                background: activeFilter === value ? 'rgba(45,125,210,0.08)' : 'transparent',
                color: activeFilter === value ? 'var(--primary)' : 'var(--text-3)',
                fontSize: 12.5, fontWeight: activeFilter === value ? 600 : 400,
                fontFamily: 'var(--font-display)', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <table className="data-table">
            <tbody>{[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}</tbody>
          </table>
        ) : templates.length === 0 ? (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <RefreshCw size={40} style={{ color: 'var(--border)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 4 }}>
              Aucun gabarit de facturation récurrente
            </p>
            {can('invoice', 'create') && (
              <Link
                href={`${ROUTES.RECURRING}/new`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 13.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
              >
                <Plus size={13} /> Créer le premier gabarit
              </Link>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Objet</th>
                <th>Fréquence</th>
                <th>Prochaine facture</th>
                <th style={{ textAlign: 'right' }}>Montant HT</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => {
                const lineTotal = t.lines.reduce((s, l) => s + Number(l.unitPriceHt) * Number(l.quantity), 0)
                const isOverdue = t.isActive && new Date(t.nextInvoiceDate) < new Date()
                return (
                  <tr key={t.id}>
                    {/* Client */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: 'rgba(45,125,210,0.1)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: 'var(--primary)',
                          fontFamily: 'var(--font-display)', flexShrink: 0,
                        }}>
                          {getInitials(t.client.name)}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{t.client.name}</span>
                      </div>
                    </td>

                    {/* Objet */}
                    <td>
                      <Link href={`${ROUTES.RECURRING}/${t.id}`} style={{ textDecoration: 'none' }}>
                        <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 500 }}>
                          {t.subject ?? `${t.lines.length} ligne${t.lines.length > 1 ? 's' : ''}`}
                        </span>
                      </Link>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                        {t.lines.length} ligne{t.lines.length > 1 ? 's' : ''}
                      </p>
                    </td>

                    {/* Fréquence */}
                    <td><IntervalBadge interval={t.interval} /></td>

                    {/* Prochaine facture */}
                    <td>
                      <span style={{ fontSize: 12.5, color: isOverdue ? '#ef4444' : 'var(--text-2)', fontWeight: isOverdue ? 600 : 400 }}>
                        {formatDate(t.nextInvoiceDate)}
                      </span>
                      {isOverdue && <p style={{ fontSize: 11, color: '#ef4444', margin: '1px 0 0' }}>En retard</p>}
                      {t.endDate && <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '1px 0 0' }}>Fin : {formatDate(t.endDate)}</p>}
                    </td>

                    {/* Montant HT */}
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>
                        {new Intl.NumberFormat('fr-FR').format(Math.round(lineTotal))} XAF
                      </span>
                    </td>

                    {/* Statut */}
                    <td><StatusBadge isActive={t.isActive} /></td>

                    {/* Actions */}
                    <td><RowActions t={t} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {data && data.total > templates.length && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
              {templates.length} / {data.total} gabarits affichés
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
