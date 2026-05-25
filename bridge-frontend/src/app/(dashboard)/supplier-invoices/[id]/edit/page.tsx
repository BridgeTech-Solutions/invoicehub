'use client'

import { use } from 'react'
import { useSupplierInvoice } from '@/features/supplier-invoices/hooks'
import { SupplierInvoiceForm } from '@/features/supplier-invoices/components/SupplierInvoiceForm'

export default function EditSupplierInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id }                        = use(params)
  const { data: si, isLoading }       = useSupplierInvoice(id)

  if (isLoading || !si) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 24, width: 240, background: 'var(--border)', borderRadius: 6 }} className="animate-pulse" />
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: '360px 1fr' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card animate-pulse" style={{ height: 200 }} />
            <div className="card animate-pulse" style={{ height: 220 }} />
            <div className="card animate-pulse" style={{ height: 180 }} />
          </div>
          <div className="card animate-pulse" style={{ height: 480 }} />
        </div>
      </div>
    )
  }

  return <SupplierInvoiceForm si={si} />
}
