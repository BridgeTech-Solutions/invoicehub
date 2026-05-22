'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, ChevronRight, ChevronLeft } from 'lucide-react'
import { useForgotPassword, useResetPassword } from '@/features/auth/hooks'
import { ROUTES } from '@/lib/constants'
import { TerminalLeftPanel } from '../_components/TerminalLeftPanel'
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
          display: 'flex', flexDirection: 'column', gap: 18,
          outline: 'none', animation: 'term-in-up 0.35s ease both',
        }}
      >
        {/* Status OK terminal */}
        <div style={{
          padding: '14px 18px', borderRadius: 4,
          background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <span style={{
            color: 'var(--t-green)', fontWeight: 700, fontSize: 10,
            padding: '1px 6px', background: 'rgba(0,255,136,0.1)',
            borderRadius: 3, border: '1px solid rgba(0,255,136,0.2)',
            flexShrink: 0, fontFamily: 'var(--t-mono)',
          }}>OK</span>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#E8F4FF', fontFamily: 'var(--t-mono)', fontWeight: 600 }}>
              Email envoyé
            </p>
            <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, fontFamily: 'var(--t-mono)' }}>
              Si un compte existe pour <span style={{ color: 'var(--t-electric)' }}>{email}</span>,
              un lien de réinitialisation sera envoyé dans quelques minutes.
            </p>
          </div>
        </div>

        <Link
          href={ROUTES.LOGIN}
          style={{
            fontSize: 11, color: 'rgba(0,191,255,0.45)', textDecoration: 'none',
            fontFamily: 'var(--t-mono)', letterSpacing: '0.04em',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--t-electric)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,191,255,0.45)')}
        >
          <ChevronLeft size={12} aria-hidden />
          retour connexion
        </Link>
      </div>
    )
  }

  const forgotError = mutation.isError
    ? ((mutation.error as AxiosError<{ message?: string }>)?.response?.data?.message ?? 'Une erreur est survenue.')
    : null

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="forgot-email" style={{
          fontSize: 10, fontWeight: 500, color: 'rgba(0,191,255,0.48)',
          fontFamily: 'var(--t-mono)', letterSpacing: '0.1em', textTransform: 'uppercase',
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
          className="term-input"
          style={{ padding: '11px 14px' }}
        />
      </div>

      {forgotError && (
        <div role="alert" aria-live="assertive" style={{
          fontSize: 12, color: 'var(--t-red)',
          background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.22)',
          borderRadius: 4, padding: '10px 14px', fontFamily: 'var(--t-mono)',
          display: 'flex', gap: 10,
        }}>
          <span style={{ color: 'rgba(255,107,107,0.55)', fontWeight: 700, fontSize: 10, padding: '1px 5px', background: 'rgba(255,107,107,0.1)', borderRadius: 3, border: '1px solid rgba(255,107,107,0.2)', flexShrink: 0 }}>ERR</span>
          {forgotError}
        </div>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        className="term-btn"
        style={{
          marginTop: 6, padding: '12px 20px', borderRadius: 4,
          background: 'rgba(0,191,255,0.07)',
          color: 'var(--t-electric)',
          border: '1px solid rgba(0,191,255,0.28)',
          cursor: mutation.isPending ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--t-mono)', fontWeight: 700, fontSize: 12.5,
          width: '100%', minHeight: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          transition: 'all 0.2s ease',
          opacity: mutation.isPending ? 0.6 : 1,
        }}
      >
        {mutation.isPending
          ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Envoi...</>
          : <><ChevronRight size={14} aria-hidden /> Envoyer le lien</>
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
    if (pwd.length < 8)         { setValidErr('Minimum 8 caractères'); return }
    if (!/[A-Z]/.test(pwd))     { setValidErr('Au moins une majuscule requise'); return }
    if (!/[0-9]/.test(pwd))     { setValidErr('Au moins un chiffre requis'); return }
    if (pwd !== confirm)         { setValidErr('Les mots de passe ne correspondent pas'); return }
    setValidErr('')
    mutation.mutate({ token, newPassword: pwd })
  }

  if (mutation.isSuccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, animation: 'term-in-up 0.35s ease both' }}>
        <div style={{
          padding: '14px 18px', borderRadius: 4,
          background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <span style={{
            color: 'var(--t-green)', fontWeight: 700, fontSize: 10,
            padding: '1px 6px', background: 'rgba(0,255,136,0.1)',
            borderRadius: 3, border: '1px solid rgba(0,255,136,0.2)',
            flexShrink: 0, fontFamily: 'var(--t-mono)',
          }}>OK</span>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#E8F4FF', fontFamily: 'var(--t-mono)', fontWeight: 600 }}>
              Mot de passe réinitialisé
            </p>
            <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, fontFamily: 'var(--t-mono)' }}>
              Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
            </p>
          </div>
        </div>
        <Link
          href={ROUTES.LOGIN}
          style={{
            fontSize: 11, color: 'rgba(0,191,255,0.45)', textDecoration: 'none',
            fontFamily: 'var(--t-mono)', letterSpacing: '0.04em',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--t-electric)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,191,255,0.45)')}
        >
          <ChevronLeft size={12} aria-hidden />
          retour connexion
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="new-password" style={{
          fontSize: 10, fontWeight: 500, color: 'rgba(0,191,255,0.48)',
          fontFamily: 'var(--t-mono)', letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          Nouveau mot de passe
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id="new-password"
            type={showPwd ? 'text' : 'password'}
            value={pwd}
            onChange={e => { setPwd(e.target.value); setValidErr('') }}
            placeholder="Min. 8 car. · majuscule · chiffre"
            required
            autoComplete="new-password"
            className="term-input"
            style={{ padding: '11px 44px 11px 14px' }}
          />
          <button
            type="button"
            onClick={() => setShowPwd(s => !s)}
            aria-label={showPwd ? 'Masquer' : 'Afficher'}
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="confirm-password" style={{
          fontSize: 10, fontWeight: 500, color: 'rgba(0,191,255,0.48)',
          fontFamily: 'var(--t-mono)', letterSpacing: '0.1em', textTransform: 'uppercase',
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
          className="term-input"
          style={{
            padding: '11px 14px',
            borderColor: validErr && confirm ? 'rgba(255,107,107,0.45) !important' : undefined,
          }}
        />
      </div>

      {validErr && (
        <div role="alert" aria-live="assertive" style={{
          fontSize: 12, color: 'var(--t-red)',
          background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.22)',
          borderRadius: 4, padding: '10px 14px', fontFamily: 'var(--t-mono)',
          display: 'flex', gap: 10,
        }}>
          <span style={{ color: 'rgba(255,107,107,0.55)', fontWeight: 700, fontSize: 10, padding: '1px 5px', background: 'rgba(255,107,107,0.1)', borderRadius: 3, border: '1px solid rgba(255,107,107,0.2)', flexShrink: 0 }}>WARN</span>
          {validErr}
        </div>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        className="term-btn"
        style={{
          marginTop: 6, padding: '12px 20px', borderRadius: 4,
          background: 'rgba(0,191,255,0.07)',
          color: 'var(--t-electric)',
          border: '1px solid rgba(0,191,255,0.28)',
          cursor: mutation.isPending ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--t-mono)', fontWeight: 700, fontSize: 12.5,
          width: '100%', minHeight: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          transition: 'all 0.2s ease',
          opacity: mutation.isPending ? 0.6 : 1,
        }}
      >
        {mutation.isPending
          ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Réinitialisation...</>
          : <><ChevronRight size={14} aria-hidden /> Réinitialiser</>
        }
      </button>
    </form>
  )
}

// ─── Page principale ────────────────────────────────────────────
function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token')
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--t-noir)', overflow: 'hidden', position: 'relative' }}>
      <div className="t-scanline" aria-hidden="true" />

      <TerminalLeftPanel />

      <main style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--t-noir)', padding: '40px 24px', position: 'relative',
      }}>
        <div aria-hidden style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 360, height: 360, pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(0,191,255,0.04) 0%, transparent 65%)',
        }} />

        <div style={{
          width: '100%', maxWidth: 360, position: 'relative', zIndex: 1,
          opacity:   mounted ? 1 : 0,
          animation: mounted ? 'term-in 0.5s cubic-bezier(0.22,1,0.36,1) 0.12s both' : 'none',
        }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '5px 12px', borderRadius: 4,
              background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)',
              marginBottom: 20,
            }}>
              <span style={{ fontSize: 10, color: 'var(--t-amber)', fontFamily: 'var(--t-mono)', letterSpacing: '0.08em' }}>
                AUTH · RESET PASSWORD
              </span>
            </div>

            <h1 style={{
              fontFamily: 'var(--t-brico)', fontWeight: 700, fontSize: 22,
              color: '#E8F4FF', letterSpacing: '-0.02em', margin: '0 0 6px',
            }}>
              {token ? 'Nouveau mot de passe' : 'Mot de passe oublié'}
            </h1>
            <p style={{ fontSize: 11.5, color: 'rgba(0,191,255,0.4)', margin: 0, fontFamily: 'var(--t-mono)', letterSpacing: '0.04em' }}>
              {token
                ? 'DÉFINIR UN NOUVEAU MOT DE PASSE SÉCURISÉ'
                : 'SAISIR L\'EMAIL · LIEN DE RÉINITIALISATION'
              }
            </p>
          </div>

          {token ? <ResetForm token={token} /> : <ForgotForm />}

          {/* Retour */}
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <Link
              href={ROUTES.LOGIN}
              style={{
                fontSize: 11, color: 'rgba(255,255,255,0.18)', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: 'var(--t-mono)', minHeight: 44, transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(0,191,255,0.5)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.18)')}
            >
              <ChevronLeft size={12} aria-hidden />
              retour connexion
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
