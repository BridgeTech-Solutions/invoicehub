'use client'

import { useSearchParams } from 'next/navigation'
import { ProformaForm } from '@/features/proformas/components/ProformaForm'

export default function NewProformaPage() {
  const searchParams   = useSearchParams()
  const defaultClientId = searchParams.get('clientId') ?? undefined

  return <ProformaForm defaultClientId={defaultClientId} />
}
