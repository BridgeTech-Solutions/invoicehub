import { apiClient } from '@/lib/api-client'
import type { ChatMessage } from './types'

export const aiApi = {
  /** Vérifie si BTS Assistant est disponible */
  getStatus: () =>
    apiClient.get<{ available: boolean; model: string }>('/ai/status').then(r => r.data),

  /**
   * Envoie un message et reçoit la réponse complète (non-streaming).
   * Utilisé comme fallback si SSE n'est pas supporté.
   */
  chat: (messages: ChatMessage[], context?: string) =>
    apiClient
      .post<{ reply: string }>('/ai/chat', { messages, context })
      .then(r => r.data.reply),

  /**
   * Envoie un message et stream la réponse token par token via SSE.
   * Appelle onToken pour chaque token reçu, onDone à la fin.
   */
  chatStream: async (
    messages: ChatMessage[],
    context: string | undefined,
    userName: string | undefined,
    userRole: string | undefined,
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    signal?: AbortSignal,
  ) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002/api'
    const token   = typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem('bts-auth') ?? '{}')?.state?.accessToken ?? ''
      : ''

    const res = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ messages, context, userName, userRole }),
      signal,
    })

    if (!res.ok || !res.body) {
      onError(`Erreur HTTP ${res.status}`)
      return
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text  = decoder.decode(value, { stream: true })
      const lines = text.split('\n').filter(l => l.startsWith('data: '))

      for (const line of lines) {
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') { onDone(); return }
        try {
          const chunk = JSON.parse(raw) as { token?: string; error?: string }
          if (chunk.error) { onError(chunk.error); return }
          if (chunk.token) onToken(chunk.token)
        } catch { /* ligne incomplète */ }
      }
    }
    onDone()
  },
}
