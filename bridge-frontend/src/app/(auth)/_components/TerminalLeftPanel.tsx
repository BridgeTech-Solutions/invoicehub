'use client'

import { useState, useEffect } from 'react'
import { CompanyLogo } from '@/components/ui/CompanyLogo'

// ─── Flux de données système ────────────────────────────────────
const LOG_LINES = [
  { t: 'SYS',  c: '#00FF88', msg: 'InvoiceHub v2.0 — démarrage système' },
  { t: 'AUTH', c: '#00BFFF', msg: 'Authentification · JWT RS256 + 2FA TOTP' },
  { t: 'DB',   c: '#FFB800', msg: 'PostgreSQL 15 · SYSCOHADA · uuid-ossp' },
  { t: 'MOD',  c: '#00BFFF', msg: 'Facturation · Proformas · Paiements' },
  { t: 'MOD',  c: '#00BFFF', msg: 'Stock · Mouvements · CMUP automatique' },
  { t: 'MOD',  c: '#00BFFF', msg: 'Achats · Bons de commande · Réceptions' },
  { t: 'MOD',  c: '#00BFFF', msg: 'Clients · Fournisseurs · Contrats' },
  { t: 'WRK',  c: '#FF6B6B', msg: 'Workflow approbation · 3 niveaux' },
  { t: 'BNK',  c: '#A78BFA', msg: 'Banque · Rapprochements · Règles matching' },
  { t: 'ACC',  c: '#A78BFA', msg: 'Comptabilité · SYSCOHADA · Export Sage' },
  { t: 'AUD',  c: '#FFB800', msg: 'Audit logs · immuables · 5 902 entrées' },
  { t: 'JOB',  c: '#00FF88', msg: 'BullMQ · 5 queues · relances automatiques' },
  { t: 'KPI',  c: '#00BFFF', msg: 'Dashboard · Redis cache 5 min · Recharts' },
  { t: 'NTF',  c: '#00FF88', msg: 'Notifications · Socket.io temps réel' },
  { t: 'SEC',  c: '#FF6B6B', msg: 'RBAC · admin > commercial > employé' },
  { t: 'SYS',  c: '#00FF88', msg: 'Tous modules opérationnels ✓' },
  { t: 'AUTH', c: '#00BFFF', msg: "En attente d'authentification..." },
]

function TerminalLog({ line, delay }: { line: typeof LOG_LINES[0]; delay: number }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease',
      fontFamily: 'var(--t-mono)', fontSize: 11.5, lineHeight: 1.65,
    }}>
      <span style={{ color: 'rgba(255,255,255,0.18)', flexShrink: 0, fontSize: 10.5, minWidth: 38, textAlign: 'right' }}>
        {(delay).toString().padStart(4,'0')}ms
      </span>
      <span style={{
        color: line.c, flexShrink: 0, fontSize: 10, fontWeight: 700,
        letterSpacing: '0.08em', background: `${line.c}14`,
        padding: '1px 6px', borderRadius: 3, border: `1px solid ${line.c}28`,
        minWidth: 38, textAlign: 'center',
      }}>
        {line.t}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.42)', wordBreak: 'break-word', flex: 1 }}>
        {line.msg}
      </span>
    </div>
  )
}

// ─── Panneau gauche terminal ────────────────────────────────────
export function TerminalLeftPanel() {
  const [cursor, setCursor] = useState(true)

  useEffect(() => {
    const t = setInterval(() => setCursor(c => !c), 530)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="t-left-panel" style={{
      background: 'var(--t-panel)',
      borderRight: '1px solid rgba(0,191,255,0.09)',
      display: 'flex', flexDirection: 'column',
      padding: '36px 40px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Grid pattern */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(rgba(0,191,255,0.025) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }} />
      {/* Radial glow */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
        background: 'radial-gradient(ellipse at 30% 100%, rgba(0,191,255,0.04) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Barre de titre style terminal macOS */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 32, position: 'relative', zIndex: 1,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map(c => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.65 }} />
          ))}
        </div>
        <span style={{ fontSize: 10.5, color: 'rgba(0,191,255,0.38)', letterSpacing: '0.09em', fontFamily: 'var(--t-mono)' }}>
          BTS ENTERPRISE PLATFORM — v2.0.0
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', background: '#00FF88',
            animation: 'live-pulse 2.2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 9.5, color: 'rgba(0,255,136,0.55)', letterSpacing: '0.08em', fontFamily: 'var(--t-mono)' }}>LIVE</span>
        </div>
      </div>

      {/* Titre principal */}
      <div style={{ marginBottom: 28, position: 'relative', zIndex: 1 }}>
        <p style={{
          fontFamily: 'var(--t-brico)', fontWeight: 800,
          fontSize: 'clamp(26px, 2.8vw, 40px)',
          color: '#E8F4FF', lineHeight: 1.1,
          letterSpacing: '-0.025em', margin: '0 0 10px',
        }}>
          Bridge Technologies<br />
          <span style={{ color: 'var(--t-electric)', animation: 'glow-pulse 3s ease-in-out infinite' }}>
            Solutions
          </span>
        </p>
        <p style={{
          fontSize: 11, color: 'rgba(255,255,255,0.22)',
          margin: 0, letterSpacing: '0.07em',
          fontFamily: 'var(--t-mono)',
        }}>
          PLATEFORME DE GESTION · DOUALA, CAMEROUN · SYSCOHADA
        </p>
      </div>

      {/* Stream de logs */}
      <div style={{
        flex: 1, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 5,
        position: 'relative', zIndex: 1,
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 7%, black 87%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 7%, black 87%, transparent 100%)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {LOG_LINES.map((line, i) => (
            <TerminalLog key={i} line={line} delay={i * 110} />
          ))}
          {/* Curseur clignotant */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, fontFamily: 'var(--t-mono)', fontSize: 11.5 }}>
            <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 10.5, minWidth: 38, textAlign: 'right' }}>
              {(LOG_LINES.length * 110).toString()}ms
            </span>
            <span style={{
              color: 'var(--t-green)', fontSize: 10, fontWeight: 700,
              padding: '1px 6px', background: 'rgba(0,255,136,0.1)',
              borderRadius: 3, border: '1px solid rgba(0,255,136,0.2)',
              minWidth: 38, textAlign: 'center',
            }}>SYS</span>
            <span style={{ color: 'rgba(0,191,255,0.5)' }}>
              $ <span style={{ opacity: cursor ? 1 : 0, color: 'var(--t-electric)' }}>█</span>
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        paddingTop: 18, borderTop: '1px solid rgba(0,191,255,0.07)',
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <CompanyLogo variant="white" height={22} alt="" public style={{ opacity: 0.22 }} />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.07em', fontFamily: 'var(--t-mono)' }}>
          © 2026 BRIDGE TECHNOLOGIES SOLUTIONS
        </span>
      </div>
    </div>
  )
}
