'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { aiApi } from './api'
import type { ChatMessage, ChatState } from './types'

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: 'Bonjour ! Je suis **BTS Assistant**. Posez-moi une question sur vos factures, clients, proformas, paiements ou sur le fonctionnement d\'InvoiceHub.',
}

export function useChat(context?: string) {
  const [state, setState] = useState<ChatState>({
    messages:    [WELCOME_MESSAGE],
    isLoading:   false,
    isStreaming:  false,
    isAvailable:  null,
    error:        null,
  })

  const abortRef  = useRef<AbortController | null>(null)
  // Ref pour éviter la closure stale sur messages dans send()
  const stateRef  = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  // Vérifier la disponibilité d'Ollama au montage
  useEffect(() => {
    aiApi.getStatus()
      .then(({ available }) => setState(s => ({ ...s, isAvailable: available })))
      .catch(() => setState(s => ({ ...s, isAvailable: false })))
  }, [])

  const send = useCallback(async (content: string) => {
    const { isLoading, isStreaming, messages } = stateRef.current
    if (!content.trim() || isLoading || isStreaming) return

    const userMessage: ChatMessage = { role: 'user', content: content.trim() }
    const updatedMessages = [...messages, userMessage]

    // Ajouter le message utilisateur + placeholder assistant vide
    setState(s => ({
      ...s,
      messages:   [...updatedMessages, { role: 'assistant', content: '' }],
      isLoading:  true,
      isStreaming: false,
      error:       null,
    }))

    abortRef.current = new AbortController()

    // Utiliser le streaming SSE
    let started = false

    await aiApi.chatStream(
      updatedMessages,
      context,
      // onToken — chaque token reçu est ajouté à la dernière bulle assistant
      (token) => {
        if (!started) {
          started = true
          setState(s => ({ ...s, isLoading: false, isStreaming: true }))
        }
        setState(s => {
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]!
          msgs[msgs.length - 1] = { ...last, content: last.content + token }
          return { ...s, messages: msgs }
        })
      },
      // onDone
      () => {
        setState(s => ({ ...s, isLoading: false, isStreaming: false }))
      },
      // onError
      (err) => {
        setState(s => {
          const msgs = [...s.messages]
          msgs[msgs.length - 1] = {
            role: 'assistant',
            content: `Désolé, une erreur s'est produite : ${err}`,
          }
          return { ...s, messages: msgs, isLoading: false, isStreaming: false, error: err }
        })
      },
      abortRef.current.signal,
    )
  }, [context])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setState(s => ({
      messages:    [WELCOME_MESSAGE],
      isLoading:   false,
      isStreaming:  false,
      isAvailable:  s.isAvailable,
      error:        null,
    }))
  }, [])

  /** Charge des messages existants (ex: restauration d'une conversation) */
  const loadMessages = useCallback((messages: ChatMessage[]) => {
    abortRef.current?.abort()
    setState(s => ({
      ...s,
      messages:   messages.length > 0 ? messages : [WELCOME_MESSAGE],
      isLoading:  false,
      isStreaming: false,
      error:       null,
    }))
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setState(s => ({ ...s, isLoading: false, isStreaming: false }))
  }, [])

  return { ...state, send, clear, stop, loadMessages }
}
