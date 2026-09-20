'use client'

import { QueryProvider }   from './QueryProvider'
import { SocketProvider }  from './SocketProvider'
import { ToastProvider }   from './ToastProvider'
import { ConfirmProvider } from './ConfirmProvider'

/**
 * Providers — compose tous les providers globaux de l'app
 * Ordre : QueryProvider > SocketProvider > ToastProvider > ConfirmProvider > children
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SocketProvider>
        <ToastProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </SocketProvider>
    </QueryProvider>
  )
}
