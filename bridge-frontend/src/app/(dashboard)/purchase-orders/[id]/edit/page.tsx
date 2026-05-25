'use client'

import { use } from 'react'
import { usePurchaseOrder } from '@/features/purchase-orders/hooks'
import { PurchaseOrderForm } from '@/features/purchase-orders/components/PurchaseOrderForm'

export default function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }                        = use(params)
  const { data: po, isLoading }       = usePurchaseOrder(id)

  if (isLoading || !po) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 24, width: 240, background: 'var(--border)', borderRadius: 6 }} className="animate-pulse" />
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: '360px 1fr' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card animate-pulse" style={{ height: 280 }} />
            <div className="card animate-pulse" style={{ height: 160 }} />
          </div>
          <div className="card animate-pulse" style={{ height: 480 }} />
        </div>
      </div>
    )
  }

  return <PurchaseOrderForm po={po} />
}
