'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { ChatMessage as ChatMessageType } from './types'

interface Props {
  message:     ChatMessageType
  isStreaming?: boolean
}

// ─── Markdown simple ──────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(45,125,210,0.12);padding:1px 5px;border-radius:3px;font-size:12px;font-family:monospace">$1</code>')
    .replace(/^[•\-] (.+)$/gm, '<li style="margin-left:12px;list-style-type:disc">$1</li>')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>(\s*<li[^>]*>[\s\S]*?<\/li>)*)/g, '<ul style="margin:4px 0;padding-left:4px">$1</ul>')
    .replace(/\n/g, '<br/>')
}

// ─── Détection de références de documents ────────────────────────────────

interface DocRef {
  type:   'invoice' | 'proforma'
  number: string  // ex: FAC001, PFM003
  href:   string  // lien vers la liste filtrée
}

const FAC_REGEX = /(?:BTS\/[A-Z]+\/\d{4}\/\d{2}\/)?(FAC\d+)/gi
const PFM_REGEX = /(?:BTS\/[A-Z]+\/\d{4}\/\d{2}\/)?(PFM\d+)/gi
const AVO_REGEX = /(?:BTS\/[A-Z]+\/\d{4}\/\d{2}\/)?(AVO\d+)/gi

function extractDocRefs(text: string): DocRef[] {
  const refs: DocRef[] = []
  const seen = new Set<string>()

  for (const regex of [FAC_REGEX, AVO_REGEX]) {
    regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      const num = m[1]!.toUpperCase()
      if (!seen.has(num)) {
        seen.add(num)
        refs.push({ type: 'invoice', number: num, href: `/invoices?q=${num}` })
      }
    }
  }

  PFM_REGEX.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PFM_REGEX.exec(text)) !== null) {
    const num = m[1]!.toUpperCase()
    if (!seen.has(num)) {
      seen.add(num)
      refs.push({ type: 'proforma', number: num, href: `/proformas?q=${num}` })
    }
  }

  return refs.slice(0, 4) // max 4 boutons
}

// ─── Composant ────────────────────────────────────────────────────────────

export function ChatMessage({ message, isStreaming }: Props) {
  const isUser = message.role === 'user'
  const ref    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isStreaming && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [message.content, isStreaming])

  if (isUser) {
    return (
      <div ref={ref} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{
          maxWidth: '82%',
          background: '#2D7DD2',
          color: '#fff',
          borderRadius: '16px 16px 4px 16px',
          padding: '8px 13px',
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: 'var(--font-body)',
          boxShadow: '0 1px 3px rgba(45,125,210,0.25)',
          wordBreak: 'break-word',
        }}>
          {message.content}
        </div>
      </div>
    )
  }

  // Détection de références (seulement quand le streaming est terminé)
  const docRefs = !isStreaming && message.content
    ? extractDocRefs(message.content)
    : []

  return (
    <div ref={ref} style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start' }}>
      {/* Avatar BTS */}
      <div style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #0f2d4a 0%, #2D7DD2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: 11,
        fontWeight: 700,
        color: '#fff',
        marginTop: 2,
      }}>
        BTS
      </div>

      <div style={{ maxWidth: '88%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Bulle de message */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '4px 16px 16px 16px',
          padding: '8px 13px',
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--text-1)',
          fontFamily: 'var(--font-body)',
          wordBreak: 'break-word',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          {message.content === '' && isStreaming ? (
            /* Indicateur de frappe */
            <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', height: 18 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#2D7DD2',
                  animation: 'bts-bounce 1.2s infinite',
                  animationDelay: `${i * 0.2}s`,
                  opacity: 0.7,
                }} />
              ))}
            </span>
          ) : (
            <span dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
          )}
          {isStreaming && message.content !== '' && (
            <span style={{
              display: 'inline-block',
              width: 2,
              height: 13,
              background: '#2D7DD2',
              marginLeft: 2,
              borderRadius: 1,
              animation: 'bts-cursor 0.8s infinite',
              verticalAlign: 'middle',
            }} />
          )}
        </div>

        {/* Boutons d'action inline — références de documents détectées */}
        {docRefs.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 2 }}>
            {docRefs.map(ref => (
              <Link
                key={ref.number}
                href={ref.href}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: ref.type === 'invoice'
                    ? 'rgba(45,125,210,0.08)'
                    : 'rgba(8,145,178,0.08)',
                  border: `1px solid ${ref.type === 'invoice' ? 'rgba(45,125,210,0.25)' : 'rgba(8,145,178,0.25)'}`,
                  color: ref.type === 'invoice' ? '#2D7DD2' : '#0891b2',
                  fontSize: 11.5,
                  fontWeight: 500,
                  textDecoration: 'none',
                  transition: 'all 0.15s',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget
                  el.style.background = ref.type === 'invoice'
                    ? 'rgba(45,125,210,0.15)'
                    : 'rgba(8,145,178,0.15)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget
                  el.style.background = ref.type === 'invoice'
                    ? 'rgba(45,125,210,0.08)'
                    : 'rgba(8,145,178,0.08)'
                }}
              >
                <ExternalLink size={11} />
                {ref.number}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
