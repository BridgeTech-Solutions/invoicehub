'use client'

import { useSearchParams } from 'next/navigation'
import { RecurringForm } from '@/features/recurring/components/RecurringForm'

export default function NewRecurringPage() {
  const searchParams    = useSearchParams()
  const defaultClientId = searchParams.get('clientId') ?? undefined

  return <RecurringForm defaultClientId={defaultClientId} />
}
