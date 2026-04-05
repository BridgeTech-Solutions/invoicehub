'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useLogin } from '@/features/auth/hooks'
import { ROUTES } from '@/lib/constants'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { AxiosError } from 'axios'

export default function LoginPage() {
  const [showPwd, setShowPwd] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()
  const loginMutation = useLogin()
  const isMobile = useIsMobile()

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
    const axiosError = loginMutation.error as AxiosError<{ code?: string; message?: string }>
    if (axiosError.response?.data?.code === 'TOTP_REQUIRED') return null
    return axiosError.response?.data?.message ?? 'Identifiants incorrects. Veuillez réessayer.'
  })()

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'var(--font-body)' }}>

      {/* ── Left panel — masqué sur mobile (C2) ─────────────────── */}
      {!isMobile && (
        <div style={{
          width: '45%',
          background: 'var(--sidebar-bg)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '40px 48px',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* Background pattern */}
          <div className="sidebar-pattern" />
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at 20% 80%, rgba(45,125,210,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(45,125,210,0.08) 0%, transparent 60%)',
          }} />

          {/* Logo + Tagline (C1: texte marketing → <p>, pas <h1>) */}
          <div style={{
            position: 'relative', zIndex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            flex: 1, justifyContent: 'center',
          }}>
            <img
              src="/logos/invoicehub.png"
              alt="InvoiceHub"
              style={{
                height: 140, width: 'auto', objectFit: 'contain',
                filter: 'brightness(0) invert(1)', opacity: 0.92, marginBottom: 32,
              }}
            />
            <div>
              {/* C1: texte marketing → <p>, le <h1> est dans le panneau droit */}
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36,
                color: '#ffffff', lineHeight: 1.15, letterSpacing: '-0.02em',
                marginBottom: 16,
              }}>
                Gérez vos factures<br />
                <span style={{ color: 'var(--primary)' }}>avec précision.</span>
              </p>
              <p style={{ fontSize: 14.5, color: 'var(--sidebar-text)', lineHeight: 1.7, maxWidth: 320 }}>
                Plateforme de facturation interne conforme SYSCOHADA pour Bridge Technologies Solutions.
              </p>
            </div>
          </div>

          {/* Footer — logo BTS décoratif (M1: alt="") */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src="/logos/logo-bts-white.png"
              alt=""
              aria-hidden="true"
              style={{ height: 36, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.5 }}
            />
            <p style={{ fontSize: 11.5, color: 'var(--sidebar-section)' }}>
              © 2026 Bridge Technologies Solutions
            </p>
          </div>
        </div>
      )}

      {/* ── Right panel ─────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          padding: '40px 24px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* Logo visible uniquement sur mobile */}
          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
              <img src="/logos/invoicehub.png" alt="InvoiceHub" style={{ height: 36, objectFit: 'contain' }} />
            </div>
          )}

          <div style={{ marginBottom: 36 }}>
            {/* C1: "Connexion" est le vrai <h1> de la page */}
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26,
              color: 'var(--text-1)', letterSpacing: '-0.02em', marginBottom: 6,
            }}>
              Connexion
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-3)' }}>
              Accédez à votre espace de facturation
            </p>
          </div>

          {/* Erreur globale */}
          {loginError && (
            <p
              role="alert"
              aria-live="assertive"
              style={{
                fontSize: 13, color: '#dc2626', margin: '0 0 16px',
                background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)',
                borderRadius: 'var(--radius-md)', padding: '10px 14px',
              }}
            >
              {loginError}
            </p>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Email (C3: autocomplete) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                htmlFor="email"
                style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}
              >
                Email professionnel
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@bts.cm"
                required
                autoComplete="email"
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
                  background: 'var(--surface)', fontSize: 14, color: 'var(--text-1)',
                  fontFamily: 'var(--font-body)', outline: 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Password (C3: autocomplete) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label
                  htmlFor="password"
                  style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}
                >
                  Mot de passe
                </label>
                {/* H3: touch target ≥ 44px */}
                <Link
                  href="/reset-password"
                  style={{
                    fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center',
                    minHeight: 44, padding: '0 4px',
                  }}
                >
                  Mot de passe oublié ?
                </Link>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  style={{
                    width: '100%', padding: '10px 42px 10px 14px',
                    borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
                    background: 'var(--surface)', fontSize: 14, color: 'var(--text-1)',
                    fontFamily: 'var(--font-body)', outline: 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-3)', padding: 4, display: 'flex',
                  }}
                >
                  {/* H2: aria-hidden sur les icônes */}
                  {showPwd ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>

            {/* Submit (H1: opacity, H2: aria-hidden Loader2, M2: aria-busy, M3: transition sans transform) */}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              style={{
                marginTop: 4, padding: '11px 20px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--primary)',
                color: '#ffffff',
                fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5,
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', minHeight: 44,
                opacity: loading ? 0.65 : 1,
                transition: 'background 0.15s, opacity 0.15s',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(45,125,210,0.35)',
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = 'var(--primary-hover)' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = 'var(--primary)' }}
            >
              {loading && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <p style={{ marginTop: 28, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
            Accès réservé aux employés de Bridge Technologies Solutions
          </p>
        </div>
      </main>
    </div>
  )
}
