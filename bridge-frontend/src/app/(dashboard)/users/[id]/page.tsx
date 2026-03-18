'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ROUTES } from '@/lib/constants'

// User detail is managed inline in the users table — redirect back
export default function UserDetailPage() {
  const router = useRouter()
  useEffect(() => { router.replace(ROUTES.USERS) }, [router])
  return null
}
