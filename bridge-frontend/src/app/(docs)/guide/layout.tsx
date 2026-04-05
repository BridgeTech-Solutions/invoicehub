'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { ROUTES } from '@/lib/constants'

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f5f7fa)' }}>

      {/* ── Docs header ─────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border, #e2e8f0)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px', height: 52,
        boxShadow: '0 1px 3px rgba(15,45,74,0.06)',
      }}>

        {/* Left : logo + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Image
            src="/logos/logo-bts-blue.png"
            alt="Bridge Technologies Solutions"
            width={80}
            height={28}
            style={{ objectFit: 'contain', flexShrink: 0 }}
            priority
          />
          <div style={{
            width: 1, height: 20, background: 'var(--border, #e2e8f0)', flexShrink: 0,
          }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontSize: 13.5, fontWeight: 700, color: '#0f2d4a',
              fontFamily: 'var(--font-display, Inter, sans-serif)',
              letterSpacing: '-0.01em',
            }}>
              Guide utilisateur
            </span>
            <span style={{
              fontSize: 11.5, color: 'var(--text-3, #94a3b8)',
              fontFamily: 'var(--font-body, Inter, sans-serif)',
            }}>
              InvoiceHub v2.0
            </span>
          </div>
        </div>

        {/* Right : back to app */}
        <Link
          href={ROUTES.DASHBOARD}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 500,
            color: 'var(--text-2, #475569)',
            textDecoration: 'none',
            padding: '7px 14px',
            border: '1.5px solid var(--border, #e2e8f0)',
            borderRadius: 8,
            background: 'var(--surface, #fff)',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--primary, #2D7DD2)'
            e.currentTarget.style.color = 'var(--primary, #2D7DD2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border, #e2e8f0)'
            e.currentTarget.style.color = 'var(--text-2, #475569)'
          }}
        >
          <ArrowLeft size={13} aria-hidden />
          Retour à l'application
        </Link>
      </header>

      {/* ── Page content ────────────────────────────────────────── */}
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {children}
      </div>

    </div>
  )
}
