'use client'

import { useSearchParams } from 'next/navigation'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { SupplierInvoiceForm } from '@/features/supplier-invoices/components/SupplierInvoiceForm'

export default function NewSupplierInvoicePage() {
  const { can } = usePermission()
  const searchParams      = useSearchParams()
  const defaultSupplierId = searchParams.get('supplierId') ?? undefined

  if (!can('supplier', 'create')) return <AccessDenied message="Vous n'avez pas les droits pour créer une facture fournisseur." />

  return <SupplierInvoiceForm defaultSupplierId={defaultSupplierId} />
}
