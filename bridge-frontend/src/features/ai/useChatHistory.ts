'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage } from './types'

// ─── Types ────────────────────────────────────────────────────────────────

export interface Conversation {
  id:        string
  title:     string
  messages:  ChatMessage[]
  createdAt: number
  updatedAt: number
}

interface ChatHistoryStore {
  conversations:     Conversation[]
  activeId:          string | null
  createConversation: () => string
  setActive:          (id: string) => void
  updateMessages:     (id: string, messages: ChatMessage[]) => void
  setTitle:           (id: string, title: string) => void
  deleteConversation: (id: string) => void
  clearAll:           () => void
}

// ─── Store ────────────────────────────────────────────────────────────────

export const useChatHistory = create<ChatHistoryStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId:      null,

      createConversation: () => {
        const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        const conv: Conversation = {
          id,
          title:     'Nouvelle conversation',
          messages:  [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set(s => ({ conversations: [conv, ...s.conversations], activeId: id }))
        return id
      },

      setActive: (id) => set({ activeId: id }),

      updateMessages: (id, messages) =>
        set(s => ({
          conversations: s.conversations.map(c =>
            c.id === id
              ? { ...c, messages, updatedAt: Date.now() }
              : c
          ),
        })),

      setTitle: (id, title) =>
        set(s => ({
          conversations: s.conversations.map(c =>
            c.id === id ? { ...c, title } : c
          ),
        })),

      deleteConversation: (id) => {
        const { conversations, activeId, createConversation } = get()
        const remaining = conversations.filter(c => c.id !== id)
        set({ conversations: remaining })
        if (activeId === id) {
          if (remaining.length > 0) {
            set({ activeId: remaining[0]!.id })
          } else {
            createConversation()
          }
        }
      },

      clearAll: () => {
        set({ conversations: [], activeId: null })
        get().createConversation()
      },
    }),
    {
      name: 'bts-chat-history',
      // Limiter à 20 conversations en localStorage
      partialize: (s) => ({
        conversations: s.conversations.slice(0, 20),
        activeId:      s.activeId,
      }),
    },
  ),
)
