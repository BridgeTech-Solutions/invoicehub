'use client'

import Link from 'next/link'
import { FileText, ArrowRight } from 'lucide-react'
import { useProformaCounts } from '@/features/proformas/hooks'
import { ROUTES } from '@/lib/constants'

// ─── Skeleton ─────────────────────────────────────────────────
function PipelineSkeleton() {
  return (
    <div className="card" style={{ padding: '18px 20px', height: 168 }}>
      <div style={{ height: 14, width: 160, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div style={{ height: 110, marginTop: 16, background: 'var(--border)', borderRadius: 8, opacity: 0.4 }} className="animate-pulse" />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
/**
 * ProformaPipeline — pipeline commercial des devis (proformas).
 * Devis en attente + taux de conversion devis → facture.
 */
export function ProformaPipeline() {
  const { data, isLoading } = useProformaCounts()
  if (isLoading) return <PipelineSkeleton />

  const c = data ?? {}
  const sent      = c['sent']      ?? 0
  const accepted  = c['accepted']  ?? 0
  const converted = c['converted'] ?? 0
  const rejected  = c['rejected']  ?? 0
  const expired   = c['expired']   ?? 0

  // Devis "émis" = tout ce qui a quitté le brouillon
  const issued       = sent + accepted + converted + rejected + expired
  const conversion   = issued > 0 ? Math.round((converted / issued) * 100) : 0
  const pending      = sent + accepted  // en attente de conversion

  const stats: { label: string; value: number; color: string }[] = [
    { label: 'En attente', value: pending,   color: 'var(--s-sent)' },
    { label: 'Convertis',  value: converted, color: 'var(--s-accepted)' },
    { label: 'Rejetés',    value: rejected + expired, color: 'var(--text-3)' },
  ]

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--s-sent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={15} style={{ color: 'var(--s-sent)' }} />
          </span>
          <h3 className="font-display" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>Devis / Proformas</h3>
        </div>
        <Link href={ROUTES.PROFORMAS} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
          Voir <ArrowRight size={12} />
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {stats.map((s) => (
          <div key={s.label}>
            <p className="amount" style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Conversion */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Taux de conversion</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--s-accepted)' }}>{conversion}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${conversion}%`, background: 'var(--s-accepted)', borderRadius: 3, transition: 'width 0.4s var(--ease-smooth)' }} />
        </div>
      </div>
    </div>
  )
}
