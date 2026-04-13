'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useRecurring } from '@/features/recurring/hooks'
import { RecurringForm } from '@/features/recurring/components/RecurringForm'
import { ROUTES } from '@/lib/constants'

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ height: 13, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div className="card" style={{ padding: 24, height: 280 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 6, opacity: 0.5 }} className="animate-pulse" />
      </div>
    </div>
  )
}

function EditRecurringView({ id }: { id: string }) {
  const { data: template, isLoading } = useRecurring(id)

  if (isLoading) return <Skeleton />

  if (!template) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Gabarit introuvable</p>
      <Link href={ROUTES.RECURRING} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
        Retour aux gabarits
      </Link>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link
        href={`${ROUTES.RECURRING}/${id}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}
      >
        <ChevronLeft size={14} /> Retour au gabarit
      </Link>
      <RecurringForm template={template} />
    </div>
  )
}

export default function EditRecurringPage() {
  const { id } = useParams<{ id: string }>()
  return <EditRecurringView id={id} />
}
