'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, ChevronRight } from 'lucide-react'
import { useLogin } from '@/features/auth/hooks'
import { ROUTES } from '@/lib/constants'
import { CompanyLogo } from '@/components/ui/CompanyLogo'
import { TerminalLeftPanel } from '../_components/TerminalLeftPanel'
import type { AxiosError } from 'axios'

export default function LoginPage() {
  const [showPwd,  setShowPwd]  = useState(false)
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [mounted,  setMounted]  = useState(false)
  const router        = useRouter()
  const loginMutation = useLogin()

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

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--t-noir)', overflow: 'hidden', position: 'relative' }}>
      {/* Scanline animée globale */}
      <div className="t-scanline" aria-hidden="true" />

      {/* ── Panneau gauche ─────────────────────────────────────── */}
      <TerminalLeftPanel />

      {/* ── Panneau droit : formulaire ─────────────────────────── */}
      <main style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--t-noir)', padding: '40px 24px', position: 'relative',
      }}>
        {/* Glow central */}
        <div aria-hidden style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 420, height: 420, pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(0,191,255,0.04) 0%, transparent 65%)',
        }} />

        <div style={{
          width: '100%', maxWidth: 360, position: 'relative', zIndex: 1,
          opacity:   mounted ? 1 : 0,
          animation: mounted ? 'term-in 0.5s cubic-bezier(0.22,1,0.36,1) 0.12s both' : 'none',
        }}>
          {/* Logo (visible toujours à droite) */}
          <div style={{ marginBottom: 30 }}>
            <CompanyLogo variant="white" height={28} alt="InvoiceHub" public style={{ opacity: 0.75 }} />
          </div>

          <div style={{ marginBottom: 26 }}>
            <h1 style={{
              fontFamily: 'var(--t-brico)', fontWeight: 700, fontSize: 24,
              color: '#E8F4FF', letterSpacing: '-0.02em', margin: '0 0 6px',
            }}>
              Authentification
            </h1>
            <p style={{ fontSize: 11.5, color: 'rgba(0,191,255,0.4)', margin: 0, fontFamily: 'var(--t-mono)', letterSpacing: '0.05em' }}>
              SESSION · BTS-CORP · DOUALA
            </p>
          </div>

          {loginError && (
            <div role="alert" aria-live="assertive" style={{
              fontSize: 12, color: 'var(--t-red)', marginBottom: 18,
              background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.22)',
              borderRadius: 4, padding: '10px 14px', fontFamily: 'var(--t-mono)',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <span style={{ color: 'rgba(255,107,107,0.55)', fontWeight: 700, fontSize: 10, padding: '1px 5px', background: 'rgba(255,107,107,0.1)', borderRadius: 3, border: '1px solid rgba(255,107,107,0.2)', flexShrink: 0 }}>ERR</span>
              {loginError}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="email" style={{
                fontSize: 10, fontWeight: 500, color: 'rgba(0,191,255,0.48)',
                fontFamily: 'var(--t-mono)', letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>
                Identifiant / Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nom@bts.cm"
                required
                autoComplete="email"
                className="term-input"
                style={{ padding: '11px 14px' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="password" style={{
                  fontSize: 10, fontWeight: 500, color: 'rgba(0,191,255,0.48)',
                  fontFamily: 'var(--t-mono)', letterSpacing: '0.1em', textTransform: 'uppercase',
                }}>
                  Mot de passe
                </label>
                <Link
                  href={ROUTES.RESET_PASSWORD}
                  style={{
                    fontSize: 11, color: 'rgba(0,191,255,0.38)', textDecoration: 'none',
                    fontFamily: 'var(--t-mono)', minHeight: 44,
                    display: 'inline-flex', alignItems: 'center', padding: '0 2px',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--t-electric)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,191,255,0.38)')}
                >
                  reset →
                </Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="term-input"
                  style={{ padding: '11px 44px 11px 14px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(0,191,255,0.3)', padding: 4, display: 'flex',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(0,191,255,0.7)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,191,255,0.3)')}
                >
                  {showPwd ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="term-btn"
              style={{
                marginTop: 8, padding: '12px 20px', borderRadius: 4,
                background: 'rgba(0,191,255,0.07)',
                color: 'var(--t-electric)',
                border: '1px solid rgba(0,191,255,0.28)',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--t-mono)', fontWeight: 700, fontSize: 12.5,
                width: '100%', minHeight: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                transition: 'all 0.2s ease',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Connexion...</>
                : <><ChevronRight size={14} aria-hidden /> Se connecter</>
              }
            </button>
          </form>

          <p style={{
            marginTop: 24, fontSize: 10.5, color: 'rgba(255,255,255,0.15)',
            textAlign: 'center', fontFamily: 'var(--t-mono)', letterSpacing: '0.04em',
          }}>
            Accès restreint · Employés BTS uniquement
          </p>
        </div>
      </main>
    </div>
  )
}
