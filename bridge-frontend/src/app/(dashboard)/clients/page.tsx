'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, Download, Building2, User, Eye, Pencil, Archive } from 'lucide-react'
import { useClients, useArchiveClient } from '@/features/clients/hooks'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePermission } from '@/hooks/usePermission'
import { formatDate, getInitials } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import type { Client } from '@/features/clients/types'

// ─── Status badge ──────────────────────────────────────────────
function StatusBadge({ status }: { status: Client['status'] }) {
  const isActive = status === 'active'
  return (
    <span style={{
      fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 20,
      background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.15)',
      color:      isActive ? '#16a34a'             : '#64748b',
    }}>
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

// ─── Page ──────────────────────────────────────────────────────
type Tab = 'all' | 'company' | 'individual'
type StatusFilter = '' | 'active' | 'archived'

export default function ClientsPage() {
  const [tab, setTab]             = useState<Tab>('all')
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState<StatusFilter>('')
  const { can } = usePermission()

  const params = useMemo(() => ({
    limit: 50,
    ...(tab !== 'all'    && { type:   tab as 'company' | 'individual' }),
    ...(statusFilter     && { status: statusFilter as 'active' | 'archived' }),
    ...(search           && { search }),
  }), [tab, search, statusFilter])

  const { data, isLoading } = useClients(params)
  const clients = data?.data ?? []

  const handleExport = () => {
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
  }

  const TABS: { key: Tab; label: string; icon?: React.ElementType }[] = [
    { key: 'all',        label: 'Tous' },
    { key: 'company',    label: 'Entreprises', icon: Building2 },
    { key: 'individual', label: 'Particuliers', icon: User },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Clients"
        description={data ? `${data.total} client${data.total !== 1 ? 's' : ''}` : undefined}
        actions={
          <>
            <button
              onClick={handleExport}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer',
                fontFamily: 'var(--font-display)', fontWeight: 500,
              }}
            >
              <Download size={14} /> Exporter
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
                <Plus size={15} strokeWidth={2.5} /> Nouveau client
              </Link>
            )}
          </>
        }
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              type="text"
              placeholder="Rechercher un client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
          <div style={{ display: 'flex', gap: 4 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 'var(--radius-md)',
                  border: tab === t.key ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                  background: tab === t.key ? 'rgba(45,125,210,0.08)' : 'transparent',
                  color: tab === t.key ? 'var(--primary)' : 'var(--text-3)',
                  fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                  fontFamily: 'var(--font-display)', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {t.icon && <t.icon size={13} strokeWidth={2} />}
                {t.label}
              </button>
            ))}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="archived">Archivés</option>
          </select>
        </div>

        {/* Table body */}
        {isLoading ? (
          <div>
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
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <User size={40} style={{ color: 'var(--border)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 4 }}>
              {search ? `Aucun résultat pour "${search}"` : 'Aucun client pour le moment'}
            </p>
            {can('client', 'create') && !search && (
              <Link href={ROUTES.CLIENTS + '/new'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 13.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
                <Plus size={13} /> Créer le premier client
              </Link>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Contact</th>
                <th>Ville</th>
                <th>Type</th>
                <th>Statut</th>
                <th>Depuis</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
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
                        ? <><Building2 size={12} style={{ color: 'var(--text-3)' }} /><span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Entreprise</span></>
                        : <><User       size={12} style={{ color: 'var(--text-3)' }} /><span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Particulier</span></>
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
        )}

        {data && data.total > clients.length && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
              {clients.length} / {data.total} clients affichés
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
