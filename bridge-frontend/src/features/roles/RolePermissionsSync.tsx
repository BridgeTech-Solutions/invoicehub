'use client'

import { useCallback } from 'react'
import { useSocket } from '@/hooks/useSocket'
import { useAuthStore } from '@/features/auth/store'

/**
 * Écoute l'event Socket.io `role:permissions_updated` émis par le backend
 * quand un admin modifie les permissions d'un rôle.
 * Met à jour le store immédiatement sans nécessiter de re-login.
 */
export function RolePermissionsSync() {
  const setPermissions = useAuthStore((s) => s.setPermissions)

  const handleUpdate = useCallback(
    (data: { permissions: string[] }) => {
      setPermissions(data.permissions)
    },
    [setPermissions],
  )

  useSocket<{ permissions: string[] }>('role:permissions_updated', handleUpdate)

  return null
}
