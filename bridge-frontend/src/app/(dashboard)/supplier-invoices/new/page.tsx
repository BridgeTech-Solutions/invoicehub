'use client'

import { useSearchParams } from 'next/navigation'
import { SupplierInvoiceForm } from '@/features/supplier-invoices/components/SupplierInvoiceForm'

export default function NewSupplierInvoicePage() {
  const searchParams      = useSearchParams()
  const defaultSupplierId = searchParams.get('supplierId') ?? undefined

  return <SupplierInvoiceForm defaultSupplierId={defaultSupplierId} />
}
