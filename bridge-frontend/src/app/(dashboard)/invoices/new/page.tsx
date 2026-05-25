'use client'

import { useSearchParams } from 'next/navigation'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { InvoiceForm } from '@/features/invoices/components/InvoiceForm'
import type { InvoiceType } from '@/features/invoices/types'

export default function NewInvoicePage() {
  const { can } = usePermission()
  const searchParams       = useSearchParams()
  const defaultClientId    = searchParams.get('clientId')    ?? undefined
  const defaultType        = (searchParams.get('type') as InvoiceType) ?? undefined
  const defaultProformaId  = searchParams.get('proformaId')  ?? undefined
  const defaultParentId    = searchParams.get('parentId')    ?? undefined

  if (!can('invoice', 'create')) return <AccessDenied message="Vous n'avez pas les droits pour créer une facture." />

  return (
    <InvoiceForm
      defaultClientId={defaultClientId}
      defaultType={defaultType}
      defaultProformaId={defaultProformaId}
      defaultParentInvoiceId={defaultParentId}
    />
  )
}
