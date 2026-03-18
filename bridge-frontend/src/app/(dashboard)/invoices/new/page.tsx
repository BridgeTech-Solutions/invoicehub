'use client'

import { useSearchParams } from 'next/navigation'
import { InvoiceForm } from '@/features/invoices/components/InvoiceForm'
import type { InvoiceType } from '@/features/invoices/types'

export default function NewInvoicePage() {
  const searchParams       = useSearchParams()
  const defaultClientId    = searchParams.get('clientId')    ?? undefined
  const defaultType        = (searchParams.get('type') as InvoiceType) ?? undefined
  const defaultProformaId  = searchParams.get('proformaId')  ?? undefined
  const defaultParentId    = searchParams.get('parentId')    ?? undefined

  return (
    <InvoiceForm
      defaultClientId={defaultClientId}
      defaultType={defaultType}
      defaultProformaId={defaultProformaId}
      defaultParentInvoiceId={defaultParentId}
    />
  )
}
