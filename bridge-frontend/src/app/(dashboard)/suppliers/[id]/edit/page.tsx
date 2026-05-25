'use client'

import { use } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import { SupplierForm } from '@/features/suppliers/components/SupplierForm'
import { useSupplier } from '@/features/suppliers/hooks'
import { ROUTES } from '@/lib/constants'

export default function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { can } = usePermission()
  const { id } = use(params)
  const { data: supplier, isLoading } = useSupplier(id)

  if (!can('supplier', 'update')) return <AccessDenied message="Vous n'avez pas les droits pour modifier un fournisseur." />

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
        <div style={{ height: 20, width: 160, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div className="card animate-pulse" style={{ height: 480 }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900, animation: 'page-in 0.2s ease' }}>
      <div>
        <Link
          href={`${ROUTES.SUPPLIERS}/${id}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)' }}
        >
          <ChevronLeft size={14} /> {supplier?.name ?? 'Fournisseur'}
        </Link>
        <PageHeader
          title="Modifier le fournisseur"
          description={`Mise à jour de ${supplier?.name ?? ''}`}
        />
      </div>

      <div className="card" style={{ padding: '28px 32px' }}>
        <SupplierForm supplier={supplier} wide />
      </div>
    </div>
  )
}
