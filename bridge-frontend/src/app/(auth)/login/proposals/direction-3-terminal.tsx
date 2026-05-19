'use client'

/**
 * DIRECTION 3 — "TERMINAL BTS"
 * Command center sombre. Aesthetic Bloomberg Terminal × Palantir.
 * La plateforme est un outil de pouvoir — l'interface doit le refléter.
 * Panneau gauche : flux de données défilant (modules, events, statuts en temps réel simulé).
 * Font    : JetBrains Mono (mono technique) + Bricolage Grotesque (display puissant)
 * Palette : Quasi-noir #070B11 + Bleu électrique #00BFFF + Vert terminal #00FF88 + Ambre #FFB800
 */

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, ChevronRight } from 'lucide-react'
import { useLogin } from '@/features/auth/hooks'
import { ROUTES } from '@/lib/constants'
import type { AxiosError } from 'axios'

// ─── Flux de données simulé ─────────────────────────────────────
const LOG_LINES = [
  { t: 'SYS',  c: '#00FF88', msg: 'InvoiceHub v2.0 — démarrage système' },
  { t: 'AUTH', c: '#00BFFF', msg: 'Module authentification · JWT + 2FA TOTP' },
  { t: 'DB',   c: '#FFB800', msg: 'PostgreSQL 15 · 14 tables · SYSCOHADA' },
  { t: 'MOD',  c: '#00BFFF', msg: 'Facturation · Proformas · Paiements' },
  { t: 'MOD',  c: '#00BFFF', msg: 'Stock · Mouvements · CMUP automatique' },
  { t: 'MOD',  c: '#00BFFF', msg: 'Achats · Bons de commande · Réceptions' },
  { t: 'MOD',  c: '#00BFFF', msg: 'Clients · Fournisseurs · Contrats' },
  { t: 'WRK',  c: '#FF6B6B', msg: 'Workflow approbation · 3 niveaux' },
  { t: 'AUD',  c: '#FFB800', msg: 'Audit logs · immuables · 5,902 entrées' },
  { t: 'JOB',  c: '#00FF88', msg: 'BullMQ · 5 queues · relances automatiques' },
  { t: 'KPI',  c: '#00BFFF', msg: 'Dashboard · Redis cache 5min · Recharts' },
  { t: 'PDF',  c: '#A78BFA', msg: 'Génération PDF · entête/pied de page BTS' },
  { t: 'NTF',  c: '#00FF88', msg: 'Notifications · Socket.io temps réel' },
  { t: 'SEC',  c: '#FF6B6B', msg: 'RBAC · admin > commercial > employé' },
  { t: 'SYS',  c: '#00FF88', msg: 'Tous les modules opérationnels ✓' },
  { t: 'AUTH', c: '#00BFFF', msg: 'En attente d\'authentification...' },
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
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s ease',
      fontFamily: 'var(--mono)',
      fontSize: 11.5, lineHeight: 1.6,
    }}>
      <span style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0, fontSize: 10.5 }}>
        {String(delay).padStart(4, '0')}ms
      </span>
      <span style={{
        color: line.c, flexShrink: 0, fontSize: 10,
        fontWeight: 700, letterSpacing: '0.08em',
        background: `${line.c}15`,
        padding: '1px 5px', borderRadius: 3,
        border: `1px solid ${line.c}30`,
      }}>
        {line.t}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.5)', wordBreak: 'break-word' }}>
        {line.msg}
      </span>
    </div>
  )
}

export default function LoginTerminal() {
  const [showPwd, setShowPwd]   = useState(false)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [mounted, setMounted]   = useState(false)
  const [cursor, setCursor]     = useState(true)
  const router       = useRouter()
  const loginMutation = useLogin()

  useEffect(() => {
    setMounted(true)
    const t = setInterval(() => setCursor(c => !c), 530)
    return () => clearInterval(t)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loginMutation.mutate({ email, password }, {
      onError: (error: unknown) => {
        const ax = error as AxiosError<{ code?: string }>
        if (ax.response?.data?.code === 'TOTP_REQUIRED') {
          sessionStorage.setItem('2fa_pending', JSON.stringify({ email, password }))
          router.push(ROUTES.TWO_FA)
        }
      },
    })
  }

  const loading = loginMutation.isPending
  const loginError = (() => {
    if (!loginMutation.isError) return null
    const e = loginMutation.error as AxiosError<{ code?: string; error?: string }>
    if (e.response?.data?.code === 'TOTP_REQUIRED') return null
    return e.response?.data?.error ?? 'Identifiants incorrects.'
  })()

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Bricolage+Grotesque:wght@400;600;700;800&display=swap');

        :root {
          --mono: 'JetBrains Mono', 'Fira Code', monospace;
          --brico: 'Bricolage Grotesque', sans-serif;
          --noir: #070B11;
          --noir-mid: #0D1420;
          --electric: #00BFFF;
          --green: #00FF88;
          --amber: #FFB800;
          --panel: #0A0F1A;
        }

        /* Scanlines subtiles */
        .terminal-bg::after {
          content: '';
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,0,0,0.03) 2px,
            rgba(0,0,0,0.03) 4px
          );
        }

        .term-input {
          background: rgba(0,191,255,0.04) !important;
          border: 1px solid rgba(0,191,255,0.2) !important;
          color: #E8F4FF !important;
          font-family: var(--mono) !important;
          font-size: 13px !important;
          outline: none !important;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .term-input::placeholder { color: rgba(0,191,255,0.25) !important; }
        .term-input:focus {
          border-color: var(--electric) !important;
          box-shadow: 0 0 0 2px rgba(0,191,255,0.12), 0 0 12px rgba(0,191,255,0.08) !important;
        }

        @keyframes term-in {
          from { opacity:0; transform:translateX(20px); }
          to   { opacity:1; transform:translateX(0); }
        }
        @keyframes scanline {
          from { transform: translateY(-100%); }
          to   { transform: translateY(100vh); }
        }
        @keyframes glow-pulse {
          0%,100% { text-shadow: 0 0 8px var(--electric), 0 0 20px rgba(0,191,255,0.3); }
          50%      { text-shadow: 0 0 4px var(--electric), 0 0 10px rgba(0,191,255,0.15); }
        }
        @keyframes border-glow {
          0%,100% { box-shadow: 0 0 16px rgba(0,191,255,0.08), inset 0 0 24px rgba(0,191,255,0.03); }
          50%      { box-shadow: 0 0 24px rgba(0,191,255,0.15), inset 0 0 32px rgba(0,191,255,0.05); }
        }
        .term-btn:hover:not(:disabled) {
          background: rgba(0,255,136,0.15) !important;
          border-color: var(--green) !important;
          color: var(--green) !important;
          box-shadow: 0 0 16px rgba(0,255,136,0.2) !important;
        }
      `}</style>

      <div className="terminal-bg" style={{
        display: 'flex', height: '100vh',
        background: 'var(--noir)', fontFamily: 'var(--mono)',
        overflow: 'hidden', position: 'relative',
      }}>

        {/* Scanline animée */}
        <div style={{
          position: 'fixed', left: 0, right: 0, height: '2px',
          background: 'linear-gradient(90deg, transparent, rgba(0,191,255,0.15), transparent)',
          animation: 'scanline 8s linear infinite',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* ── Panneau gauche : flux terminal ── */}
        <div style={{
          width: '55%', minWidth: 500,
          background: 'var(--panel)',
          borderRight: '1px solid rgba(0,191,255,0.1)',
          display: 'flex', flexDirection: 'column',
          padding: '36px 40px',
          position: 'relative', overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* Noise texture */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: `radial-gradient(rgba(0,191,255,0.03) 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
          }} />

          {/* Header terminal */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32, position: 'relative', zIndex: 1 }}>
            {/* Dots style macOS terminal */}
            <div style={{ display: 'flex', gap: 6 }}>
              {['#FF5F57','#FEBC2E','#28C840'].map(c => (
                <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />
              ))}
            </div>
            <span style={{ fontSize: 11, color: 'rgba(0,191,255,0.4)', letterSpacing: '0.08em' }}>
              BTS ENTERPRISE PLATFORM — v2.0.0
            </span>
            {/* Live indicator */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00FF88', boxShadow: '0 0 6px #00FF88', animation: 'glow-pulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 10, color: 'rgba(0,255,136,0.6)', letterSpacing: '0.06em' }}>LIVE</span>
            </div>
          </div>

          {/* Titre */}
          <div style={{ marginBottom: 28, position: 'relative', zIndex: 1 }}>
            <p style={{
              fontFamily: 'var(--brico)', fontWeight: 800,
              fontSize: 'clamp(28px, 3vw, 42px)',
              color: '#E8F4FF', lineHeight: 1.1,
              letterSpacing: '-0.025em', margin: '0 0 10px',
            }}>
              Bridge Technologies<br />
              <span style={{
                color: 'var(--electric)',
                animation: 'glow-pulse 3s ease-in-out infinite',
              }}>
                Solutions
              </span>
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', margin: 0, letterSpacing: '0.05em', fontFamily: 'var(--mono)' }}>
              PLATEFORME DE GESTION · DOUALA, CAMEROUN · SYSCOHADA
            </p>
          </div>

          {/* Log stream */}
          <div style={{
            flex: 1, overflow: 'hidden',
            display: 'flex', flexDirection: 'column', gap: 6,
            position: 'relative', zIndex: 1,
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 85%, transparent 100%)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {LOG_LINES.map((line, i) => (
                <TerminalLog key={i} line={line} delay={i * 120} />
              ))}
              {/* Curseur clignotant */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, fontFamily: 'var(--mono)', fontSize: 11.5 }}>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10.5 }}>2040ms</span>
                <span style={{ color: 'var(--green)', fontSize: 10, fontWeight: 700, padding: '1px 5px', background: 'rgba(0,255,136,0.1)', borderRadius: 3, border: '1px solid rgba(0,255,136,0.2)' }}>SYS</span>
                <span style={{ color: 'rgba(0,191,255,0.6)' }}>
                  $ <span style={{ opacity: cursor ? 1 : 0, color: 'var(--electric)' }}>█</span>
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ paddingTop: 20, borderTop: '1px solid rgba(0,191,255,0.08)', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src="/logos/logo-bts-white.png" alt="" aria-hidden
                style={{ height: 22, filter: 'brightness(0) invert(1)', opacity: 0.25 }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em' }}>
                © 2026 BRIDGE TECHNOLOGIES SOLUTIONS
              </span>
            </div>
          </div>
        </div>

        {/* ── Panneau droit : formulaire ── */}
        <main style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--noir)', padding: '40px 24px',
          position: 'relative',
        }}>
          {/* Glow central */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 400, height: 400,
            background: 'radial-gradient(circle, rgba(0,191,255,0.05) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />

          <div style={{
            width: '100%', maxWidth: 360, position: 'relative', zIndex: 1,
            opacity: mounted ? 1 : 0,
            animation: mounted ? 'term-in 0.5s cubic-bezier(0.22,1,0.36,1) 0.15s both' : 'none',
          }}>

            {/* Logo */}
            <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/logos/invoicehub.png" alt="InvoiceHub"
                style={{ height: 28, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.8 }} />
            </div>

            <div style={{ marginBottom: 28 }}>
              <h1 style={{
                fontFamily: 'var(--brico)', fontWeight: 700, fontSize: 24,
                color: '#E8F4FF', letterSpacing: '-0.02em', margin: '0 0 6px',
              }}>
                Authentification
              </h1>
              <p style={{ fontSize: 12, color: 'rgba(0,191,255,0.45)', margin: 0, fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
                SESSION · BTS-CORP · DOUALA
              </p>
            </div>

            {loginError && (
              <div role="alert" style={{
                fontSize: 12, color: '#FF6B6B', marginBottom: 18,
                background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)',
                borderRadius: 4, padding: '10px 14px', fontFamily: 'var(--mono)',
              }}>
                <span style={{ color: 'rgba(255,107,107,0.6)', marginRight: 8 }}>ERR</span>
                {loginError}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="email-t" style={{
                  fontSize: 10, fontWeight: 500, color: 'rgba(0,191,255,0.5)',
                  fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase',
                }}>
                  Identifiant / Email
                </label>
                <input id="email-t" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="nom@bts.cm" required autoComplete="email"
                  className="term-input"
                  style={{ padding: '11px 14px', borderRadius: 4, width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="pwd-t" style={{
                    fontSize: 10, fontWeight: 500, color: 'rgba(0,191,255,0.5)',
                    fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase',
                  }}>
                    Mot de passe
                  </label>
                  <Link href="/reset-password"
                    style={{ fontSize: 11, color: 'rgba(0,191,255,0.4)', textDecoration: 'none', fontFamily: 'var(--mono)', minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 4px', transition: 'color 0.15s' }}>
                    reset →
                  </Link>
                </div>
                <div style={{ position: 'relative' }}>
                  <input id="pwd-t" type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="current-password"
                    className="term-input"
                    style={{ padding: '11px 44px 11px 14px', borderRadius: 4, width: '100%', boxSizing: 'border-box' }}
                  />
                  <button type="button" onClick={() => setShowPwd(s => !s)}
                    aria-label={showPwd ? 'Masquer' : 'Afficher'}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,191,255,0.3)', padding: 4 }}>
                    {showPwd ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} aria-busy={loading}
                className="term-btn"
                style={{
                  marginTop: 8, padding: '12px 20px', borderRadius: 4,
                  background: 'rgba(0,191,255,0.08)',
                  color: 'var(--electric)',
                  border: '1px solid rgba(0,191,255,0.3)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13,
                  width: '100%', minHeight: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  transition: 'all 0.2s ease',
                  opacity: loading ? 0.65 : 1,
                }}>
                {loading
                  ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Connexion...</>
                  : <><ChevronRight size={14} aria-hidden /> Connexion</>
                }
              </button>
            </form>

            <p style={{ marginTop: 24, fontSize: 10.5, color: 'rgba(255,255,255,0.18)', textAlign: 'center', fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
              Accès restreint · Employés BTS uniquement
            </p>
          </div>
        </main>
      </div>
    </>
  )
}
