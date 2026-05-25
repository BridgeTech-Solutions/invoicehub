'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ChevronLeft } from 'lucide-react'
import { useForgotPassword, useResetPassword } from '@/features/auth/hooks'
import { ROUTES } from '@/lib/constants'
import { AuthLeftPanel } from '../_components/AuthLeftPanel'
import type { AxiosError } from 'axios'

// ─── Formulaire mot de passe oublié ────────────────────────────
function ForgotForm() {
  const [email, setEmail] = useState('')
  const [sent,  setSent]  = useState(false)
  const mutation  = useForgotPassword()
  const successRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sent) successRef.current?.focus()
  }, [sent])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(email, { onSuccess: () => setSent(true) })
  }

  if (sent) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        style={{
          display: 'flex', flexDirection: 'column', gap: 20,
          outline: 'none',
        }}
      >
        <div style={{
          padding: '16px 18px', borderRadius: 10,
          background: '#f0fdf4', border: '1.5px solid #bbf7d0',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <CheckCircle2 size={18} aria-hidden style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ margin: '0 0 5px', fontSize: 14, color: '#15803d', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              Email envoyé
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#166534', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
              Si un compte existe pour <strong>{email}</strong>, un lien de réinitialisation vous sera envoyé sous peu.
            </p>
          </div>
        </div>
        <Link
          href={ROUTES.LOGIN}
          style={{
            fontSize: 13, color: 'var(--primary)',
            textDecoration: 'none', fontFamily: 'var(--font-body)',
            fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 5,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <ChevronLeft size={14} aria-hidden />
          Retour à la connexion
        </Link>
      </div>
    )
  }

  const forgotError = mutation.isError
    ? ((mutation.error as AxiosError<{ message?: string }>)?.response?.data?.message ?? 'Une erreur est survenue.')
    : null

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <label htmlFor="forgot-email" style={{
          fontSize: 13.5, fontWeight: 600,
          color: '#374151', fontFamily: 'var(--font-display)',
        }}>
          Email professionnel
        </label>
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="nom@bts.cm"
          required
          autoComplete="email"
          className="auth-input"
          style={{ padding: '11px 14px' }}
        />
      </div>

      {forgotError && (
        <div role="alert" aria-live="assertive" style={{
          padding: '12px 14px', borderRadius: 8,
          background: '#fef2f2', border: '1.5px solid #fecaca',
          fontSize: 13.5, color: '#dc2626',
          fontFamily: 'var(--font-body)',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <AlertCircle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
          {forgotError}
        </div>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        className="auth-btn"
      >
        {mutation.isPending
          ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Envoi en cours…</>
          : 'Envoyer le lien de réinitialisation'
        }
      </button>
    </form>
  )
}

// ─── Formulaire nouveau mot de passe ───────────────────────────
function ResetForm({ token }: { token: string }) {
  const [pwd,      setPwd]      = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [validErr, setValidErr] = useState('')
  const mutation = useResetPassword()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pwd.length < 8)         { setValidErr('Minimum 8 caractères requis'); return }
    if (!/[A-Z]/.test(pwd))     { setValidErr('Au moins une lettre majuscule requise'); return }
    if (!/[0-9]/.test(pwd))     { setValidErr('Au moins un chiffre requis'); return }
    if (pwd !== confirm)         { setValidErr('Les mots de passe ne correspondent pas'); return }
    setValidErr('')
    mutation.mutate({ token, newPassword: pwd })
  }

  if (mutation.isSuccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{
          padding: '16px 18px', borderRadius: 10,
          background: '#f0fdf4', border: '1.5px solid #bbf7d0',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <CheckCircle2 size={18} aria-hidden style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ margin: '0 0 5px', fontSize: 14, color: '#15803d', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              Mot de passe réinitialisé
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#166534', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
              Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
            </p>
          </div>
        </div>
        <Link
          href={ROUTES.LOGIN}
          style={{
            fontSize: 13, color: 'var(--primary)',
            textDecoration: 'none', fontFamily: 'var(--font-body)',
            fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 5,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <ChevronLeft size={14} aria-hidden />
          Se connecter
        </Link>
      </div>
    )
  }

  const apiError = mutation.isError
    ? ((mutation.error as AxiosError<{ error?: string }>)?.response?.data?.error ?? 'Lien expiré ou invalide.')
    : null

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Nouveau mot de passe */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <label htmlFor="new-password" style={{
          fontSize: 13.5, fontWeight: 600,
          color: '#374151', fontFamily: 'var(--font-display)',
        }}>
          Nouveau mot de passe
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id="new-password"
            type={showPwd ? 'text' : 'password'}
            value={pwd}
            onChange={e => { setPwd(e.target.value); setValidErr('') }}
            placeholder="Min. 8 caractères · majuscule · chiffre"
            required
            autoComplete="new-password"
            className="auth-input"
            style={{ padding: '11px 44px 11px 14px' }}
          />
          <button
            type="button"
            onClick={() => setShowPwd(s => !s)}
            aria-label={showPwd ? 'Masquer' : 'Afficher'}
            style={{
              position: 'absolute', right: 12, top: '50%',
              transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#94a3b8', padding: 4, display: 'flex',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#475569')}
            onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
          >
            {showPwd ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        </div>
      </div>

      {/* Confirmer */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <label htmlFor="confirm-password" style={{
          fontSize: 13.5, fontWeight: 600,
          color: '#374151', fontFamily: 'var(--font-display)',
        }}>
          Confirmer le mot de passe
        </label>
        <input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={e => { setConfirm(e.target.value); setValidErr('') }}
          placeholder="••••••••"
          required
          autoComplete="new-password"
          className={`auth-input${validErr && confirm ? ' auth-input-error' : ''}`}
          style={{ padding: '11px 14px' }}
        />
      </div>

      {/* Erreur (validation ou API) */}
      {(validErr || apiError) && (
        <div role="alert" aria-live="assertive" style={{
          padding: '12px 14px', borderRadius: 8,
          background: '#fef2f2', border: '1.5px solid #fecaca',
          fontSize: 13.5, color: '#dc2626',
          fontFamily: 'var(--font-body)',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <AlertCircle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
          {validErr || apiError}
        </div>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        className="auth-btn"
      >
        {mutation.isPending
          ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Réinitialisation…</>
          : 'Réinitialiser le mot de passe'
        }
      </button>
    </form>
  )
}

// ─── Page principale ────────────────────────────────────────────
function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token')
  const [mounted,    setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <AuthLeftPanel />

      {/* ── Panneau droit ──────────────────────────────────────── */}
      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff',
        padding: '40px 24px',
        overflow: 'auto',
      }}>
        <div style={{
          width: '100%',
          maxWidth: 400,
          opacity:    mounted ? 1 : 0,
          transform:  mounted ? 'none' : 'translateY(18px)',
          transition: 'opacity 0.42s ease, transform 0.42s ease',
        }}>

          {/* En-tête */}
          <div style={{ marginBottom: 32 }}>
            {/* Badge contextuel */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '5px 12px', borderRadius: 100,
              background: token ? 'rgba(245,158,11,0.08)' : 'rgba(45,125,210,0.08)',
              border: `1.5px solid ${token ? 'rgba(245,158,11,0.22)' : 'rgba(45,125,210,0.18)'}`,
              marginBottom: 18,
            }}>
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: token ? '#d97706' : 'var(--primary)',
                fontFamily: 'var(--font-display)', letterSpacing: '0.02em',
              }}>
                {token ? 'Réinitialisation' : 'Mot de passe oublié'}
              </span>
            </div>

            <h1 style={{
              fontSize: 24, fontWeight: 800,
              fontFamily: 'var(--font-display)',
              color: '#0f172a', letterSpacing: '-0.025em',
              margin: '0 0 7px',
            }}>
              {token ? 'Nouveau mot de passe' : 'Mot de passe oublié ?'}
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0, fontFamily: 'var(--font-body)' }}>
              {token
                ? 'Choisissez un nouveau mot de passe sécurisé pour votre compte'
                : 'Saisissez votre email pour recevoir un lien de réinitialisation'
              }
            </p>
          </div>

          {token ? <ResetForm token={token} /> : <ForgotForm />}

          {/* Retour */}
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <Link
              href={ROUTES.LOGIN}
              style={{
                fontSize: 13, color: '#94a3b8',
                textDecoration: 'none', fontFamily: 'var(--font-body)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                minHeight: 44, transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#475569')}
              onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
            >
              <ChevronLeft size={14} aria-hidden />
              Retour à la connexion
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  )
}
