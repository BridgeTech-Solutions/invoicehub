'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { ClientForm } from '@/features/clients/components/ClientForm'
import { PageHeader } from '@/components/layout/PageHeader'
import { ROUTES } from '@/lib/constants'

export default function NewClientPage() {
  const { can } = usePermission()

  if (!can('client', 'create')) return <AccessDenied message="Vous n'avez pas les droits pour créer un client." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      <div>
        <Link
          href={ROUTES.CLIENTS}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
        >
          <ChevronLeft size={14} /> Retour aux clients
        </Link>
        <PageHeader title="Nouveau client" description="Ajoutez un client à votre répertoire BTS" />
      </div>

      <div className="card" style={{ padding: '28px 32px' }}>
        <ClientForm wide />
      </div>
    </div>
  )
}
