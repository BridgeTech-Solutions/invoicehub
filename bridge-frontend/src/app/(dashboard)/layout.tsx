'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/features/auth/store'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardSocketSync } from '@/features/dashboard/components/DashboardSocketSync'
import { useInactivityLogout } from '@/hooks/useInactivityLogout'
import { ChatWidget } from '@/features/ai/ChatWidget'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, accessToken } = useAuthStore()
  const router = useRouter()

  useInactivityLogout()

  useEffect(() => {
    if (!accessToken || !user) {
      router.replace('/login')
    }
  }, [accessToken, user, router])

  if (!accessToken || !user) return null

  return (
    <AppShell>
      {/* Écoute dashboard:refresh sur toutes les pages, pas seulement /dashboard */}
      <DashboardSocketSync />
      {children}
      {/* BTS Assistant — widget flottant accessible sur toutes les pages */}
      <ChatWidget />
    </AppShell>
  )
}
