'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ShieldCheck, ChevronLeft } from 'lucide-react'
import { useLogin } from '@/features/auth/hooks'
import { useAuthStore } from '@/features/auth/store'
import { CompanyLogo } from '@/components/ui/CompanyLogo'
import { ROUTES } from '@/lib/constants'

export default function TwoFAPage() {
  const router   = useRouter()
  const { user } = useAuthStore()
  const loginMutation = useLogin()

  const [code, setCode]             = useState(['', '', '', '', '', ''])
  const [useBackup, setUseBackup]   = useState(false)
  const [backupCode, setBackupCode] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  // Si pas de session en cours de 2FA → retour login
  useEffect(() => {
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

    const minLen = useBackup ? 8 : 6
    if (!totpToken || totpToken.length < minLen) {
      setError(useBackup ? 'Le code de secours doit contenir 8 caractères' : 'Veuillez saisir le code complet')
      setLoading(false)
      return
    }

    const pending = sessionStorage.getItem('2fa_pending')
    if (!pending) {
      router.replace(ROUTES.LOGIN)
      return
    }

    const { email, password } = JSON.parse(pending)
    loginMutation.mutate(
      { email, password, totpToken },
      {
        onSuccess: () => { sessionStorage.removeItem('2fa_pending') },
        onError:   (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })
            ?.response?.data?.error
          setError(msg ?? 'Code incorrect. Réessayez.')
          setLoading(false)
        },
      },
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: 'var(--font-body)' }}>
      <main style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <CompanyLogo variant="blue" height={36} alt="InvoiceHub" public />
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '36px 32px' }}>

          {/* Icône décorative (C4: aria-hidden) */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'rgba(45,125,210,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
              aria-hidden="true"
            >
              <ShieldCheck size={24} style={{ color: 'var(--primary)' }} />
            </div>
          </div>

          <h1 className="font-display" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', textAlign: 'center', marginBottom: 8 }}>
            Vérification en deux étapes
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-3)', textAlign: 'center', marginBottom: 28 }}>
            {useBackup
              ? 'Saisissez un de vos codes de secours'
              : 'Saisissez le code à 6 chiffres de votre application authenticator'
            }
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!useBackup ? (
              /* ── Chiffres TOTP (C1: aria-label par chiffre + autocomplete) ── */
              <div
                role="group"
                aria-label="Code d'authentification à 6 chiffres"
                style={{ display: 'flex', gap: 8, justifyContent: 'center' }}
                onPaste={handlePaste}
              >
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigit(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    autoFocus={i === 0}
                    aria-label={`Chiffre ${i + 1} sur 6`}
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    style={{
                      width: 48, height: 56,
                      textAlign: 'center',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 22, fontWeight: 600,
                      color: 'var(--text-1)',
                      border: `1.5px solid ${error ? 'var(--s-overdue)' : digit ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface)',
                      outline: 'none',
                      transition: 'border-color 0.15s',
                    }}
                  />
                ))}
              </div>
            ) : (
              /* ── Code de secours (C2: label + aria-label) ───────── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label
                  htmlFor="backup-code"
                  style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}
                >
                  Code de secours
                </label>
                <input
                  id="backup-code"
                  type="text"
                  value={backupCode}
                  onChange={(e) => { setBackupCode(e.target.value.toUpperCase()); setError('') }}
                  placeholder="XXXXXXXX"
                  autoFocus
                  autoComplete="off"
                  style={{
                    padding: '11px 14px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 16, fontWeight: 600,
                    letterSpacing: '0.15em',
                    textAlign: 'center',
                    border: `1.5px solid ${error ? 'var(--s-overdue)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface)',
                    outline: 'none',
                    color: 'var(--text-1)',
                  }}
                />
              </div>
            )}

            {/* Erreur (C3: role="alert" + aria-live) */}
            {error && (
              <p
                role="alert"
                aria-live="assertive"
                style={{ fontSize: 13, color: 'var(--s-overdue)', textAlign: 'center', marginTop: -8 }}
              >
                {error}
              </p>
            )}

            {/* Submit (H1: opacity, C4: aria-hidden Loader2, M1: aria-busy) */}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              style={{
                padding: '11px', borderRadius: 'var(--radius-md)',
                background: 'var(--primary)',
                color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                minHeight: 44,
                opacity: loading ? 0.65 : 1,
                boxShadow: loading ? 'none' : '0 4px 14px rgba(45,125,210,0.3)',
                transition: 'opacity 0.15s, background 0.15s',
              }}
            >
              {loading && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              Vérifier
            </button>

            {/* Toggle backup codes (H2: minHeight: 44) */}
            <button
              type="button"
              onClick={() => { setUseBackup((b) => !b); setError('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: 'var(--primary)', textDecoration: 'underline',
                fontFamily: 'var(--font-body)',
                minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {useBackup ? 'Utiliser le code authenticator' : 'Utiliser un code de secours'}
            </button>
          </form>
        </div>

        {/* Retour (C4: aria-hidden ChevronLeft) */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <Link
            href={ROUTES.LOGIN}
            style={{
              fontSize: 13, color: 'var(--text-3)', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              minHeight: 44,
            }}
          >
            <ChevronLeft size={14} aria-hidden="true" />
            Retour à la connexion
          </Link>
        </div>
      </main>
    </div>
  )
}
