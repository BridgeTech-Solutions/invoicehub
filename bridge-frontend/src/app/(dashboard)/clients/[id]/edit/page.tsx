'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useClient } from '@/features/clients/hooks'
import { ClientForm } from '@/features/clients/components/ClientForm'
import { ROUTES } from '@/lib/constants'

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ height: 13, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(3)].map((_, j) => (
              <div key={j} style={{ height: 36, background: 'var(--border)', borderRadius: 8, opacity: 0.6 - j * 0.15 }} className="animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function EditClientPage() {
  const { id } = useParams<{ id: string }>()
  const { data: client, isLoading } = useClient(id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link
          href={`${ROUTES.CLIENTS}/${id}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
        >
          <ChevronLeft size={14} />
          {client ? client.name : 'Retour au client'}
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
          Modifier le client
        </h1>
        {client && (
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>
            {client.type === 'company' ? 'Entreprise' : 'Particulier'} · mis à jour le{' '}
            {new Date(client.updatedAt ?? client.createdAt).toLocaleDateString('fr-FR')}
          </p>
        )}
      </div>

      {/* Form card */}
      <div className="card" style={{ padding: '28px 32px' }}>
        {isLoading || !client
          ? <Skeleton />
          : <ClientForm client={client} wide onClose={undefined} />
        }
      </div>
    </div>
  )
}
