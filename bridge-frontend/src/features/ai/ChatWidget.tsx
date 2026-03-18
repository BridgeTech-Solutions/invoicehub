'use client'

import {
  useState, useRef, useEffect, useCallback, type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { ChatMessage } from './ChatMessage'
import { useChat } from './useChat'

// ─── Suggestions rapides ──────────────────────────────────────────────────

const QUICK_SUGGESTIONS = [
  'Factures impayées',
  'CA du mois',
  'Meilleurs clients',
  'Anomalies détectées',
  "C'est quoi une proforma ?",
]

// ─── Animations CSS (injectées une seule fois) ────────────────────────────

const ANIMATION_STYLES = `
@keyframes bts-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-4px); opacity: 1; }
}
@keyframes bts-cursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
@keyframes bts-slide-in {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes bts-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes bts-pulse-ring {
  0%   { transform: scale(1);    opacity: 0.6; }
  100% { transform: scale(1.55); opacity: 0; }
}
`

// ─── Composant principal ──────────────────────────────────────────────────

export function ChatWidget() {
  const pathname                = usePathname()
  const [open, setOpen]         = useState(false)
  const [input, setInput]       = useState('')
  const [hasNew, setHasNew]     = useState(false)
  const messagesEndRef          = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLTextAreaElement>(null)
  const styleInjected           = useRef(false)

  const { messages, isLoading, isStreaming, isAvailable, send, clear, stop } = useChat(pathname ?? undefined)

  // Injecter les animations CSS une seule fois
  useEffect(() => {
    if (styleInjected.current) return
    styleInjected.current = true
    const style = document.createElement('style')
    style.textContent = ANIMATION_STYLES
    document.head.appendChild(style)
  }, [])

  // Scroll en bas à chaque nouveau message
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open])

  // Focus input quand le panel s'ouvre
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120)
    }
  }, [open])

  // Badge "nouveau" quand le panel est fermé et qu'un message arrive
  useEffect(() => {
    if (!open && messages.length > 1) {
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant' && last.content.length > 0) {
        setHasNew(true)
      }
    }
  }, [messages, open])

  const handleOpen = useCallback(() => {
    setOpen(true)
    setHasNew(false)
  }, [])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading || isStreaming) return
    setInput('')
    await send(text)
  }, [input, isLoading, isStreaming, send])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend])

  const handleSuggestion = useCallback(async (s: string) => {
    setInput('')
    await send(s)
  }, [send])

  const isThinking = isLoading || isStreaming

  // Portal — monté sur document.body pour échapper à tout parent avec transform/overflow
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  return createPortal(
    <>
      {/* ── Panel ──────────────────────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-label="BTS Assistant"
          style={{
            position: 'fixed',
            bottom: 80,
            right: 20,
            width: 380,
            maxWidth: 'calc(100vw - 24px)',
            height: 560,
            maxHeight: 'calc(100vh - 100px)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 8px 40px rgba(15,25,35,0.18), 0 2px 8px rgba(15,25,35,0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9999,
            animation: 'bts-slide-in 0.2s ease-out',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px 12px',
            background: 'linear-gradient(135deg, #0c2340 0%, #0f2d4a 100%)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #2D7DD2, #1a5fa8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 800,
              color: '#fff',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(45,125,210,0.4)',
            }}>
              BTS
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                BTS Assistant
              </div>
              <div style={{ fontSize: 11, color: 'rgba(196,223,240,0.7)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isAvailable === false ? '#f43f5e' : isAvailable === true ? '#10b981' : '#d97706',
                  display: 'inline-block',
                }} />
                {isAvailable === null ? 'Connexion...' : isAvailable ? 'En ligne · Mistral 7B' : 'Hors ligne'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {/* Bouton effacer */}
              <button
                onClick={clear}
                title="Nouvelle conversation"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  borderRadius: 7,
                  color: 'rgba(196,223,240,0.8)',
                  cursor: 'pointer',
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
              >
                ↺
              </button>
              {/* Bouton fermer */}
              <button
                onClick={() => setOpen(false)}
                title="Fermer"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  borderRadius: 7,
                  color: 'rgba(196,223,240,0.8)',
                  cursor: 'pointer',
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
              >
                ×
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 14px 4px',
            display: 'flex',
            flexDirection: 'column',
            scrollBehavior: 'smooth',
          }}>
            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                message={msg}
                isStreaming={isStreaming && i === messages.length - 1}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions rapides — visible seulement au début */}
          {messages.length <= 1 && !isThinking && (
            <div style={{
              padding: '0 14px 10px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              animation: 'bts-fade-in 0.3s ease',
            }}>
              {QUICK_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => void handleSuggestion(s)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-2)',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--primary-light)'
                    e.currentTarget.style.borderColor = 'var(--primary)'
                    e.currentTarget.style.color = 'var(--primary)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--surface-2)'
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--text-2)'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Zone de saisie */}
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '10px 12px',
            background: 'var(--surface)',
            flexShrink: 0,
          }}>
            {isAvailable === false && (
              <div style={{
                padding: '6px 10px',
                borderRadius: 8,
                background: 'rgba(244,63,94,0.08)',
                border: '1px solid rgba(244,63,94,0.2)',
                color: '#f43f5e',
                fontSize: 11.5,
                marginBottom: 8,
                textAlign: 'center',
              }}>
                Ollama non disponible — vérifier l'installation
              </div>
            )}
            <div style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end',
              background: 'var(--surface-2)',
              border: '1.5px solid var(--border)',
              borderRadius: 12,
              padding: '8px 10px 8px 12px',
              transition: 'border-color 0.2s',
            }}
              onFocus={() => {}}
              onBlurCapture={() => {}}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Posez une question…"
                disabled={isThinking || isAvailable === false}
                rows={1}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontSize: 13,
                  color: 'var(--text-1)',
                  fontFamily: 'var(--font-body)',
                  lineHeight: 1.5,
                  maxHeight: 80,
                  overflowY: 'auto',
                  padding: 0,
                }}
                onInput={e => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = `${Math.min(el.scrollHeight, 80)}px`
                }}
              />
              {isThinking ? (
                <button
                  onClick={stop}
                  title="Arrêter"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(244,63,94,0.1)',
                    border: '1.5px solid rgba(244,63,94,0.3)',
                    color: '#f43f5e',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    flexShrink: 0,
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
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: input.trim() && isAvailable !== false ? '#2D7DD2' : 'var(--border)',
                    border: 'none',
                    color: input.trim() && isAvailable !== false ? '#fff' : 'var(--text-3)',
                    cursor: input.trim() && isAvailable !== false ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    flexShrink: 0,
                    transition: 'background 0.15s, transform 0.1s',
                  }}
                  onMouseEnter={e => { if (input.trim()) e.currentTarget.style.background = '#2169b8' }}
                  onMouseLeave={e => { if (input.trim()) e.currentTarget.style.background = '#2D7DD2' }}
                  onMouseDown={e => { if (input.trim()) e.currentTarget.style.transform = 'scale(0.93)' }}
                  onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                >
                  ↑
                </button>
              )}
            </div>
            <div style={{
              fontSize: 10.5,
              color: 'var(--text-3)',
              textAlign: 'center',
              marginTop: 6,
              opacity: 0.7,
            }}>
              Entrée pour envoyer · Maj+Entrée pour retour à la ligne
            </div>
          </div>
        </div>
      )}

      {/* ── Bouton flottant ────────────────────────────────────────────── */}
      <button
        onClick={handleOpen}
        title="BTS Assistant"
        aria-label="Ouvrir BTS Assistant"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: open
            ? '#0f2d4a'
            : 'linear-gradient(135deg, #0f2d4a 0%, #2D7DD2 100%)',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(45,125,210,0.4), 0 2px 6px rgba(15,25,35,0.2)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s, box-shadow 0.2s',
          transform: open ? 'scale(0.9)' : 'scale(1)',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.transform = 'scale(1.07)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.transform = 'scale(1)' }}
      >
        {/* Anneau pulse si Ollama disponible */}
        {isAvailable === true && !open && (
          <span style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'rgba(45,125,210,0.35)',
            animation: 'bts-pulse-ring 2s infinite',
          }} />
        )}

        {/* Icône */}
        <span style={{
          fontSize: 22,
          userSelect: 'none',
          transition: 'transform 0.2s',
          display: 'block',
        }}>
          {open ? '✕' : '✦'}
        </span>

        {/* Badge notification */}
        {hasNew && !open && (
          <span style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#f43f5e',
            border: '2px solid white',
          }} />
        )}
      </button>
    </>,
    document.body,
  )
}
