'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore, useAuthHydrated } from '@/features/auth/store'
import { getMe } from '@/features/auth/api'
import { setPermissionsUpdater } from '@/lib/api-client'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardSocketSync } from '@/features/dashboard/components/DashboardSocketSync'
import { RolePermissionsSync } from '@/features/roles/RolePermissionsSync'
import { useInactivityLogout } from '@/hooks/useInactivityLogout'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { ShortcutsModal } from '@/components/ui/ShortcutsModal'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, accessToken, setPermissions, permissionsLoaded } = useAuthStore()
  const hydrated = useAuthHydrated()
  const router = useRouter()

  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const openHelp  = useCallback(() => setShortcutsOpen(true),  [])
  const closeHelp = useCallback(() => setShortcutsOpen(false), [])

  useInactivityLogout()
  useKeyboardShortcuts(openHelp)

  // Écoute l'événement DOM dispatché par la Sidebar (même pattern que shortcuts:open-search)
  useEffect(() => {
    const handler = () => openHelp()
    document.addEventListener('shortcuts:open-help', handler)
    return () => document.removeEventListener('shortcuts:open-help', handler)
  }, [openHelp])

  // Ne juger la session qu'APRÈS réhydratation du store : avant, `accessToken`
  // vaut toujours null, y compris quand une session valide existe en localStorage.
  useEffect(() => {
    if (hydrated && (!accessToken || !user)) {
      router.replace('/login')
    }
  }, [hydrated, accessToken, user, router])

  // Enregistre le callback pour que l'intercepteur axios mette à jour les permissions après refresh
  useEffect(() => {
    setPermissionsUpdater(setPermissions)
    return () => setPermissionsUpdater(() => {})
  }, [setPermissions])

  // Bootstrap permissions pour les sessions existantes (localStorage sans permissions)
  useEffect(() => {
    if (accessToken && user && (!user.permissions || user.permissions.length === 0)) {
      getMe().then(me => setPermissions(me.permissions)).catch(() => {})
    }
  }, [accessToken, user, setPermissions])

  // Hydratation en cours : on ne sait pas encore s'il y a une session. Ne rien
  // rendre plutôt qu'un écran vide définitif — la décision arrive au tick suivant.
  if (!hydrated) return null
  if (!accessToken || !user) return null

  // Skeleton pendant le bootstrap des permissions (sessions existantes sans permissions en cache)
  if (!permissionsLoaded) {
    return (
      <AppShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
          <div style={{ height: 32, width: 240, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {[1,2,3].map(i => <div key={i} className="card animate-pulse" style={{ height: 90 }} />)}
          </div>
          <div className="card animate-pulse" style={{ height: 320 }} />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      {/* Écoute dashboard:refresh sur toutes les pages, pas seulement /dashboard */}
      <DashboardSocketSync />
      <RolePermissionsSync />
      {children}
      {/* Modale d'aide aux raccourcis clavier (touche ?) */}
      <ShortcutsModal open={shortcutsOpen} onClose={closeHelp} />
    </AppShell>
  )
}
