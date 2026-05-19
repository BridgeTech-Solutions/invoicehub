'use client'

/**
 * DIRECTION 4 — "CHARTER+" (version finale recommandée)
 * 100% dans la charte BTS : fonts Sora + DM Sans, couleurs du design system,
 * CSS variables existantes, .sidebar-pattern, keyframes globals.
 * Rendu impactant par : animation staggerée, metric cards, module pills,
 * tagline repositionnée, profondeur visuelle sur le panneau gauche.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Eye, EyeOff, Loader2,
  FileText, TrendingUp, Package,
  ShoppingCart, Users, ShieldCheck,
} from 'lucide-react'
import { useLogin } from '@/features/auth/hooks'
import { ROUTES } from '@/lib/constants'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { AxiosError } from 'axios'

// ─── Metrics (couleurs du design system) ───────────────────────
const METRICS = [
  { icon: FileText,    label: 'Factures',        value: '1 248', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  delay: '0.10s' },
  { icon: TrendingUp,  label: 'CA mensuel',       value: '48.2M', color: '#16a34a', bg: 'rgba(22,163,74,0.12)',   delay: '0.17s' },
  { icon: Package,     label: 'Produits stock',   value: '312',   color: '#d97706', bg: 'rgba(217,119,6,0.12)',   delay: '0.24s' },
  { icon: ShoppingCart,label: 'Commandes',        value: '24',    color: '#9333ea', bg: 'rgba(147,51,234,0.12)',  delay: '0.31s' },
  { icon: Users,       label: 'Clients actifs',   value: '186',   color: '#2D7DD2', bg: 'rgba(45,125,210,0.12)',  delay: '0.38s' },
  { icon: ShieldCheck, label: 'Audit logs',       value: '5 902', color: '#14b8a6', bg: 'rgba(20,184,166,0.12)', delay: '0.45s' },
]

const MODULES = [
  'Facturation', 'Proformas', 'Paiements',
  'Stock & CMUP', 'Bons de commande',
  'Approbations', 'Clients', 'Fournisseurs',
  'Audit SYSCOHADA', 'Tableaux de bord',
]

// ─── Carte métrique ────────────────────────────────────────────
function MetricCard({
  icon: Icon, label, value, color, bg, delay,
}: typeof METRICS[0]) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 'var(--radius-md)',
      padding: '13px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
      backdropFilter: 'blur(6px)',
      opacity:    visible ? 1 : 0,
      transform:  visible ? 'translateY(0)' : 'translateY(14px)',
      transition: `opacity 0.45s var(--ease-smooth) ${delay}, transform 0.45s var(--ease-spring) ${delay}`,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 'var(--radius-sm)', flexShrink: 0,
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={15} style={{ color }} strokeWidth={1.8} aria-hidden />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 10.5, color: 'var(--sidebar-text)',
          fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
          textTransform: 'uppercase', fontWeight: 600,
        }}>
          {label}
        </p>
        <p style={{
          margin: 0, fontSize: 18, fontWeight: 700, color: '#fff',
          fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', lineHeight: 1.2,
        }}>
          {value}
          <span style={{ fontSize: 10, color: 'var(--sidebar-text)', marginLeft: 4, fontWeight: 400 }}>
            XAF
          </span>
        </p>
      </div>
      {/* Live dot */}
      <div style={{
        marginLeft: 'auto', width: 6, height: 6,
        borderRadius: '50%', background: color, flexShrink: 0,
        boxShadow: `0 0 6px ${color}`,
        animation: 'live-pulse 2.2s ease-in-out infinite',
      }} />
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────
export default function LoginCharterPlus() {
  const [showPwd,  setShowPwd]  = useState(false)
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [mounted,  setMounted]  = useState(false)
  const router        = useRouter()
  const loginMutation = useLogin()
  const isMobile      = useIsMobile()

  useEffect(() => { setMounted(true) }, [])

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
    return e.response?.data?.error ?? 'Identifiants incorrects. Veuillez réessayer.'
  })()

  const inputBase: React.CSSProperties = {
    padding: '11px 14px', width: '100%',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)',
    background: 'var(--surface)',
    fontSize: 14, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box' as const,
  }

  return (
    <>
      <style>{`
        @keyframes live-pulse {
          0%, 100% { opacity: 1;   transform: scale(1);   }
          50%       { opacity: 0.4; transform: scale(0.65); }
        }
        @keyframes panel-in {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes form-in {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer-text {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .login-input:focus {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 3px var(--primary-light) !important;
        }
        .login-submit:not(:disabled):hover {
          background: var(--primary-hover) !important;
          box-shadow: 0 6px 20px var(--primary-glow) !important;
        }
        .forgot-link:hover { color: var(--primary-hover) !important; }
        .module-pill:nth-child(odd)  { animation-delay: 0.05s; }
        .module-pill:nth-child(even) { animation-delay: 0.10s; }
      `}</style>

      <div style={{
        display: 'flex', height: '100vh',
        fontFamily: 'var(--font-body)', overflow: 'hidden',
      }}>

        {/* ══════════════════════════════════════════════════════
            PANNEAU GAUCHE — navy charter, vivant et impactant
        ══════════════════════════════════════════════════════ */}
        {!isMobile && (
          <div style={{
            width: '48%', minWidth: 460, flexShrink: 0,
            background: 'var(--sidebar-bg)',
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            padding: '40px 44px',
            animation: mounted ? 'panel-in 0.5s var(--ease-smooth) both' : 'none',
          }}>

            {/* Pattern réseau existant */}
            <div className="sidebar-pattern" style={{ opacity: 0.06 }} />

            {/* Glow primaire bas-gauche */}
            <div style={{
              position: 'absolute', bottom: -120, left: -80,
              width: 500, height: 500, pointerEvents: 'none',
              background: `radial-gradient(circle, rgba(45,125,210,0.22) 0%, transparent 60%)`,
            }} />

            {/* Glow secondaire haut-droite */}
            <div style={{
              position: 'absolute', top: -60, right: -60,
              width: 320, height: 320, pointerEvents: 'none',
              background: `radial-gradient(circle, rgba(45,125,210,0.10) 0%, transparent 65%)`,
            }} />

            {/* ── Logo ── */}
            <div style={{
              position: 'relative', zIndex: 1,
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'none' : 'translateY(-6px)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}>
              <img
                src="/logos/invoicehub.png"
                alt="InvoiceHub"
                style={{ height: 30, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.88 }}
              />
            </div>

            {/* ── Titre + sous-titre ── */}
            <div style={{
              position: 'relative', zIndex: 1, marginTop: 36,
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.45s ease 0.08s',
            }}>
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 800,
                fontSize: 'clamp(28px, 2.8vw, 40px)',
                color: '#fff', lineHeight: 1.1, letterSpacing: '-0.025em',
                margin: '0 0 14px',
              }}>
                Pilotez l'entreprise.<br />
                <span style={{
                  background: 'linear-gradient(90deg, var(--primary), #5ba4e8, var(--primary))',
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  animation: 'shimmer-text 4s linear infinite',
                  display: 'inline-block',
                }}>
                  Pas juste les factures.
                </span>
              </p>
              <p style={{
                fontSize: 13, color: 'var(--sidebar-text)', lineHeight: 1.7, maxWidth: 340,
                fontFamily: 'var(--font-body)',
              }}>
                Plateforme de gestion d'entreprise conforme SYSCOHADA —{' '}
                <span style={{ color: 'var(--sidebar-text-hover)' }}>Bridge Technologies Solutions</span>,
                Douala.
              </p>
            </div>

            {/* ── Module pills ── */}
            <div style={{
              position: 'relative', zIndex: 1, marginTop: 22,
              display: 'flex', flexWrap: 'wrap', gap: 6,
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.4s ease 0.15s',
            }}>
              {MODULES.map((m, i) => (
                <span
                  key={m}
                  className="module-pill"
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 10px',
                    borderRadius: 99,
                    fontFamily: 'var(--font-display)',
                    background: i % 3 === 0 ? 'rgba(45,125,210,0.12)' : 'transparent',
                    border: i % 3 === 0 ? '1px solid rgba(45,125,210,0.3)' : '1px solid rgba(255,255,255,0.08)',
                    color: i % 3 === 0 ? 'rgba(93,169,232,0.9)' : 'rgba(255,255,255,0.4)',
                  } as React.CSSProperties}
                >
                  {m}
                </span>
              ))}
            </div>

            {/* ── Grille de métriques ── */}
            <div style={{
              position: 'relative', zIndex: 1, marginTop: 24, flex: 1,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9,
              alignContent: 'start',
            }}>
              {METRICS.map(m => <MetricCard key={m.label} {...m} />)}
            </div>

            {/* ── Footer ── */}
            <div style={{
              position: 'relative', zIndex: 1,
              display: 'flex', alignItems: 'center', gap: 8,
              paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)',
              opacity: mounted ? 1 : 0, transition: 'opacity 0.4s ease 0.5s',
            }}>
              <img
                src="/logos/logo-bts-white.png"
                alt="" aria-hidden="true"
                style={{ height: 28, filter: 'brightness(0) invert(1)', opacity: 0.3 }}
              />
              <span style={{ fontSize: 11, color: 'var(--sidebar-section)', fontFamily: 'var(--font-body)' }}>
                © 2026 Bridge Technologies Solutions
              </span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            PANNEAU DROIT — formulaire propre, charter complète
        ══════════════════════════════════════════════════════ */}
        <main style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg)', padding: '40px 24px',
        }}>
          <div style={{
            width: '100%', maxWidth: 380,
            opacity:   mounted ? 1 : 0,
            animation: mounted ? 'form-in 0.5s var(--ease-smooth) 0.2s both' : 'none',
          }}>

            {/* Logo mobile uniquement */}
            {isMobile && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
                <img src="/logos/invoicehub.png" alt="InvoiceHub" style={{ height: 32, objectFit: 'contain' }} />
              </div>
            )}

            {/* En-tête */}
            <div style={{ marginBottom: 32 }}>
              {/* Barre d'accent */}
              <div style={{
                width: 32, height: 3, borderRadius: 99,
                background: 'var(--primary)',
                marginBottom: 16,
                boxShadow: '0 2px 8px var(--primary-glow)',
              }} />
              <h1 style={{
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26,
                color: 'var(--text-1)', letterSpacing: '-0.02em', margin: '0 0 6px',
              }}>
                Connexion
              </h1>
              <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--font-body)' }}>
                Accédez à votre espace BTS
              </p>
            </div>

            {/* Erreur */}
            {loginError && (
              <div role="alert" aria-live="assertive" style={{
                fontSize: 13, color: '#dc2626', marginBottom: 18,
                background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
                borderRadius: 'var(--radius-md)', padding: '10px 14px',
                fontFamily: 'var(--font-body)',
              }}>
                {loginError}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Email */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="email" style={{
                  fontSize: 13, fontWeight: 500, color: 'var(--text-2)',
                  fontFamily: 'var(--font-display)',
                }}>
                  Email professionnel
                </label>
                <input
                  id="email" type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="nom@bts.cm" required autoComplete="email"
                  className="login-input"
                  style={inputBase}
                />
              </div>

              {/* Mot de passe */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="password" style={{
                    fontSize: 13, fontWeight: 500, color: 'var(--text-2)',
                    fontFamily: 'var(--font-display)',
                  }}>
                    Mot de passe
                  </label>
                  <Link href="/reset-password" className="forgot-link"
                    style={{
                      fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none',
                      display: 'inline-flex', alignItems: 'center',
                      minHeight: 44, padding: '0 4px',
                      fontFamily: 'var(--font-body)',
                      transition: 'color 0.15s',
                    }}>
                    Mot de passe oublié ?
                  </Link>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    id="password" type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="current-password"
                    className="login-input"
                    style={{ ...inputBase, paddingRight: 44 }}
                  />
                  <button type="button" onClick={() => setShowPwd(s => !s)}
                    aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-3)', padding: 4, display: 'flex',
                    }}>
                    {showPwd ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {/* Bouton */}
              <button
                type="submit" disabled={loading} aria-busy={loading}
                className="login-submit"
                style={{
                  marginTop: 4, padding: '12px 20px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--primary)', color: '#fff',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5,
                  border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', minHeight: 44,
                  opacity: loading ? 0.65 : 1,
                  boxShadow: loading ? 'none' : '0 4px 16px var(--primary-glow)',
                  transition: 'background 0.15s, box-shadow 0.15s, opacity 0.15s',
                }}>
                {loading && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>
            </form>

            {/* Note de bas de page */}
            <div style={{
              marginTop: 28, paddingTop: 20,
              borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#16a34a', boxShadow: '0 0 6px rgba(22,163,74,0.5)',
                animation: 'live-pulse 2.5s ease-in-out infinite',
              }} />
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--font-body)' }}>
                Accès réservé aux employés Bridge Technologies Solutions
              </p>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
