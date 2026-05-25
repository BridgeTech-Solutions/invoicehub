'use client'

import { useSearchParams } from 'next/navigation'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PurchaseOrderForm } from '@/features/purchase-orders/components/PurchaseOrderForm'

export default function NewPurchaseOrderPage() {
  const { can } = usePermission()
  const searchParams      = useSearchParams()
  const defaultSupplierId = searchParams.get('supplierId') ?? undefined

  if (!can('purchase-order', 'create')) return <AccessDenied message="Vous n'avez pas les droits pour créer un bon de commande." />

  return <PurchaseOrderForm defaultSupplierId={defaultSupplierId} />
}
