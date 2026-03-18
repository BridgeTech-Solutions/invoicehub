'use client'

import {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import {
  Trash2, Plus, MessageSquare, Sparkles,
  BarChart3, AlertTriangle, Users, ScanSearch, FileQuestion, FilePlus,
  type LucideIcon,
} from 'lucide-react'
import { ChatMessage } from '@/features/ai/ChatMessage'
import { useChat } from '@/features/ai/useChat'
import { useChatHistory } from '@/features/ai/useChatHistory'

// ─── Animations ────────────────────────────────────────────────────────────

const STYLES = `
@keyframes bts-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-4px); opacity: 1; }
}
@keyframes bts-cursor {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}
@keyframes bts-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
`

// ─── Suggestions initiales ─────────────────────────────────────────────────

interface Suggestion {
  icon:   LucideIcon
  color:  string
  bg:     string
  label:  string
  prompt: string
}

const SUGGESTIONS: Suggestion[] = [
  { icon: BarChart3,      color: '#2D7DD2', bg: 'rgba(45,125,210,0.1)',  label: 'CA du mois',          prompt: "Quel est notre chiffre d'affaires ce mois ?" },
  { icon: AlertTriangle,  color: '#dc2626', bg: 'rgba(220,38,38,0.08)',  label: 'Factures en retard',  prompt: 'Montre-moi les factures en retard' },
  { icon: Users,          color: '#10b981', bg: 'rgba(16,185,129,0.08)', label: 'Meilleurs clients',   prompt: 'Qui sont nos 5 meilleurs clients ?' },
  { icon: ScanSearch,     color: '#d97706', bg: 'rgba(217,119,6,0.08)',  label: 'Anomalies',           prompt: 'Y a-t-il des anomalies dans les données récentes ?' },
  { icon: FileQuestion,   color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', label: "C'est quoi un avoir", prompt: "C'est quoi une facture avoir ?" },
  { icon: FilePlus,       color: '#0891b2', bg: 'rgba(8,145,178,0.08)',  label: 'Créer une proforma',  prompt: 'Comment créer une proforma rapidement ?' },
]

// ─── Composant conversation sidebar item ──────────────────────────────────

function ConvItem({
  id, title, active, onSelect, onDelete,
}: {
  id: string; title: string; active: boolean
  onSelect: () => void; onDelete: (e: React.MouseEvent) => void
}) {
  const [hover, setHover] = useState(false)

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        background: active
          ? 'rgba(45,125,210,0.13)'
          : hover ? 'rgba(255,255,255,0.05)' : 'transparent',
        borderLeft: active ? '2px solid #2D7DD2' : '2px solid transparent',
        transition: 'all 0.15s',
      }}
    >
      <MessageSquare size={13} style={{ color: active ? '#2D7DD2' : 'rgba(196,223,240,0.5)', flexShrink: 0 }} />
      <span style={{
        flex: 1,
        fontSize: 12.5,
        color: active ? '#c4dff0' : 'rgba(196,223,240,0.65)',
        fontWeight: active ? 500 : 400,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {title}
      </span>
      {(hover || active) && (
        <button
          onClick={onDelete}
          title="Supprimer"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            borderRadius: 4,
            color: 'rgba(196,223,240,0.4)',
            display: 'flex',
            flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(196,223,240,0.4)')}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

// ─── Page principale ────────────────────────────────────────────────────────

export default function AssistantPage() {
  const pathname = usePathname()
  const {
    conversations, activeId,
    createConversation, setActive, updateMessages,
    setTitle, deleteConversation,
  } = useChatHistory()

  // Créer une conversation initiale si aucune n'existe
  useEffect(() => {
    if (conversations.length === 0) createConversation()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activeConv = conversations.find(c => c.id === activeId) ?? conversations[0]

  const { messages, isLoading, isStreaming, isAvailable, send, clear, stop, loadMessages } =
    useChat(pathname ?? undefined)

  const [input, setInput]   = useState('')
  const inputRef            = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef      = useRef<HTMLDivElement>(null)
  const styleInjected       = useRef(false)
  const titleSet            = useRef<Set<string>>(new Set())

  // Injecter les CSS d'animation
  useEffect(() => {
    if (styleInjected.current) return
    styleInjected.current = true
    const style = document.createElement('style')
    style.textContent = STYLES
    document.head.appendChild(style)
  }, [])

  // Synchroniser les messages dans l'historique
  useEffect(() => {
    if (activeConv?.id && messages.length > 1) {
      updateMessages(activeConv.id, messages)

      // Auto-nommer la conversation à partir du premier message utilisateur
      if (!titleSet.current.has(activeConv.id)) {
        const firstUser = messages.find(m => m.role === 'user')
        if (firstUser) {
          titleSet.current.add(activeConv.id)
          const title = firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? '…' : '')
          setTitle(activeConv.id, title)
        }
      }
    }
  }, [messages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll en bas à chaque nouveau message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleNew = useCallback(() => {
    createConversation()
    clear()
    setInput('')
    titleSet.current = new Set()
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [createConversation, clear])

  const handleSelectConv = useCallback((id: string) => {
    setActive(id)
    const conv = conversations.find(c => c.id === id)
    if (conv && conv.messages.length > 0) {
      loadMessages(conv.messages)
    } else {
      clear()
    }
    setInput('')
  }, [setActive, conversations, loadMessages, clear])

  const handleDeleteConv = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteConversation(id)
    if (id === activeConv?.id) { clear(); setInput('') }
  }, [deleteConversation, activeConv, clear])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading || isStreaming) return
    setInput('')
    await send(text)
  }, [input, isLoading, isStreaming, send])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
  }, [handleSend])

  const isThinking  = isLoading || isStreaming
  const isEmpty     = messages.length <= 1  // seulement le message de bienvenue

  // Grouper les conversations par date
  const today     = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  const grouped   = conversations.reduce<{ today: typeof conversations; yesterday: typeof conversations; older: typeof conversations }>(
    (acc, c) => {
      const d = new Date(c.updatedAt).toDateString()
      if (d === today)     acc.today.push(c)
      else if (d === yesterday) acc.yesterday.push(c)
      else                 acc.older.push(c)
      return acc
    },
    { today: [], yesterday: [], older: [] },
  )

  return (
    <div style={{
      display: 'flex',
      height: `calc(100vh - var(--topbar-h) - clamp(12px, 2.5vw, 24px) * 2)`,
      gap: 0,
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid var(--border)',
      boxShadow: '0 2px 12px rgba(15,25,35,0.06)',
    }}>

      {/* ── Sidebar conversations ────────────────────────────────────────── */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        background: 'linear-gradient(180deg, #0c2340 0%, #0f2d4a 100%)',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.07)',
      }}>
        {/* Header sidebar */}
        <div style={{ padding: '16px 12px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #2D7DD2, #1a5fa8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: '#fff',
              boxShadow: '0 2px 6px rgba(45,125,210,0.35)',
            }}>BTS</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>BTS Assistant</div>
              <div style={{ fontSize: 10, color: 'rgba(196,223,240,0.5)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', display: 'inline-block',
                  background: isAvailable === true ? '#10b981' : isAvailable === false ? '#f43f5e' : '#d97706',
                }} />
                {isAvailable === null ? 'Connexion…' : isAvailable ? 'Mistral 7B' : 'Hors ligne'}
              </div>
            </div>
          </div>

          {/* Bouton Nouvelle conversation */}
          <button
            onClick={handleNew}
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 8,
              background: 'rgba(45,125,210,0.18)',
              border: '1px solid rgba(45,125,210,0.35)',
              color: '#c4dff0',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(45,125,210,0.28)'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(45,125,210,0.18)'
              e.currentTarget.style.color = '#c4dff0'
            }}
          >
            <Plus size={14} />
            Nouvelle conversation
          </button>
        </div>

        {/* Liste des conversations */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
          {[
            { label: "Aujourd'hui", items: grouped.today },
            { label: 'Hier',        items: grouped.yesterday },
            { label: 'Plus ancien', items: grouped.older },
          ].map(({ label, items }) =>
            items.length === 0 ? null : (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
                  color: 'rgba(196,223,240,0.35)', textTransform: 'uppercase',
                  padding: '4px 10px 2px',
                }}>
                  {label}
                </div>
                {items.map(conv => (
                  <ConvItem
                    key={conv.id}
                    id={conv.id}
                    title={conv.title}
                    active={conv.id === activeConv?.id}
                    onSelect={() => handleSelectConv(conv.id)}
                    onDelete={(e) => handleDeleteConv(e, conv.id)}
                  />
                ))}
              </div>
            )
          )}
          {conversations.length === 0 && (
            <p style={{ fontSize: 12, color: 'rgba(196,223,240,0.3)', textAlign: 'center', marginTop: 24 }}>
              Aucune conversation
            </p>
          )}
        </div>
      </aside>

      {/* ── Zone de chat ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)', minWidth: 0 }}>

        {/* Header chat */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--surface)',
          flexShrink: 0,
        }}>
          <Sparkles size={16} style={{ color: '#2D7DD2' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
              {activeConv?.title ?? 'BTS Assistant'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              IA locale — données InvoiceHub BTS uniquement
            </div>
          </div>
          {isThinking && (
            <button
              onClick={stop}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                background: 'rgba(244,63,94,0.08)',
                border: '1px solid rgba(244,63,94,0.25)',
                color: '#f43f5e',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Arrêter ■
            </button>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 8px' }}>

          {/* État vide — suggestions */}
          {isEmpty && (
            <div style={{ animation: 'bts-fade-up 0.3s ease' }}>
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', margin: '0 auto 12px',
                  background: 'linear-gradient(135deg, #0f2d4a, #2D7DD2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22,
                }}>
                  ✦
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 6px' }}>
                  Bonjour, comment puis-je vous aider ?
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
                  Posez une question sur vos factures, clients, paiements ou sur InvoiceHub
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 10,
                maxWidth: 640,
                margin: '0 auto',
              }}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s.label}
                    onClick={() => void send(s.prompt)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = s.bg
                      e.currentTarget.style.borderColor = s.color
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'var(--surface-2)'
                      e.currentTarget.style.borderColor = 'var(--border)'
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: s.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 8,
                    }}>
                      <s.icon size={16} style={{ color: s.color }} />
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>
                      {s.prompt.length > 42 ? s.prompt.slice(0, 42) + '…' : s.prompt}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {!isEmpty && messages.map((msg, i) => (
            <ChatMessage
              key={i}
              message={msg}
              isStreaming={isStreaming && i === messages.length - 1}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Zone de saisie */}
        <div style={{
          padding: '12px 20px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
        }}>
          {isAvailable === false && (
            <div style={{
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(244,63,94,0.07)',
              border: '1px solid rgba(244,63,94,0.2)',
              color: '#f43f5e',
              fontSize: 12,
              marginBottom: 10,
              textAlign: 'center',
            }}>
              Ollama non disponible — vérifier l'installation (OLLAMA_ENABLED=true dans .env)
            </div>
          )}

          <div style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-end',
            background: 'var(--surface-2)',
            border: '1.5px solid var(--border)',
            borderRadius: 14,
            padding: '10px 12px 10px 16px',
            transition: 'border-color 0.2s',
            maxWidth: 840,
            margin: '0 auto',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez une question à BTS Assistant…"
              disabled={isThinking || isAvailable === false}
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontSize: 14,
                color: 'var(--text-1)',
                fontFamily: 'var(--font-body)',
                lineHeight: 1.5,
                maxHeight: 120,
                overflowY: 'auto',
                padding: 0,
              }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`
              }}
            />

            {isThinking ? (
              <button
                onClick={stop}
                title="Arrêter la génération"
                style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: 'rgba(244,63,94,0.1)',
                  border: '1.5px solid rgba(244,63,94,0.3)',
                  color: '#f43f5e',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, flexShrink: 0,
                }}
              >
                ■
              </button>
            ) : (
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || isAvailable === false}
                title="Envoyer (Entrée)"
                style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: input.trim() && isAvailable !== false ? '#2D7DD2' : 'var(--border)',
                  border: 'none',
                  color: input.trim() && isAvailable !== false ? '#fff' : 'var(--text-3)',
                  cursor: input.trim() && isAvailable !== false ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                  transition: 'background 0.15s, transform 0.1s',
                }}
                onMouseEnter={e => { if (input.trim()) e.currentTarget.style.background = '#2169b8' }}
                onMouseLeave={e => { if (input.trim()) e.currentTarget.style.background = '#2D7DD2' }}
                onMouseDown={e => { if (input.trim()) e.currentTarget.style.transform = 'scale(0.92)' }}
                onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                ↑
              </button>
            )}
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', margin: '8px 0 0', opacity: 0.6 }}>
            Entrée pour envoyer · Maj+Entrée pour retour à la ligne · IA locale — données BTS uniquement
          </p>
        </div>
      </div>
    </div>
  )
}
