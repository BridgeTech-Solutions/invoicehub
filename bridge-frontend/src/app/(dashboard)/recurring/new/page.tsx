'use client'

import { useSearchParams } from 'next/navigation'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { RecurringForm } from '@/features/recurring/components/RecurringForm'

export default function NewRecurringPage() {
  const { can } = usePermission()
  const searchParams    = useSearchParams()
  const defaultClientId = searchParams.get('clientId') ?? undefined

  if (!can('recurring', 'create')) return <AccessDenied message="Vous n'avez pas les droits pour créer un gabarit récurrent." />

  return <RecurringForm defaultClientId={defaultClientId} />
}
