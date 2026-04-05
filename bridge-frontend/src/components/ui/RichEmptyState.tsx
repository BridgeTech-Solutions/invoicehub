'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

interface Cta {
  label: string
  href?: string
  onClick?: () => void
}

interface RichEmptyStateProps {
  /** Icône Lucide principale */
  icon: LucideIcon
  /** Titre principal */
  title: string
  /** Description courte */
  description: string
  /** Chips de fonctionnalités (optionnel) */
  features?: string[]
  /** CTA principal */
  cta?: Cta
  /** CTA secondaire (optionnel) */
  secondaryCta?: Cta
  /** Variante compacte pour les onglets filtrés */
  compact?: boolean
}

export function RichEmptyState({
  icon: Icon,
  title,
  description,
  features,
  cta,
  secondaryCta,
  compact = false,
}: RichEmptyStateProps) {
  if (compact) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <Icon size={28} aria-hidden="true" style={{ color: 'var(--text-3)', margin: '0 auto 10px', display: 'block' }} />
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 4px', fontWeight: 600 }}>{title}</p>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>{description}</p>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '56px 32px 48px',
      textAlign: 'center',
      maxWidth: 520,
      margin: '0 auto',
    }}>
      {/* Icône dans un cercle coloré avec halo */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <div style={{
          position: 'absolute', inset: -8,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(45,125,210,0.08) 0%, transparent 70%)',
        }} aria-hidden="true" />
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(45,125,210,0.12) 0%, rgba(45,125,210,0.06) 100%)',
          border: '1.5px solid rgba(45,125,210,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <Icon size={26} aria-hidden="true" style={{ color: 'var(--primary)' }} />
        </div>
      </div>

      {/* Titre */}
      <h3 style={{
        fontSize: 16,
        fontWeight: 700,
        color: 'var(--text-1)',
        fontFamily: 'var(--font-display)',
        margin: '0 0 8px',
        letterSpacing: '-0.01em',
      }}>
        {title}
      </h3>

      {/* Description */}
      <p style={{
        fontSize: 13.5,
        color: 'var(--text-3)',
        margin: '0 0 20px',
        lineHeight: 1.6,
        maxWidth: 360,
      }}>
        {description}
      </p>

      {/* Feature chips */}
      {features && features.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          justifyContent: 'center', marginBottom: 24,
        }}>
          {features.map((f) => (
            <span
              key={f}
              style={{
                fontSize: 11.5,
                padding: '3px 10px',
                borderRadius: 100,
                background: 'rgba(45,125,210,0.07)',
                border: '1px solid rgba(45,125,210,0.15)',
                color: 'var(--primary)',
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
              }}
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {cta && (
          cta.href
            ? (
              <Link
                href={cta.href}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', minHeight: 44,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--primary)', color: '#fff',
                  fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '0 4px 12px rgba(45,125,210,0.25)',
                  transition: 'opacity 0.15s',
                }}
              >
                {cta.label}
              </Link>
            )
            : (
              <button
                type="button"
                onClick={cta.onClick}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', minHeight: 44,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--primary)', color: '#fff', border: 'none',
                  fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(45,125,210,0.25)',
                }}
              >
                {cta.label}
              </button>
            )
        )}
        {secondaryCta && (
          secondaryCta.href
            ? (
              <Link
                href={secondaryCta.href}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', minHeight: 44,
                  borderRadius: 'var(--radius-md)',
                  background: 'transparent', color: 'var(--text-2)',
                  fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500,
                  textDecoration: 'none',
                  border: '1.5px solid var(--border)',
                }}
              >
                {secondaryCta.label}
              </Link>
            )
            : (
              <button
                type="button"
                onClick={secondaryCta.onClick}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', minHeight: 44,
                  borderRadius: 'var(--radius-md)',
                  background: 'transparent', color: 'var(--text-2)', border: '1.5px solid var(--border)',
                  fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {secondaryCta.label}
              </button>
            )
        )}
      </div>
    </div>
  )
}
