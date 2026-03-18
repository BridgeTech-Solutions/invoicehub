'use client'

import React, { useState } from 'react'
import { Download, Loader2, BarChart2, Activity, Users, Database, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuditLogs, useAuditStats, useExportAuditCsv } from '@/features/audit/hooks'
import { useUsers } from '@/features/users/hooks'
import { formatDate } from '@/lib/utils'
import type { AuditAction, ListAuditLogsParams } from '@/features/audit/types'

// ─── Action badge config (valeurs réelles du backend) ─────────
const ACTION_CFG: Partial<Record<AuditAction, { label: string; color: string; bg: string }>> = {
  CREATE:             { label: 'Création',        color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  UPDATE:             { label: 'Modification',    color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  DELETE:             { label: 'Suppression',     color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  SOFT_DELETE:        { label: 'Archivage',       color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  RESTORE:            { label: 'Restauration',    color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  LOGIN:              { label: 'Connexion',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)'  },
  LOGOUT:             { label: 'Déconnexion',     color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  LOGIN_FAILED:       { label: 'Échec connexion', color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  PASSWORD_CHANGE:    { label: 'Mot de passe',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)'  },
  PASSWORD_RESET:     { label: 'Réinit. MDP',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  ROLE_CHANGE:        { label: 'Rôle modifié',    color: '#06b6d4', bg: 'rgba(6,182,212,0.1)'   },
  STATUS_CHANGE:      { label: 'Statut modifié',  color: '#06b6d4', bg: 'rgba(6,182,212,0.1)'   },
  CONVERT_TO_INVOICE: { label: 'Conversion',      color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)'  },
  PAYMENT_REGISTERED: { label: 'Paiement',        color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  PAYMENT_DELETED:    { label: 'Paiement annulé', color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  EMAIL_SENT:         { label: 'Email envoyé',    color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  PDF_GENERATED:      { label: 'PDF généré',      color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  EXPORT:             { label: 'Export',          color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
}

function ActionBadge({ action }: { action: AuditAction }) {
  const c = ACTION_CFG[action] ?? { label: action, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: 100, fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

// ─── Expandable detail panel ──────────────────────────────────
interface DetailPanelProps {
  before:     Record<string, unknown> | null
  after:      Record<string, unknown> | null
  ipAddress:  string | null
  userAgent:  string | null
  entityId:   string | null
  entityType: string | null
}

function DetailPanel({ before, after, ipAddress, userAgent, entityId, entityType }: DetailPanelProps) {
  const hasStateChange = before || after
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}>

      {/* Meta info */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {entityType && (
          <div>
            <span style={{ fontSize: 10.5, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>Table </span>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{entityType}</span>
          </div>
        )}
        {entityId && (
          <div>
            <span style={{ fontSize: 10.5, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>ID </span>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{entityId}</span>
          </div>
        )}
        {ipAddress && (
          <div>
            <span style={{ fontSize: 10.5, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>IP </span>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{ipAddress}</span>
          </div>
        )}
        {userAgent && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <span style={{ fontSize: 10.5, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>User-Agent </span>
            <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', wordBreak: 'break-all' }}>{userAgent}</span>
          </div>
        )}
      </div>

      {/* Before / After JSON */}
      {hasStateChange && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px' }}>Avant</p>
            <pre style={{ margin: 0, fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', overflow: 'auto', maxHeight: 160, whiteSpace: 'pre-wrap', background: 'var(--bg)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              {before ? JSON.stringify(before, null, 2) : '—'}
            </pre>
          </div>
          <div>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px' }}>Après</p>
            <pre style={{ margin: 0, fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', overflow: 'auto', maxHeight: 160, whiteSpace: 'pre-wrap', background: 'var(--bg)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              {after ? JSON.stringify(after, null, 2) : '—'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stats mini-card ──────────────────────────────────────────
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: 0, fontFamily: 'var(--font-display)' }}>{value}</p>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0 }}>{label}</p>
      </div>
    </div>
  )
}

// ─── Skeleton rows ────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      {[140, 100, 120, 130, 90, 24].map((w, i) => (
        <td key={i} style={{ padding: '13px 16px' }}>
          <div style={{ height: 11, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function AuditPage() {
  const [filters, setFilters] = useState<ListAuditLogsParams>({ page: 1, limit: 25 })
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [showStats, setShowStats]     = useState(true)

  const { data, isLoading } = useAuditLogs(filters)
  const { data: stats }     = useAuditStats()
  const { data: usersData } = useUsers({ limit: 100 })
  const exportMut           = useExportAuditCsv()

  const logs       = data?.data       ?? []
  const total      = data?.total      ?? 0
  const totalPages = data?.totalPages ?? 1
  const page       = filters.page ?? 1

  function setFilter<K extends keyof ListAuditLogsParams>(key: K, value: ListAuditLogsParams[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }))
  }

  const inputCss: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none',
  }

  // Stats : utiliser les vrais noms de champs du backend
  const topAction  = stats?.topActions?.[0]
  const topUser    = stats?.topUsers?.[0]
  const topTable   = stats?.topTables?.[0]
  const totalMonth = stats?.dailyActivity?.reduce((s, d) => s + d.count, 0) ?? 0

  const topUserName = topUser?.user
    ? `${topUser.user.firstName} ${topUser.user.lastName}`
    : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            Journaux d&apos;audit
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>
            Trace immuable de toutes les actions sur la plateforme.
            {total > 0 && <> · <strong style={{ color: 'var(--primary)' }}>{total.toLocaleString('fr-FR')}</strong> entrée{total > 1 ? 's' : ''}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => exportMut.mutate({ userId: filters.userId, entityType: filters.entityType, action: filters.action, dateFrom: filters.dateFrom, dateTo: filters.dateTo })}
          disabled={exportMut.isPending}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          {exportMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Exporter CSV
        </button>
      </div>

      {/* Stats toggle */}
      <div>
        <button type="button" onClick={() => setShowStats((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, padding: '2px 0' }}>
          <BarChart2 size={13} />
          Statistiques 30 jours
          {showStats ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showStats && stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
            <StatCard icon={<Activity size={16} />} label="Action la plus fréquente" value={ACTION_CFG[topAction?.action as AuditAction]?.label ?? topAction?.action ?? '—'} color="#3b82f6" />
            <StatCard icon={<Users size={16} />}    label="Utilisateur le plus actif" value={topUserName} color="#8b5cf6" />
            <StatCard icon={<Database size={16} />} label="Table la plus touchée"    value={topTable?.table ?? '—'} color="#10b981" />
            <StatCard icon={<Activity size={16} />} label="Total ce mois"            value={totalMonth} color="#f59e0b" />
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* User filter */}
          <select value={filters.userId ?? ''} onChange={(e) => setFilter('userId', e.target.value || undefined)} style={{ ...inputCss, cursor: 'pointer' }}>
            <option value="">Tous les utilisateurs</option>
            {usersData?.data.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>

          {/* Entity type */}
          <select value={filters.entityType ?? ''} onChange={(e) => setFilter('entityType', e.target.value || undefined)} style={{ ...inputCss, cursor: 'pointer' }}>
            <option value="">Toutes les tables</option>
            {['invoice', 'proforma', 'payment', 'client', 'product', 'user', 'company_settings'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Action */}
          <select value={filters.action ?? ''} onChange={(e) => setFilter('action', (e.target.value || undefined) as AuditAction | undefined)} style={{ ...inputCss, cursor: 'pointer' }}>
            <option value="">Toutes les actions</option>
            {(Object.keys(ACTION_CFG) as AuditAction[]).map((a) => (
              <option key={a} value={a}>{ACTION_CFG[a]!.label}</option>
            ))}
          </select>

          {/* Date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={filters.dateFrom ?? ''} onChange={(e) => setFilter('dateFrom', e.target.value || undefined)} style={inputCss} />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>→</span>
            <input type="date" value={filters.dateTo ?? ''} onChange={(e) => setFilter('dateTo', e.target.value || undefined)} style={inputCss} />
          </div>

          {/* Reset */}
          {(filters.userId || filters.entityType || filters.action || filters.dateFrom || filters.dateTo) && (
            <button type="button" onClick={() => setFilters({ page: 1, limit: 25 })}
              style={{ padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'var(--surface)' }}>
                {['Date & heure', 'Utilisateur', 'Action', 'Table', 'ID entité', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : logs.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center' }}>
                        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>Aucune entrée avec ces filtres</p>
                      </td>
                    </tr>
                  )
                  : logs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                        onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '11px 16px', fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                          {new Date(log.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td style={{ padding: '11px 16px' }}>
                          {log.user
                            ? (
                              <div>
                                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{log.user.firstName} {log.user.lastName}</p>
                                <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--font-mono)' }}>{log.ipAddress ?? ''}</p>
                              </div>
                            )
                            : <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Système</span>
                          }
                        </td>
                        <td style={{ padding: '11px 16px' }}><ActionBadge action={log.action} /></td>
                        <td style={{ padding: '11px 16px', fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{log.entityType ?? '—'}</td>
                        <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.entityId ? log.entityId.slice(0, 8) + '…' : '—'}
                        </td>
                        <td style={{ padding: '11px 10px', color: 'var(--text-3)' }}>
                          {expandedRow === log.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </td>
                      </tr>
                      {expandedRow === log.id && (
                        <tr style={{ background: 'var(--surface)' }}>
                          <td colSpan={6} style={{ padding: '4px 16px 12px' }}>
                            <DetailPanel
                              before={log.previousState}
                              after={log.newState}
                              ipAddress={log.ipAddress}
                              userAgent={log.userAgent}
                              entityId={log.entityId}
                              entityType={log.entityType}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Page {page} sur {totalPages}</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                const p = i + 1
                return (
                  <button key={p} type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, page: p }))}
                    style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', border: '1.5px solid', borderColor: p === page ? 'var(--primary)' : 'var(--border)', background: p === page ? 'var(--primary)' : 'transparent', color: p === page ? '#fff' : 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                    {p}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
