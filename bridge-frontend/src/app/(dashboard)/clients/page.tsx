'use client'

import { useState, useMemo, useId, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, Download, Building2, User, Users, Eye, Pencil, Archive, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { toast } from 'sonner'
import { useClients, useArchiveClient } from '@/features/clients/hooks'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePermission } from '@/hooks/usePermission'
import { formatDate, getInitials } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import type { Client } from '@/features/clients/types'

const PAGE_SIZE = 20

// ─── Status badge ──────────────────────────────────────────────
function StatusBadge({ status }: { status: Client['status'] }) {
  const isActive = status === 'active'
  return (
    <span
      aria-label={isActive ? 'Client actif' : 'Client archivé'}
      style={{
        fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
        letterSpacing: '0.05em', textTransform: 'uppercase',
        padding: '3px 8px', borderRadius: 20,
        background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.15)',
        color:      isActive ? '#16a34a'             : '#64748b',
      }}
    >
      {isActive ? 'Actif' : 'Archivé'}
    </span>
  )
}

// ─── Row actions dropdown ──────────────────────────────────────
function RowActions({ client }: { client: Client }) {
  const router          = useRouter()
  const { can }         = usePermission()
  const archiveMutation = useArchiveClient()

  const items = [
    { label: 'Voir détail', icon: Eye,    onClick: () => router.push(`${ROUTES.CLIENTS}/${client.id}`) },
    ...(can('client', 'update') ? [
      { label: 'Modifier',  icon: Pencil, onClick: () => router.push(`${ROUTES.CLIENTS}/${client.id}/edit`) },
    ] : []),
    ...(can('client', 'update') && client.status === 'active' ? [
      { label: 'Archiver', icon: Archive, onClick: () => archiveMutation.mutate(client.id), danger: true, separator: true },
    ] : []),
  ]

  return <ActionMenu items={items} />
}

// ─── Pagination ────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (p: number) => void
}) {
  if (totalPages <= 1) return null

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-2)', cursor: 'pointer', transition: 'all 0.15s',
  }

  return (
    <nav aria-label="Pagination des clients" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Page précédente"
        style={{ ...btnBase, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
      >
        <ChevronLeft size={16} aria-hidden />
      </button>

      <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 80, textAlign: 'center' }}>
        <span aria-live="polite">Page {page} / {totalPages}</span>
      </span>

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Page suivante"
        style={{ ...btnBase, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
      >
        <ChevronRight size={16} aria-hidden />
      </button>
    </nav>
  )
}

// ─── Page ──────────────────────────────────────────────────────
type Tab = 'all' | 'company' | 'individual'
type StatusFilter = '' | 'active' | 'archived'

export default function ClientsPage() {
  const [tab, setTab]             = useState<Tab>('all')
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState<StatusFilter>('')
  const [page, setPage]           = useState(1)
  const [isExporting, setIsExporting] = useState(false)
  const { can } = usePermission()

  const searchId = useId()
  const statusId = useId()

  const handleTabChange    = useCallback((t: Tab)           => { setTab(t);    setPage(1) }, [])
  const handleStatusChange = useCallback((s: StatusFilter)  => { setStatus(s); setPage(1) }, [])
  const handleSearchChange = useCallback((s: string)        => { setSearch(s); setPage(1) }, [])

  const params = useMemo(() => ({
    limit: PAGE_SIZE,
    page,
    ...(tab !== 'all'    && { type:   tab as 'company' | 'individual' }),
    ...(statusFilter     && { status: statusFilter as 'active' | 'archived' }),
    ...(search           && { search }),
  }), [tab, search, statusFilter, page])

  const { data, isLoading } = useClients(params)
  const clients = data?.data ?? []

  const handleExport = async () => {
    if (clients.length === 0) return
    setIsExporting(true)
    try {
      const rows = [
        ['Nom', 'Type', 'Email', 'Téléphone', 'Ville', 'N° Fiscal', 'Statut'].join(';'),
        ...clients.map((c) => [
          c.name, c.type === 'company' ? 'Entreprise' : 'Particulier',
          c.email ?? '', c.phone ?? '', c.city ?? '', c.taxNumber ?? '',
          c.status === 'active' ? 'Actif' : 'Archivé',
        ].join(';')),
      ].join('\n')
      const blob = new Blob(['\uFEFF' + rows], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a'); a.href = url; a.download = 'clients.csv'; a.click()
      URL.revokeObjectURL(url)
      toast.success('Export CSV téléchargé')
    } finally {
      setIsExporting(false)
    }
  }

  const TABS: { key: Tab; label: string; icon?: React.ElementType }[] = [
    { key: 'all',        label: 'Tous' },
    { key: 'company',    label: 'Entreprises', icon: Building2 },
    { key: 'individual', label: 'Particuliers', icon: User },
  ]

  const totalShown = data
    ? `${((page - 1) * PAGE_SIZE) + 1}–${Math.min(page * PAGE_SIZE, data.total)} sur ${data.total} client${data.total !== 1 ? 's' : ''}`
    : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Clients"
        description={data ? `${data.total} client${data.total !== 1 ? 's' : ''}` : undefined}
        actions={
          <>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || clients.length === 0}
              aria-label="Exporter la liste des clients au format CSV"
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-2)', fontSize: 13.5, cursor: isExporting ? 'wait' : 'pointer',
                fontFamily: 'var(--font-display)', fontWeight: 500,
                opacity: clients.length === 0 ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {isExporting
                ? <Loader2 size={14} className="animate-spin" aria-hidden />
                : <Download size={14} aria-hidden />}
              Exporter
            </button>
            {can('client', 'create') && (
              <Link
                href={ROUTES.CLIENTS + '/new'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 16px', borderRadius: 'var(--radius-md)',
                  background: 'var(--primary)', color: '#fff',
                  textDecoration: 'none', fontSize: 13.5,
                  fontFamily: 'var(--font-display)', fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(45,125,210,0.3)',
                }}
              >
                <Plus size={15} strokeWidth={2.5} aria-hidden /> Nouveau client
              </Link>
            )}
          </>
        }
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>

          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
            <label htmlFor={searchId} className="sr-only">Rechercher un client</label>
            <Search size={14} aria-hidden style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              id={searchId}
              type="search"
              placeholder="Rechercher un client..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="Rechercher un client"
              style={{
                width: '100%', padding: '8px 12px 8px 32px',
                borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
                background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
                fontFamily: 'var(--font-body)', outline: 'none',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = 'var(--surface)' }}
              onBlur={(e)  => { e.target.style.borderColor = 'var(--border)';  e.target.style.background = 'var(--bg)' }}
            />
          </div>

          {/* Type tabs */}
          <div role="tablist" aria-label="Filtrer par type de client" style={{ display: 'flex', gap: 4 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => handleTabChange(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0 14px', minHeight: 44, borderRadius: 'var(--radius-md)',
                  border: tab === t.key ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                  background: tab === t.key ? 'rgba(45,125,210,0.08)' : 'transparent',
                  color: tab === t.key ? 'var(--primary)' : 'var(--text-3)',
                  fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                  fontFamily: 'var(--font-display)', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {t.icon && <t.icon size={13} strokeWidth={2} aria-hidden />}
                {t.label}
              </button>
            ))}
          </div>

          {/* Status select */}
          <div>
            <label htmlFor={statusId} className="sr-only">Filtrer par statut</label>
            <select
              id={statusId}
              aria-label="Filtrer par statut"
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value as StatusFilter)}
              style={{ padding: '0 10px', height: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">Tous les statuts</option>
              <option value="active">Actifs</option>
              <option value="archived">Archivés</option>
            </select>
          </div>
        </div>

        {/* Table body */}
        {isLoading ? (
          <div aria-hidden="true">
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.5fr 1fr 0.8fr 0.8fr 0.8fr 40px', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--border)' }} className="animate-pulse" />
                  <div style={{ height: 13, width: 140, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                </div>
                {[120, 80, 70, 50, 60].map((w, j) => (
                  <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                ))}
                <div style={{ width: 24, height: 24, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
              </div>
            ))}
          </div>
        ) : clients.length === 0 ? (
          search
            ? <RichEmptyState icon={Users} title={`Aucun résultat pour « ${search} »`} description="Essayez un autre nom, email ou numéro de téléphone." compact />
            : tab !== 'all'
              ? <RichEmptyState icon={tab === 'company' ? Building2 : User} title={`Aucun client ${tab === 'company' ? 'Entreprise' : 'Particulier'}`} description="Aucun client ne correspond à ce type pour le moment." compact />
              : <RichEmptyState
                  icon={Users}
                  title="Ajoutez vos premiers clients"
                  description="Centralisez vos clients, suivez leur solde impayé et consultez l'historique complet de leur facturation."
                  features={['Entreprises & particuliers', 'Solde temps réel', 'NIU / RCCM']}
                  cta={can('client', 'create') ? { label: '+ Nouveau client', href: `${ROUTES.CLIENTS}/new` } : undefined}
                  secondaryCta={{ label: 'Voir le guide', href: ROUTES.GUIDE }}
                />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              className="data-table"
              aria-label="Liste des clients"
              aria-busy={isLoading}
            >
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Ville</th>
                  <th scope="col">Type</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Depuis</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span aria-hidden="true" style={{
                          width: 34, height: 34, borderRadius: '50%',
                          background: 'rgba(45,125,210,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: 'var(--primary)',
                          fontFamily: 'var(--font-display)', flexShrink: 0,
                        }}>
                          {getInitials(client.name)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <Link href={`${ROUTES.CLIENTS}/${client.id}`} style={{ textDecoration: 'none' }}>
                            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{client.name}</p>
                          </Link>
                          {client.taxNumber && (
                            <p className="doc-number" style={{ fontSize: 11, color: 'var(--text-3)' }}>{client.taxNumber}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      {client.email && <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{client.email}</p>}
                      {client.phone && <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{client.phone}</p>}
                      {!client.email && !client.phone && <span style={{ fontSize: 13, color: 'var(--border)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-2)' }}>{client.city ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {client.type === 'company'
                          ? <><Building2 size={12} aria-hidden style={{ color: 'var(--text-3)' }} /><span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Entreprise</span></>
                          : <><User       size={12} aria-hidden style={{ color: 'var(--text-3)' }} /><span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Particulier</span></>
                        }
                      </div>
                    </td>
                    <td><StatusBadge status={client.status} /></td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatDate(client.createdAt)}</td>
                    <td><RowActions client={client} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer: count + pagination */}
        {data && (data.totalPages > 1 || clients.length > 0) && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)' }} aria-live="polite">
              {data.totalPages > 1 ? totalShown : `${clients.length} client${clients.length !== 1 ? 's' : ''}`}
            </p>
            {data.totalPages > 1 && (
              <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
