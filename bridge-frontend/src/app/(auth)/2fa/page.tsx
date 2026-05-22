'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ChevronRight, ChevronLeft } from 'lucide-react'
import { useLogin } from '@/features/auth/hooks'
import { useAuthStore } from '@/features/auth/store'
import { ROUTES } from '@/lib/constants'
import { TerminalLeftPanel } from '../_components/TerminalLeftPanel'

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

  // ─── Shared styles pour les digits OTP ──────────────────────
  const digitStyle = (digit: string, hasError: boolean): React.CSSProperties => ({
    width: 46, height: 54,
    textAlign: 'center',
    fontFamily: 'var(--t-mono)',
    fontSize: 22, fontWeight: 700,
    color: '#E8F4FF',
    background: 'rgba(0,191,255,0.04)',
    border: `1px solid ${hasError ? 'rgba(255,107,107,0.5)' : digit ? 'rgba(0,191,255,0.5)' : 'rgba(0,191,255,0.18)'}`,
    borderRadius: 4,
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box' as const,
    cursor: 'text',
  })

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--t-noir)', overflow: 'hidden', position: 'relative' }}>
      <div className="t-scanline" aria-hidden="true" />

      {/* ── Panneau gauche ─────────────────────────────────────── */}
      <TerminalLeftPanel />

      {/* ── Panneau droit ──────────────────────────────────────── */}
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
            {/* Badge 2FA */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '5px 12px', borderRadius: 4,
              background: 'rgba(0,191,255,0.06)', border: '1px solid rgba(0,191,255,0.15)',
              marginBottom: 20,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--t-green)', boxShadow: '0 0 6px var(--t-green)', animation: 'live-pulse 2.2s ease-in-out infinite' }} />
              <span style={{ fontSize: 10, color: 'var(--t-electric)', fontFamily: 'var(--t-mono)', letterSpacing: '0.08em' }}>
                2FA · TOTP REQUIRED
              </span>
            </div>

            <h1 style={{
              fontFamily: 'var(--t-brico)', fontWeight: 700, fontSize: 22,
              color: '#E8F4FF', letterSpacing: '-0.02em', margin: '0 0 6px',
            }}>
              {useBackup ? 'Code de secours' : 'Vérification en deux étapes'}
            </h1>
            <p style={{ fontSize: 11.5, color: 'rgba(0,191,255,0.4)', margin: 0, fontFamily: 'var(--t-mono)', letterSpacing: '0.04em' }}>
              {useBackup
                ? 'SAISIR UN CODE DE SECOURS (8 CARACTÈRES)'
                : 'SAISIR LE CODE À 6 CHIFFRES · AUTHENTICATOR'
              }
            </p>
          </div>

          {/* Erreur */}
          {error && (
            <div role="alert" aria-live="assertive" style={{
              fontSize: 12, color: 'var(--t-red)', marginBottom: 18,
              background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.22)',
              borderRadius: 4, padding: '10px 14px', fontFamily: 'var(--t-mono)',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <span style={{ color: 'rgba(255,107,107,0.55)', fontWeight: 700, fontSize: 10, padding: '1px 5px', background: 'rgba(255,107,107,0.1)', borderRadius: 3, border: '1px solid rgba(255,107,107,0.2)', flexShrink: 0 }}>ERR</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {!useBackup ? (
              /* ── OTP digits ─────────────────────────────────── */
              <div
                role="group"
                aria-label="Code d'authentification à 6 chiffres"
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
                      animation: `otp-appear 0.3s ease ${i * 0.05}s both`,
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = 'var(--t-electric)'
                      e.target.style.boxShadow   = '0 0 0 2px rgba(0,191,255,0.12), 0 0 12px rgba(0,191,255,0.07)'
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = error ? 'rgba(255,107,107,0.5)' : digit ? 'rgba(0,191,255,0.5)' : 'rgba(0,191,255,0.18)'
                      e.target.style.boxShadow   = 'none'
                    }}
                  />
                ))}
              </div>
            ) : (
              /* ── Code de secours ────────────────────────────── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="backup-code" style={{
                  fontSize: 10, fontWeight: 500, color: 'rgba(0,191,255,0.48)',
                  fontFamily: 'var(--t-mono)', letterSpacing: '0.1em', textTransform: 'uppercase',
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
                  className="term-input"
                  style={{
                    padding: '13px 14px',
                    fontSize: 18, fontWeight: 700,
                    letterSpacing: '0.18em', textAlign: 'center',
                  }}
                />
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="term-btn"
              style={{
                padding: '12px 20px', borderRadius: 4,
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
                ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Vérification...</>
                : <><ChevronRight size={14} aria-hidden /> Vérifier</>
              }
            </button>

            {/* Toggle backup */}
            <button
              type="button"
              onClick={() => { setUseBackup(b => !b); setError('') }}
              className="term-btn-sec"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 11, color: 'rgba(0,191,255,0.38)',
                fontFamily: 'var(--t-mono)', letterSpacing: '0.04em',
                minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.15s', padding: '0 8px',
              }}
            >
              {useBackup ? '← utiliser le code authenticator' : '→ utiliser un code de secours'}
            </button>
          </form>

          {/* Retour */}
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <Link
              href={ROUTES.LOGIN}
              style={{
                fontSize: 11, color: 'rgba(255,255,255,0.2)', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: 'var(--t-mono)', minHeight: 44, transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(0,191,255,0.5)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
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
