'use client'

import { useSearchParams } from 'next/navigation'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { ProformaForm } from '@/features/proformas/components/ProformaForm'

export default function NewProformaPage() {
  const { can } = usePermission()
  const searchParams    = useSearchParams()
  const defaultClientId = searchParams.get('clientId') ?? undefined

  if (!can('proforma', 'create')) return <AccessDenied message="Vous n'avez pas les droits pour créer un devis." />

  return <ProformaForm defaultClientId={defaultClientId} />
}
