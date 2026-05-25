'use client'

import { useSearchParams } from 'next/navigation'
import { PurchaseOrderForm } from '@/features/purchase-orders/components/PurchaseOrderForm'

export default function NewPurchaseOrderPage() {
  const searchParams      = useSearchParams()
  const defaultSupplierId = searchParams.get('supplierId') ?? undefined

  return <PurchaseOrderForm defaultSupplierId={defaultSupplierId} />
}
