'use client'

import { Database, Download, Trash2, Loader2, RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react'
import { useBackups, useCreateBackup, useDownloadBackup, useDeleteBackup } from '@/features/backups/hooks'
import { formatDate } from '@/lib/utils'
import type { BackupStatus } from '@/features/backups/types'

// ─── Status badge ─────────────────────────────────────────────
const STATUS_CFG: Record<BackupStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  success: { label: 'Réussi',     color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: <CheckCircle2 size={13} /> },
  failed:  { label: 'Échoué',     color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: <XCircle size={13} />     },
  running: { label: 'En cours…',  color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  icon: <Loader2 size={13} className="animate-spin" /> },
  pending: { label: 'En attente', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: <Clock size={13} />       },
}

function StatusBadge({ status }: { status: BackupStatus }) {
  const c = STATUS_CFG[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 100, fontSize: 11.5, fontFamily: 'var(--font-display)', fontWeight: 700, background: c.bg, color: c.color }}>
      {c.icon} {c.label}
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {[180, 100, 80, 100, 80, 60].map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div style={{ height: 11, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

export default function BackupsPage() {
  const { data, isLoading, refetch, isFetching } = useBackups({ page: 1, limit: 20 })
  const createMut   = useCreateBackup()
  const downloadMut = useDownloadBackup()
  const deleteMut   = useDeleteBackup()

  const backups    = data?.data       ?? []
  const total      = data?.total      ?? 0
  const hasActive  = backups.some((b) => b.status === 'pending' || b.status === 'running')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Info banner */}
      <div style={{ padding: '14px 18px', background: 'rgba(45,125,210,0.05)', border: '1.5px solid rgba(45,125,210,0.2)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <AlertCircle size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 3px' }}>Sauvegardes de la base de données</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
            Les sauvegardes sont des dumps PostgreSQL compressés (gzip). Elles sont stockées selon la configuration du serveur (local, S3, GCS, Azure).
            La rétention automatique est configurable via <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3 }}>BACKUP_RETENTION_DAYS</code>.
          </p>
        </div>
      </div>

      {/* Header + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          {total > 0 ? <><strong style={{ color: 'var(--text-1)' }}>{total}</strong> sauvegarde{total > 1 ? 's' : ''} au total</> : 'Aucune sauvegarde'}
          {hasActive && <span style={{ marginLeft: 8, fontSize: 11.5, color: '#3b82f6', fontFamily: 'var(--font-display)', fontWeight: 700 }}>• Actualisation automatique…</span>}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => refetch()} disabled={isFetching}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            {isFetching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Actualiser
          </button>
          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || hasActive}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: createMut.isPending || hasActive ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700, boxShadow: '0 4px 12px rgba(45,125,210,0.3)', opacity: hasActive ? 0.6 : 1 }}
          >
            {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
            Déclencher une sauvegarde
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ background: 'var(--surface)' }}>
                {['Fichier', 'Statut', 'Taille', 'Durée', 'Créé le', 'Créé par', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : backups.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '60px 24px', textAlign: 'center' }}>
                        <Database size={32} style={{ color: 'var(--text-3)', margin: '0 auto 10px' }} />
                        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>Aucune sauvegarde disponible</p>
                        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0' }}>Déclenchez une première sauvegarde manuellement.</p>
                      </td>
                    </tr>
                  )
                  : backups.map((b) => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{b.filename}</span>
                        {b.storageDisk && (
                          <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)', background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 3 }}>{b.storageDisk}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}><StatusBadge status={b.status} /></td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                        {b.sizeMb ? `${b.sizeMb} MB` : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                        {b.durationSeconds != null ? `${b.durationSeconds}s` : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-3)' }}>
                        {formatDate(b.createdAt)}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-2)' }}>
                        {b.createdBy ? `${b.createdBy.firstName} ${b.createdBy.lastName}` : <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Système</span>}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {b.status === 'success' && (
                            <button
                              type="button"
                              onClick={() => downloadMut.mutate({ id: b.id, filename: b.filename })}
                              disabled={downloadMut.isPending}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 500 }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                            >
                              <Download size={12} /> Télécharger
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { if (confirm(`Supprimer la sauvegarde "${b.filename}" ?`)) deleteMut.mutate(b.id) }}
                            disabled={b.status === 'running' || b.status === 'pending'}
                            style={{ padding: '6px 8px', borderRadius: 'var(--radius-md)', border: '1.5px solid transparent', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.background = 'rgba(239,68,68,0.05)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
