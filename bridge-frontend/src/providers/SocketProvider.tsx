'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '@/features/auth/store'

interface SocketContextValue {
  socket: Socket | null
  connected: boolean
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false })

export function useSocketContext() {
  return useContext(SocketContext)
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket,    setSocket]    = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)

  // Réagit aux changements de token (login → connect, logout → disconnect,
  // token refresh → reconnect avec le nouveau token).
  const accessToken = useAuthStore(state => state.accessToken)

  useEffect(() => {
    if (!accessToken) {
      // Déconnexion propre si pas de token (logout ou page publique)
      setSocket(prev => { prev?.disconnect(); return null })
      setConnected(false)
      return
    }

    const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3000'
    const sock = io(url, {
      auth:                { token: accessToken },
      transports:          ['websocket', 'polling'],
      reconnection:        true,
      reconnectionDelay:   1000,
      reconnectionAttempts: 10,
    })

    // useState → re-render → le socket se propage aux consumers via context
    setSocket(sock)
    sock.on('connect',    () => setConnected(true))
    sock.on('disconnect', () => setConnected(false))

    return () => {
      sock.disconnect()
      setSocket(null)
      setConnected(false)
    }
  }, [accessToken])

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  )
}
