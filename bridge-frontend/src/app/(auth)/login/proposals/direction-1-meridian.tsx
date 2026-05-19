'use client'

/**
 * DIRECTION 1 — "MERIDIAN"
 * Panneau gauche vivant : metrics animées qui incarnent la puissance du système.
 * Message : "Vous ne vous connectez pas à un logiciel de facturation.
 *            Vous vous connectez au cœur opérationnel de BTS."
 * Font    : Syne (display) + Plus Jakarta Sans (body)
 * Palette : Navy profond #0B1E33 + Bleu électrique #2D7DD2 + Blanc + Ambre #F59E0B
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, TrendingUp, Package, FileText, ShoppingCart, Users, Shield } from 'lucide-react'
import { useLogin } from '@/features/auth/hooks'
import { ROUTES } from '@/lib/constants'
import type { AxiosError } from 'axios'

// ─── Metric cards data ──────────────────────────────────────────
const METRICS = [
  { icon: FileText,    label: 'Factures',       value: '1,248', sub: 'ce mois',   color: '#2D7DD2', delay: '0s'    },
  { icon: TrendingUp,  label: 'Chiffre affaires',value: '48.2M', sub: 'XAF / mois', color: '#10B981', delay: '0.1s' },
  { icon: Package,     label: 'Produits',        value: '312',   sub: 'en stock',  color: '#F59E0B', delay: '0.2s'  },
  { icon: ShoppingCart,label: 'Commandes',       value: '24',    sub: 'en cours',  color: '#8B5CF6', delay: '0.3s'  },
  { icon: Users,       label: 'Clients actifs',  value: '186',   sub: 'total',     color: '#EC4899', delay: '0.4s'  },
  { icon: Shield,      label: 'Audit logs',      value: '5,902', sub: 'ce mois',   color: '#14B8A6', delay: '0.5s'  },
]

const MODULES = ['Facturation', 'Proformas', 'Stock', 'Achats', 'Approbations', 'Audit', 'Clients', 'Fournisseurs']

function MetricCard({ icon: Icon, label, value, sub, color, delay }: typeof METRICS[0]) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: `opacity 0.5s ease ${delay}, transform 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}`,
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: `${color}22`,
        border: `1px solid ${color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} style={{ color }} strokeWidth={1.8} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--jakarta)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: 'var(--syne)', letterSpacing: '-0.02em' }}>
            {value}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--jakarta)' }}>
            {sub}
          </span>
        </div>
      </div>
      {/* Live indicator */}
      <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', background: color,
          boxShadow: `0 0 6px ${color}`,
          animation: 'pulse-dot 2s ease-in-out infinite',
        }} />
      </div>
    </div>
  )
}

export default function LoginMeridian() {
  const [showPwd, setShowPwd] = useState(false)
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const loginMutation = useLogin()

  useEffect(() => { setMounted(true) }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loginMutation.mutate({ email, password }, {
      onError: (error: unknown) => {
        const axiosError = error as AxiosError<{ code?: string }>
        if (axiosError.response?.data?.code === 'TOTP_REQUIRED') {
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
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');
        :root { --syne: 'Syne', sans-serif; --jakarta: 'Plus Jakarta Sans', sans-serif; }
        @keyframes pulse-dot {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.4; transform:scale(0.7); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes float-up {
          from { opacity:0; transform:translateY(24px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .meridian-input:focus {
          border-color: #2D7DD2 !important;
          box-shadow: 0 0 0 3px rgba(45,125,210,0.18) !important;
        }
      `}</style>

      <div style={{ display: 'flex', height: '100vh', fontFamily: 'var(--jakarta)', overflow: 'hidden' }}>

        {/* ── Panneau gauche ── */}
        <div style={{
          width: '50%', minWidth: 480,
          background: 'linear-gradient(160deg, #0B1E33 0%, #0f2d4a 50%, #071422 100%)',
          display: 'flex', flexDirection: 'column',
          padding: '44px 48px',
          position: 'relative', overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* Grid de fond */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: `
              linear-gradient(rgba(45,125,210,0.06) 1px, transparent 1px),
              linear-gradient(90deg, rgba(45,125,210,0.06) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse at 40% 50%, black 30%, transparent 75%)',
          }} />
          {/* Glow bas-gauche */}
          <div style={{
            position: 'absolute', bottom: -80, left: -80, width: 400, height: 400,
            background: 'radial-gradient(circle, rgba(45,125,210,0.2) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />

          {/* Logo + marque */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1,
            opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(-8px)',
            transition: 'opacity 0.4s ease, transform 0.4s ease',
          }}>
            <img src="/logos/invoicehub.png" alt="InvoiceHub"
              style={{ height: 32, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9 }} />
          </div>

          {/* Titre + modules */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
            position: 'relative', zIndex: 1,
            opacity: mounted ? 1 : 0,
            transition: 'opacity 0.5s ease 0.1s',
          }}>
            <p style={{
              fontFamily: 'var(--syne)', fontWeight: 800, fontSize: 38,
              color: '#fff', lineHeight: 1.1, letterSpacing: '-0.025em',
              margin: '0 0 12px',
            }}>
              Pilotez votre<br />
              <span style={{
                background: 'linear-gradient(90deg, #2D7DD2, #5BA4E8, #2D7DD2)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                animation: 'shimmer 3s linear infinite',
              }}>
                activité entière.
              </span>
            </p>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.45)', margin: '0 0 28px', lineHeight: 1.6, maxWidth: 340 }}>
              Plateforme de gestion d'entreprise SYSCOHADA — Bridge Technologies Solutions, Douala.
            </p>

            {/* Module pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 36 }}>
              {MODULES.map((m, i) => (
                <span key={m} style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px',
                  borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.5)',
                  fontFamily: 'var(--jakarta)',
                  opacity: mounted ? 1 : 0,
                  transition: `opacity 0.3s ease ${0.3 + i * 0.04}s`,
                }}>
                  {m}
                </span>
              ))}
            </div>

            {/* Grid de metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {METRICS.map((m) => <MetricCard key={m.label} {...m} />)}
            </div>
          </div>

          {/* Footer */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logos/logo-bts-white.png" alt="" aria-hidden
              style={{ height: 28, filter: 'brightness(0) invert(1)', opacity: 0.3 }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--jakarta)' }}>
              © 2026 Bridge Technologies Solutions
            </span>
          </div>
        </div>

        {/* ── Panneau droit (formulaire) ── */}
        <main style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#F8FAFC', padding: '40px 24px',
        }}>
          <div style={{
            width: '100%', maxWidth: 380,
            opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(12px)',
            transition: 'opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s',
          }}>
            <div style={{ marginBottom: 36 }}>
              <h1 style={{
                fontFamily: 'var(--syne)', fontWeight: 700, fontSize: 28,
                color: '#0B1E33', letterSpacing: '-0.02em', margin: '0 0 8px',
              }}>
                Connexion
              </h1>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
                Accédez à votre espace BTS
              </p>
            </div>

            {loginError && (
              <div role="alert" style={{
                fontSize: 13, color: '#dc2626', marginBottom: 18,
                background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 8, padding: '10px 14px',
              }}>
                {loginError}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="email-m" style={{ fontSize: 13, fontWeight: 500, color: '#374151', fontFamily: 'var(--jakarta)' }}>
                  Email professionnel
                </label>
                <input id="email-m" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="nom@bts.cm" required autoComplete="email"
                  className="meridian-input"
                  style={{
                    padding: '11px 14px', borderRadius: 8,
                    border: '1.5px solid #E2E8F0', background: '#fff',
                    fontSize: 14, color: '#0B1E33', fontFamily: 'var(--jakarta)',
                    outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="pwd-m" style={{ fontSize: 13, fontWeight: 500, color: '#374151', fontFamily: 'var(--jakarta)' }}>
                    Mot de passe
                  </label>
                  <Link href="/reset-password" style={{ fontSize: 12.5, color: '#2D7DD2', textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 4px' }}>
                    Oublié ?
                  </Link>
                </div>
                <div style={{ position: 'relative' }}>
                  <input id="pwd-m" type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="current-password"
                    className="meridian-input"
                    style={{
                      width: '100%', padding: '11px 44px 11px 14px', borderRadius: 8,
                      border: '1.5px solid #E2E8F0', background: '#fff',
                      fontSize: 14, color: '#0B1E33', fontFamily: 'var(--jakarta)',
                      outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s', boxSizing: 'border-box',
                    }}
                  />
                  <button type="button" onClick={() => setShowPwd(s => !s)}
                    aria-label={showPwd ? 'Masquer' : 'Afficher'}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
                    {showPwd ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} aria-busy={loading} style={{
                marginTop: 6, padding: '12px 20px', borderRadius: 8,
                background: loading ? '#94A3B8' : '#2D7DD2',
                color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--syne)', fontWeight: 700, fontSize: 14.5,
                width: '100%', minHeight: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading ? 'none' : '0 4px 16px rgba(45,125,210,0.4)',
                transition: 'all 0.2s ease',
              }}>
                {loading && <Loader2 size={15} className="animate-spin" aria-hidden />}
                {loading ? 'Connexion...' : 'Se connecter →'}
              </button>
            </form>

            <p style={{ marginTop: 28, fontSize: 12, color: '#94A3B8', textAlign: 'center', fontFamily: 'var(--jakarta)' }}>
              Accès réservé aux employés de Bridge Technologies Solutions
            </p>
          </div>
        </main>
      </div>
    </>
  )
}
