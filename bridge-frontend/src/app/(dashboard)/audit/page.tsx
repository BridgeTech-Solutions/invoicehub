'use client'

import React, { useState, useId, useCallback } from 'react'
import { Download, Loader2, Activity, Users, Database, Shield, TrendingUp, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuditLogs, useAuditStats, useExportAuditCsv } from '@/features/audit/hooks'
import { useUsers } from '@/features/users/hooks'
import { formatDate } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { AuditAction, ListAuditLogsParams } from '@/features/audit/types'

// ─── Action badge config ───────────────────────────────────────
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
    <span
      aria-label={`Action : ${c.label}`}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '3px 8px', borderRadius: 100,
        fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
        background: c.bg, color: c.color, whiteSpace: 'nowrap',
      }}
    >
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
  panelId:    string
}

function DetailPanel({ before, after, ipAddress, userAgent, entityId, entityType, panelId }: DetailPanelProps) {
  const isMobile      = useIsMobile()
  const hasStateChange = before || after

  return (
    <div
      id={panelId}
      role="region"
      aria-label="Détails de l'entrée d'audit"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}
    >
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
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

// ─── KPI card ─────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color, loading }: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  color: string
  loading?: boolean
}) {
  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', overflow: 'hidden' }}>
      {/* Accent strip */}
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: color, borderRadius: '4px 0 0 4px' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <div aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          {icon}
        </div>
      </div>
      {loading ? (
        <div style={{ height: 28, width: 80, background: 'var(--border)', borderRadius: 6 }} className="animate-pulse" />
      ) : (
        <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-1)', margin: 0, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', lineHeight: 1 }}>
          {value}
        </p>
      )}
      {sub && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>{sub}</p>
      )}
    </div>
  )
}

// ─── Skeleton rows ────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr aria-hidden="true">
      {[140, 100, 120, 130, 90, 24].map((w, i) => (
        <td key={i} style={{ padding: '13px 16px' }}>
          <div style={{ height: 11, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

// ─── Pagination ───────────────────────────────────────────────
function buildPageRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3) pages.push('…')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
}

function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (p: number) => void
}) {
  if (totalPages <= 1) return null

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 36, height: 36, borderRadius: 'var(--radius-sm)',
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-2)', fontSize: 13, cursor: 'pointer',
    fontFamily: 'var(--font-display)', fontWeight: 600, transition: 'all 0.15s',
  }

  return (
    <nav aria-label="Pagination des journaux d'audit" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Page précédente"
        style={{ ...btnBase, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer', padding: '0 8px' }}
      >
        <ChevronLeft size={15} aria-hidden />
      </button>

      {buildPageRange(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} style={{ width: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? 'page' : undefined}
            style={{
              ...btnBase,
              borderColor: p === page ? 'var(--primary)' : 'var(--border)',
              background:  p === page ? 'var(--primary)' : 'transparent',
              color:       p === page ? '#fff' : 'var(--text-2)',
              padding: '0 10px',
            }}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Page suivante"
        style={{ ...btnBase, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer', padding: '0 8px' }}
      >
        <ChevronRight size={15} aria-hidden />
      </button>
    </nav>
  )
}

// ─── Page ─────────────────────────────────────────────────────
const TABLE_HEADERS = [
  { key: 'date',    label: 'Date & heure' },
  { key: 'user',    label: 'Utilisateur' },
  { key: 'action',  label: 'Action' },
  { key: 'table',   label: 'Table' },
  { key: 'id',      label: 'ID entité' },
  { key: 'details', label: 'Détails' },
]

const ENTITY_TYPES = ['invoice', 'proforma', 'payment', 'client', 'product', 'user', 'company_settings']

export default function AuditPage() {
  const [filters,     setFilters]     = useState<ListAuditLogsParams>({ page: 1, limit: 25 })
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  // Unique IDs for filter labels
  const idUserFilter   = useId()
  const idTableFilter  = useId()
  const idActionFilter = useId()
  const idDateFrom     = useId()
  const idDateTo       = useId()

  const { data, isLoading } = useAuditLogs(filters)
  const { data: stats }     = useAuditStats()
  const { data: usersData } = useUsers({ limit: 100 })
  const exportMut           = useExportAuditCsv()

  const logs       = data?.data       ?? []
  const total      = data?.total      ?? 0
  const totalPages = data?.totalPages ?? 1
  const page       = filters.page ?? 1

  const setFilter = useCallback(<K extends keyof ListAuditLogsParams>(key: K, value: ListAuditLogsParams[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }))
  }, [])

  const handlePageChange = useCallback((p: number) => {
    setFilters((prev) => ({ ...prev, page: p }))
  }, [])

  const toggleRow = useCallback((id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id))
  }, [])

  const inputCss: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none', height: 36,
  }

  const topAction   = stats?.topActions?.[0]
  const topUser     = stats?.topUsers?.[0]
  const topTable    = stats?.topTables?.[0]
  const totalMonth  = stats?.dailyActivity?.reduce((s, d) => s + d.count, 0) ?? 0
  const todayStr    = new Date().toISOString().slice(0, 10)
  const todayCount  = stats?.dailyActivity?.find(d => d.day?.slice(0, 10) === todayStr)?.count ?? 0
  const topUserName = topUser?.user
    ? `${topUser.user.firstName} ${topUser.user.lastName}`
    : '—'
  const topActionLabel = ACTION_CFG[topAction?.action as AuditAction]?.label ?? topAction?.action ?? '—'

  const hasActiveFilters = !!(filters.userId || filters.entityType || filters.action || filters.dateFrom || filters.dateTo)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            Journaux d&apos;audit
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>
            Trace immuable de toutes les actions sur la plateforme.
            {total > 0 && (
              <>
                {' · '}
                <strong style={{ color: 'var(--primary)' }} aria-live="polite">
                  {total.toLocaleString('fr-FR')}
                </strong>
                {' '}entrée{total > 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => exportMut.mutate({
            userId: filters.userId, entityType: filters.entityType,
            action: filters.action, dateFrom: filters.dateFrom, dateTo: filters.dateTo,
          })}
          disabled={exportMut.isPending}
          aria-label="Exporter les journaux d'audit au format CSV"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: exportMut.isPending ? 'wait' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: exportMut.isPending ? 0.65 : 1, transition: 'opacity 0.15s' }}
        >
          {exportMut.isPending
            ? <Loader2 size={13} className="animate-spin" aria-hidden />
            : <Download size={13} aria-hidden />}
          Exporter CSV
        </button>
      </div>

      {/* ── KPI cards ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        <KpiCard
          icon={<TrendingUp size={16} />}
          label="Événements (30 j)"
          value={totalMonth.toLocaleString('fr-FR')}
          sub={todayCount > 0 ? `dont ${todayCount} aujourd'hui` : "Aucun événement aujourd'hui"}
          color="#3b82f6"
          loading={!stats}
        />
        <KpiCard
          icon={<Activity size={16} />}
          label="Action dominante"
          value={topActionLabel}
          sub={topAction ? `${topAction.count.toLocaleString('fr-FR')} occurrences` : undefined}
          color="#8b5cf6"
          loading={!stats}
        />
        <KpiCard
          icon={<Users size={16} />}
          label="Utilisateur le + actif"
          value={topUserName}
          sub={topUser ? `${topUser.count.toLocaleString('fr-FR')} actions` : undefined}
          color="#10b981"
          loading={!stats}
        />
        <KpiCard
          icon={<Database size={16} />}
          label="Table la + touchée"
          value={topTable?.table ?? '—'}
          sub={topTable ? `${topTable.count.toLocaleString('fr-FR')} modifications` : undefined}
          color="#f59e0b"
          loading={!stats}
        />
        <KpiCard
          icon={<Shield size={16} />}
          label="Entrées au total"
          value={total.toLocaleString('fr-FR')}
          sub="Trace immuable et intégrale"
          color="#64748b"
          loading={isLoading}
        />
      </div>

      {/* ── Filters ────────────────────────────────────── */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend className="sr-only">Filtrer les journaux d'audit</legend>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>

            {/* Utilisateur */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor={idUserFilter} className="sr-only">Filtrer par utilisateur</label>
              <select
                id={idUserFilter}
                aria-label="Filtrer par utilisateur"
                value={filters.userId ?? ''}
                onChange={(e) => setFilter('userId', e.target.value || undefined)}
                style={{ ...inputCss, cursor: 'pointer' }}
              >
                <option value="">Tous les utilisateurs</option>
                {usersData?.data.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>

            {/* Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor={idTableFilter} className="sr-only">Filtrer par table</label>
              <select
                id={idTableFilter}
                aria-label="Filtrer par table"
                value={filters.entityType ?? ''}
                onChange={(e) => setFilter('entityType', e.target.value || undefined)}
                style={{ ...inputCss, cursor: 'pointer' }}
              >
                <option value="">Toutes les tables</option>
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Action */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor={idActionFilter} className="sr-only">Filtrer par action</label>
              <select
                id={idActionFilter}
                aria-label="Filtrer par action"
                value={filters.action ?? ''}
                onChange={(e) => setFilter('action', (e.target.value || undefined) as AuditAction | undefined)}
                style={{ ...inputCss, cursor: 'pointer' }}
              >
                <option value="">Toutes les actions</option>
                {(Object.keys(ACTION_CFG) as AuditAction[]).map((a) => (
                  <option key={a} value={a}>{ACTION_CFG[a]!.label}</option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div role="group" aria-label="Période" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor={idDateFrom} className="sr-only">Date de début</label>
              <input
                id={idDateFrom}
                type="date"
                aria-label="Date de début"
                value={filters.dateFrom ?? ''}
                onChange={(e) => setFilter('dateFrom', e.target.value || undefined)}
                style={inputCss}
              />
              <span aria-hidden="true" style={{ fontSize: 12, color: 'var(--text-3)' }}>→</span>
              <label htmlFor={idDateTo} className="sr-only">Date de fin</label>
              <input
                id={idDateTo}
                type="date"
                aria-label="Date de fin"
                value={filters.dateTo ?? ''}
                onChange={(e) => setFilter('dateTo', e.target.value || undefined)}
                style={inputCss}
              />
            </div>

            {/* Reset */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => setFilters({ page: 1, limit: 25 })}
                aria-label="Réinitialiser tous les filtres d'audit"
                style={{ padding: '0 12px', height: 36, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 500 }}
              >
                Réinitialiser
              </button>
            )}
          </div>
        </fieldset>
      </div>

      {/* ── Table ──────────────────────────────────────── */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            aria-label="Journaux d'audit"
            aria-busy={isLoading}
            style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}
          >
            <thead>
              <tr style={{ background: 'var(--surface)' }}>
                {TABLE_HEADERS.map((h) => (
                  <th
                    key={h.key}
                    scope="col"
                    style={{ padding: '10px 16px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}
                  >
                    {h.key === 'details'
                      ? <span className="sr-only">{h.label}</span>
                      : h.label}
                  </th>
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
                        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
                          {hasActiveFilters
                            ? 'Aucune entrée avec ces filtres'
                            : 'Aucun journal d\'audit disponible'}
                        </p>
                      </td>
                    </tr>
                  )
                  : logs.map((log) => {
                    const isExpanded  = expandedRow === log.id
                    const panelId     = `audit-detail-${log.id}`
                    const rowId       = `audit-row-${log.id}`
                    const userName    = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Système'
                    const actionLabel = ACTION_CFG[log.action]?.label ?? log.action
                    const rowLabel    = `${userName}, ${actionLabel}, ${log.entityType ?? ''}, ${new Date(log.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`

                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          id={rowId}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          aria-controls={isExpanded ? panelId : undefined}
                          aria-label={`${rowLabel} — cliquer pour ${isExpanded ? 'masquer' : 'afficher'} les détails`}
                          onClick={() => toggleRow(log.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRow(log.id) } }}
                          onFocus={(e)      => { e.currentTarget.style.background = 'var(--surface)' }}
                          onBlur={(e)       => { e.currentTarget.style.background = 'transparent' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s', outline: 'none' }}
                        >
                          <td style={{ padding: '11px 16px', fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                            <time dateTime={log.createdAt}>
                              {new Date(log.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                            </time>
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
                            {isExpanded
                              ? <ChevronUp size={14} aria-hidden />
                              : <ChevronDown size={14} aria-hidden />}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr style={{ background: 'var(--surface)' }}>
                            <td colSpan={6} style={{ padding: '4px 16px 12px' }}>
                              <DetailPanel
                                panelId={panelId}
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
                    )
                  })
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }} aria-live="polite">
              Page {page} sur {totalPages} · {total.toLocaleString('fr-FR')} entrée{total > 1 ? 's' : ''}
            </p>
            <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
          </div>
        )}
      </div>
    </div>
  )
}
