import { useEffect } from 'react'
import { useSocketContext } from '@/providers/SocketProvider'

/**
 * useSocket — s'abonne à un événement Socket.io
 *
 * @example
 * useSocket('notification:new', (data) => { ... })
 */
export function useSocket<T = unknown>(
  event: string,
  handler: (data: T) => void,
) {
  const { socket } = useSocketContext()

  useEffect(() => {
    if (!socket) return
    socket.on(event, handler)
    return () => { socket.off(event, handler) }
  }, [socket, event, handler])
}

/** Expose le socket et l'état de connexion */
export function useSocketStatus() {
  const { socket, connected } = useSocketContext()
  return { socket, connected }
}
