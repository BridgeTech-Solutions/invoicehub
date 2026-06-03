'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { useLogin } from '@/features/auth/hooks'
import { ROUTES } from '@/lib/constants'
import { AuthLeftPanel } from '../_components/AuthLeftPanel'
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <AuthLeftPanel />

      {/* ── Panneau droit ─────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff',
        padding: '40px 24px',
        overflow: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* En-tête — entrée en cascade */}
          <div style={{
            marginBottom: 32,
            opacity: mounted ? 1 : 0,
            animation: mounted ? 'authStaggerIn 0.5s ease 0.05s both' : 'none',
          }}>
            <h1 style={{
              fontSize: 26,
              fontWeight: 800,
              fontFamily: 'var(--font-display)',
              color: '#0f172a',
              letterSpacing: '-0.025em',
              margin: '0 0 7px',
            }}>
              Connexion
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0, fontFamily: 'var(--font-body)' }}>
              Accédez à votre espace de facturation
            </p>
          </div>

          {/* Message d'erreur */}
          {loginError && (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                animation: 'authStaggerIn 0.3s ease both',
                marginBottom: 22,
                padding: '12px 14px',
                borderRadius: 8,
                background: '#fef2f2',
                border: '1.5px solid #fecaca',
                fontSize: 13.5,
                color: '#dc2626',
                fontFamily: 'var(--font-body)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <AlertCircle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
              {loginError}
            </div>
          )}

          {/* Formulaire */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Email */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 7,
              opacity: mounted ? 1 : 0,
              animation: mounted ? 'authStaggerIn 0.5s ease 0.15s both' : 'none',
            }}>
              <label htmlFor="email" style={{
                fontSize: 13.5, fontWeight: 600,
                color: '#374151', fontFamily: 'var(--font-display)',
              }}>
                Email professionnel
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nom@bts.cm"
                required
                autoComplete="email"
                className="auth-input"
                style={{ padding: '11px 14px' }}
                suppressHydrationWarning
              />
            </div>

            {/* Mot de passe */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 7,
              opacity: mounted ? 1 : 0,
              animation: mounted ? 'authStaggerIn 0.5s ease 0.26s both' : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="password" style={{
                  fontSize: 13.5, fontWeight: 600,
                  color: '#374151', fontFamily: 'var(--font-display)',
                }}>
                  Mot de passe
                </label>
                <Link
                  href={ROUTES.RESET_PASSWORD}
                  style={{
                    fontSize: 13, color: 'var(--primary)',
                    textDecoration: 'none', fontFamily: 'var(--font-body)',
                    fontWeight: 500, transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.72')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <div style={{ position: 'relative' }} suppressHydrationWarning>
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="auth-input"
                  style={{ padding: '11px 44px 11px 14px' }}
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  style={{
                    position: 'absolute', right: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', color: '#94a3b8',
                    padding: 4, display: 'flex',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#475569')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
                >
                  {/* CSS visibility pour éviter removeChild lors du toggle */}
                  <Eye    size={16} aria-hidden style={{ display: showPwd ? 'none' : 'block' }} />
                  <EyeOff size={16} aria-hidden style={{ display: showPwd ? 'block' : 'none' }} />
                </button>
              </div>
            </div>

            {/* Bouton */}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="auth-btn"
              style={{
                marginTop: 4,
                opacity: mounted ? 1 : 0,
                animation: mounted ? 'authStaggerIn 0.5s ease 0.37s both' : 'none',
              }}
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Connexion en cours…</>
                : 'Se connecter'
              }
            </button>
          </form>

          {/* Note de bas */}
          <p style={{
            marginTop: 28,
            opacity: mounted ? 1 : 0,
            animation: mounted ? 'authStaggerIn 0.5s ease 0.46s both' : 'none',
            fontSize: 12.5,
            color: '#94a3b8',
            textAlign: 'center',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.55,
          }}>
            Accès réservé aux employés de Bridge Technologies Solutions
          </p>
        </div>
      </main>
    </div>
  )
}
