'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import { SupplierForm } from '@/features/suppliers/components/SupplierForm'
import { ROUTES } from '@/lib/constants'

export default function NewSupplierPage() {
  const { can } = usePermission()

  if (!can('supplier', 'create')) return <AccessDenied message="Vous n'avez pas les droits pour créer un fournisseur." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      <div>
        <Link
          href={ROUTES.SUPPLIERS}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)' }}
        >
          <ChevronLeft size={14} /> Fournisseurs
        </Link>
        <PageHeader title="Nouveau fournisseur" description="Ajoutez un fournisseur à votre répertoire BTS" />
      </div>

      <div className="card" style={{ padding: '28px 32px' }}>
        <SupplierForm wide />
      </div>
    </div>
  )
}
