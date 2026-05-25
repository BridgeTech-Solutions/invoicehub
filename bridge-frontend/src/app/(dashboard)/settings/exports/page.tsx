'use client'

import { useState, useId } from 'react'
import { Download, FileSpreadsheet, FileText, File, Loader2, RefreshCw, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { useExports, useCreateExport, useDownloadExport } from '@/features/settings-advanced/hooks'
import {
  EXPORT_ENTITY_LABELS, EXPORT_FORMAT_LABELS,
  type ExportEntityType, type ExportFormat, type ExportJob,
} from '@/features/settings-advanced/types'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'

const inputCss: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
  outline: 'none', width: '100%', boxSizing: 'border-box', cursor: 'pointer',
}

function formatBytes(bytes?: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function formatFilename(job: ExportJob): string {
  const d = new Date(job.createdAt)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const ext: Record<ExportFormat, string> = {
    csv: 'csv', excel: 'xlsx', pdf: 'pdf', sage_csv: 'csv', ciel_csv: 'csv',
  }
  return `bts-export-${job.module}-${date}.${ext[job.format]}`
}

// ─── Status badge ──────────────────────────────────────────────
function StatusBadge({ status }: { status: ExportJob['status'] }) {
  const cfg = {
    pending:    { label: 'En attente',     icon: <Clock size={11} />,          bg: 'rgba(245,158,11,0.1)',  color: '#d97706' },
    processing: { label: 'En cours',       icon: <Loader2 size={11} className="animate-spin" />, bg: 'rgba(99,102,241,0.1)', color: '#6366f1' },
    completed:  { label: 'Prêt',           icon: <CheckCircle2 size={11} />,   bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
    failed:     { label: 'Échec',          icon: <AlertCircle size={11} />,    bg: 'rgba(239,68,68,0.1)',  color: '#ef4444' },
  }[status]

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 100,
      background: cfg.bg, color: cfg.color,
      fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-display)',
    }}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

// ─── Format badge ──────────────────────────────────────────────
function FormatBadge({ format }: { format: ExportFormat }) {
  const icons: Record<ExportFormat, React.ReactNode> = {
    excel:    <FileSpreadsheet size={12} />,
    csv:      <File size={12} />,
    pdf:      <FileText size={12} />,
    sage_csv: <File size={12} />,
    ciel_csv: <File size={12} />,
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)',
    }}>
      {icons[format]} {format.toUpperCase().replace('_', ' ')}
    </span>
  )
}

// ─── Create export form ────────────────────────────────────────
function CreateExportForm() {
  const uid       = useId()
  const id        = (s: string) => `${uid}-${s}`
  const createMut = useCreateExport()

  const [form, setForm] = useState<{ entityType: ExportEntityType; format: ExportFormat; dateFrom: string; dateTo: string }>({
    entityType: 'invoices',
    format:     'excel',
    dateFrom:   '',
    dateTo:     '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const filters: Record<string, string> = {}
    if (form.dateFrom) filters['dateFrom'] = form.dateFrom
    if (form.dateTo)   filters['dateTo']   = form.dateTo

    await createMut.mutateAsync({
      entityType: form.entityType,
      format:     form.format,
      filters,
    })
  }

  return (
    <div className="card">
      <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Download size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" />
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
          Nouvel export
        </h2>
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label htmlFor={id('entity')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Données
            </label>
            <select id={id('entity')} value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value as ExportEntityType })} style={inputCss}>
              {(Object.entries(EXPORT_ENTITY_LABELS) as [ExportEntityType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id('format')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Format
            </label>
            <select id={id('format')} value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as ExportFormat })} style={inputCss}>
              {(Object.entries(EXPORT_FORMAT_LABELS) as [ExportFormat, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id('from')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Période — du
            </label>
            <input id={id('from')} type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} style={{ ...inputCss, cursor: 'text' }} />
          </div>
          <div>
            <label htmlFor={id('to')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              au
            </label>
            <input id={id('to')} type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} style={{ ...inputCss, cursor: 'text' }} />
          </div>
          <button
            type="submit"
            disabled={createMut.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 20px', borderRadius: 'var(--radius-md)',
              border: 'none', background: 'var(--primary)', color: '#fff',
              cursor: createMut.isPending ? 'not-allowed' : 'pointer',
              fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700,
              opacity: createMut.isPending ? 0.65 : 1, whiteSpace: 'nowrap', minHeight: 44,
            }}
          >
            {createMut.isPending
              ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              : <Download size={14} aria-hidden="true" />}
            Lancer l&apos;export
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '10px 0 0' }}>
          Les fichiers sont disponibles pendant 24h après génération. Formats Sage et Ciel compatibles avec les versions françaises.
        </p>
      </form>
    </div>
  )
}

// ─── Export jobs table ─────────────────────────────────────────
function ExportJobsTable() {
  const { data: jobs = [], isLoading } = useExports()
  const downloadMut = useDownloadExport()

  if (isLoading) {
    return (
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ height: 40, background: 'var(--surface)', borderBottom: '2px solid var(--border)' }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ height: 52, background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderBottom: '1px solid var(--border)' }} className="animate-pulse" />
        ))}
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <Download size={36} style={{ color: 'var(--border)', margin: '0 auto 12px' }} aria-hidden="true" />
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
          Aucun export
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          Utilisez le formulaire ci-dessus pour lancer votre premier export.
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
      {/* Header */}
      <div aria-hidden="true" style={{
        display: 'grid', gridTemplateColumns: '140px 1fr 110px 100px 120px 80px',
        gap: 12, padding: '10px 16px',
        background: 'var(--surface)', borderBottom: '2px solid var(--border)',
      }}>
        {['Date', 'Données', 'Format', 'Statut', 'Expire', 'Actions'].map((h) => (
          <span key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {h}
          </span>
        ))}
      </div>
      {jobs.map((job) => {
        const isExpired = new Date(job.expiresAt) < new Date()
        const canDownload = job.status === 'completed' && !isExpired

        return (
          <div
            key={job.id}
            style={{
              display: 'grid', gridTemplateColumns: '140px 1fr 110px 100px 120px 80px',
              gap: 12, padding: '12px 16px', alignItems: 'center',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
              {new Date(job.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>
              {EXPORT_ENTITY_LABELS[job.module]}
            </span>
            <FormatBadge format={job.format} />
            <StatusBadge status={job.status} />
            <span style={{ fontSize: 12, color: isExpired ? 'var(--text-3)' : 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
              {isExpired ? 'Expiré' : new Date(job.expiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            <div>
              {canDownload && (
                <button
                  type="button"
                  aria-label={`Télécharger l'export ${EXPORT_ENTITY_LABELS[job.module]}`}
                  onClick={() => downloadMut.mutate({ id: job.id, filename: formatFilename(job) })}
                  disabled={downloadMut.isPending}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 12px', borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--primary)', background: 'transparent', color: 'var(--primary)',
                    cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600,
                    minHeight: 44,
                  }}
                >
                  {downloadMut.isPending
                    ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                    : <Download size={12} aria-hidden="true" />}
                  Télécharger
                </button>
              )}
              {job.status === 'failed' && (
                <span style={{ fontSize: 11.5, color: '#ef4444' }}>{job.errorMsg ?? 'Erreur'}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function ExportsPage() {
  const { can } = usePermission()
  if (!can('settings', 'update')) return <AccessDenied message="L'export de données est réservé aux administrateurs." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
          Exports de données
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
          Exportez vos données en Excel, CSV, PDF ou formats comptables Sage et Ciel Compta.
        </p>
      </div>

      <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(45,125,210,0.06)', border: '1px solid rgba(45,125,210,0.2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <RefreshCw size={14} style={{ color: 'var(--primary)', marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
          Les exports sont générés en arrière-plan. Cette page se rafraîchit automatiquement toutes les 5 secondes tant qu&apos;un export est en cours.
          Les fichiers expirent 24h après leur génération.
        </p>
      </div>

      <CreateExportForm />
      <ExportJobsTable />
    </div>
  )
}
