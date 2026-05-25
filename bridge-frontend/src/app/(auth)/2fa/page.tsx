'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, AlertCircle, ChevronLeft } from 'lucide-react'
import { useLogin } from '@/features/auth/hooks'
import { useAuthStore } from '@/features/auth/store'
import { ROUTES } from '@/lib/constants'
import { AuthLeftPanel } from '../_components/AuthLeftPanel'

export default function TwoFAPage() {
  const router        = useRouter()
  const { user }      = useAuthStore()
  const loginMutation = useLogin()

  const [code,       setCode]       = useState(['', '', '', '', '', ''])
  const [useBackup,  setUseBackup]  = useState(false)
  const [backupCode, setBackupCode] = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [mounted,    setMounted]    = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    setMounted(true)
    if (!user && !sessionStorage.getItem('2fa_pending')) {
      router.replace(ROUTES.LOGIN)
    }
  }, [user, router])

  const handleDigit = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...code]
    next[index] = value
    setCode(next)
    setError('')
    if (value && index < 5) inputs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setCode(pasted.split(''))
      inputs.current[5]?.focus()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const totpToken = useBackup ? backupCode.trim().toUpperCase() : code.join('')
    const minLen    = useBackup ? 8 : 6

    if (!totpToken || totpToken.length < minLen) {
      setError(useBackup ? 'Le code de secours doit contenir 8 caractères' : 'Veuillez saisir le code complet')
      setLoading(false)
      return
    }

    const pending = sessionStorage.getItem('2fa_pending')
    if (!pending) { router.replace(ROUTES.LOGIN); return }

    const { email, password } = JSON.parse(pending)
    loginMutation.mutate(
      { email, password, totpToken },
      {
        onSuccess: () => { sessionStorage.removeItem('2fa_pending') },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          setError(msg ?? 'Code incorrect. Réessayez.')
          setLoading(false)
        },
      },
    )
  }

  const digitStyle = (digit: string, hasError: boolean): React.CSSProperties => ({
    width: 46, height: 54,
    textAlign: 'center',
    fontFamily: 'var(--font-display)',
    fontSize: 22, fontWeight: 700,
    color: '#0f172a',
    background: '#fff',
    border: `1.5px solid ${hasError ? '#ef4444' : digit ? 'var(--primary)' : '#e2e8f0'}`,
    borderRadius: 8,
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box',
    cursor: 'text',
  })

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
        <div style={{
          width: '100%',
          maxWidth: 400,
          opacity:    mounted ? 1 : 0,
          transform:  mounted ? 'none' : 'translateY(18px)',
          transition: 'opacity 0.42s ease, transform 0.42s ease',
        }}>

          {/* Badge 2FA */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '5px 12px', borderRadius: 100,
            background: 'rgba(45,125,210,0.08)',
            border: '1.5px solid rgba(45,125,210,0.18)',
            marginBottom: 22,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 6px rgba(16,185,129,0.5)',
            }} />
            <span style={{
              fontSize: 12, fontWeight: 600, color: 'var(--primary)',
              fontFamily: 'var(--font-display)', letterSpacing: '0.02em',
            }}>
              Authentification à deux facteurs
            </span>
          </div>

          {/* Titre */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{
              fontSize: 24, fontWeight: 800,
              fontFamily: 'var(--font-display)',
              color: '#0f172a', letterSpacing: '-0.025em',
              margin: '0 0 7px',
            }}>
              {useBackup ? 'Code de secours' : 'Vérification en deux étapes'}
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0, fontFamily: 'var(--font-body)' }}>
              {useBackup
                ? 'Saisissez un code de secours à 8 caractères'
                : 'Saisissez le code à 6 chiffres de votre application Authenticator'
              }
            </p>
          </div>

          {/* Erreur */}
          {error && (
            <div role="alert" aria-live="assertive" style={{
              marginBottom: 20,
              padding: '12px 14px',
              borderRadius: 8,
              background: '#fef2f2',
              border: '1.5px solid #fecaca',
              fontSize: 13.5, color: '#dc2626',
              fontFamily: 'var(--font-body)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <AlertCircle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

            {!useBackup ? (
              /* ── Chiffres OTP ───────────────────────────────────── */
              <div
                role="group"
                aria-label="Code à 6 chiffres"
                style={{ display: 'flex', gap: 8, justifyContent: 'center' }}
                onPaste={handlePaste}
              >
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { inputs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    autoFocus={i === 0}
                    aria-label={`Chiffre ${i + 1} sur 6`}
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    style={{
                      ...digitStyle(digit, !!error),
                      animationDelay: `${i * 0.04}s`,
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = 'var(--primary)'
                      e.target.style.boxShadow   = '0 0 0 3px rgba(45,125,210,0.13)'
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = error ? '#ef4444' : digit ? 'var(--primary)' : '#e2e8f0'
                      e.target.style.boxShadow   = 'none'
                    }}
                  />
                ))}
              </div>
            ) : (
              /* ── Code de secours ────────────────────────────────── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label htmlFor="backup-code" style={{
                  fontSize: 13.5, fontWeight: 600,
                  color: '#374151', fontFamily: 'var(--font-display)',
                }}>
                  Code de secours
                </label>
                <input
                  id="backup-code"
                  type="text"
                  value={backupCode}
                  onChange={e => { setBackupCode(e.target.value.toUpperCase()); setError('') }}
                  placeholder="XXXXXXXX"
                  autoFocus
                  autoComplete="off"
                  className="auth-input"
                  style={{
                    padding: '13px 14px',
                    fontSize: 20, fontWeight: 700,
                    letterSpacing: '0.2em', textAlign: 'center',
                    fontFamily: 'var(--font-display)',
                  }}
                />
              </div>
            )}

            {/* Valider */}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="auth-btn"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Vérification…</>
                : 'Vérifier'
              }
            </button>

            {/* Bascule code de secours */}
            <button
              type="button"
              onClick={() => { setUseBackup(b => !b); setError('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: 'var(--primary)',
                fontFamily: 'var(--font-body)', fontWeight: 500,
                minHeight: 44, display: 'flex', alignItems: 'center',
                justifyContent: 'center', transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              {useBackup
                ? 'Utiliser le code Authenticator'
                : 'Utiliser un code de secours'
              }
            </button>
          </form>

          {/* Retour */}
          <div style={{ marginTop: 24, textAlign: 'center' }}>
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
