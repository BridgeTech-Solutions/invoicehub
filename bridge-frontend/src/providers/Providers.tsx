'use client'

import { QueryProvider }  from './QueryProvider'
import { SocketProvider } from './SocketProvider'
import { ToastProvider }  from './ToastProvider'

/**
 * Providers — compose tous les providers globaux de l'app
 * Ordre : QueryProvider > SocketProvider > ToastProvider > children
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SocketProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </SocketProvider>
    </QueryProvider>
  )
}
