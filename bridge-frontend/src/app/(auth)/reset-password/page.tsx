'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, ChevronLeft, Mail, CheckCircle } from 'lucide-react'
import { useForgotPassword, useResetPassword } from '@/features/auth/hooks'
import { ROUTES } from '@/lib/constants'
import { CompanyLogo } from '@/components/ui/CompanyLogo'
import type { AxiosError } from 'axios'

// ─── Forgot password form ─────────────────────────────────────

function ForgotForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent]   = useState(false)
  const mutation          = useForgotPassword()
  // H5: focus management sur la transition vers l'état "sent"
  const successRef        = useRef<HTMLDivElement>(null)

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
        style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, outline: 'none' }}
      >
        {/* H4: CheckCircle décoratif */}
        <div
          aria-hidden="true"
          style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <CheckCircle size={24} style={{ color: '#10b981' }} />
        </div>
        <div>
          <p className="font-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>Email envoyé</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-3)', maxWidth: 280, lineHeight: 1.6 }}>
            Si un compte existe pour <strong>{email}</strong>, vous recevrez un lien de réinitialisation dans quelques minutes.
          </p>
        </div>
        <Link href={ROUTES.LOGIN} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
          Retour à la connexion
        </Link>
      </div>
    )
  }

  // C4: erreur mutation de la ForgotForm
  const forgotError = mutation.isError
    ? ((mutation.error as AxiosError<{ message?: string }>)?.response?.data?.message ?? 'Une erreur est survenue. Veuillez réessayer.')
    : null

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="forgot-email" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
          Email professionnel
        </label>
        <div style={{ position: 'relative' }}>
          {/* H4: Mail décoratif */}
          <Mail size={15} aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nom@bts.cm"
            required
            autoComplete="email"
            style={{
              width: '100%', padding: '10px 14px 10px 36px',
              borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
              background: 'var(--surface)', fontSize: 14, color: 'var(--text-1)',
              fontFamily: 'var(--font-body)', outline: 'none',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
          />
        </div>
      </div>

      {/* C4: affichage de l'erreur mutation */}
      {forgotError && (
        <p role="alert" aria-live="assertive" style={{ fontSize: 13, color: 'var(--s-overdue)', margin: '-4px 0 0' }}>
          {forgotError}
        </p>
      )}

      {/* H1: opacity, H3: minHeight, H4: aria-hidden Loader2 */}
      <button
        type="submit"
        disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        style={{
          padding: '11px', borderRadius: 'var(--radius-md)',
          background: 'var(--primary)',
          color: '#fff', border: 'none', cursor: mutation.isPending ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          minHeight: 44,
          opacity: mutation.isPending ? 0.65 : 1,
          transition: 'opacity 0.15s, background 0.15s',
        }}
      >
        {mutation.isPending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
        Envoyer le lien de réinitialisation
      </button>
    </form>
  )
}

// ─── Reset password form ──────────────────────────────────────

function ResetForm({ token }: { token: string }) {
  const [pwd, setPwd]           = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [validErr, setValidErr] = useState('')
  const mutation = useResetPassword()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pwd.length < 8) { setValidErr('Le mot de passe doit contenir au moins 8 caractères'); return }
    if (!/[A-Z]/.test(pwd)) { setValidErr('Le mot de passe doit contenir au moins une majuscule'); return }
    if (!/[0-9]/.test(pwd)) { setValidErr('Le mot de passe doit contenir au moins un chiffre'); return }
    if (pwd !== confirm) { setValidErr('Les mots de passe ne correspondent pas'); return }
    setValidErr('')
    mutation.mutate({ token, newPassword: pwd })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Nouveau mot de passe (C1: htmlFor + id, H2: autocomplete) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="new-password" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
          Nouveau mot de passe
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id="new-password"
            type={showPwd ? 'text' : 'password'}
            value={pwd}
            onChange={(e) => { setPwd(e.target.value); setValidErr('') }}
            placeholder="Min. 8 caractères"
            required
            autoComplete="new-password"
            style={{
              width: '100%', padding: '10px 42px 10px 14px',
              borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
              background: 'var(--surface)', fontSize: 14, color: 'var(--text-1)',
              fontFamily: 'var(--font-body)', outline: 'none',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
          />
          {/* C2: aria-label sur Eye/EyeOff */}
          <button
            type="button"
            onClick={() => setShowPwd((s) => !s)}
            aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}
          >
            {/* H4: aria-hidden */}
            {showPwd ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Confirmer (C1: htmlFor + id, H2: autocomplete) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="confirm-password" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
          Confirmer le mot de passe
        </label>
        <input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setValidErr('') }}
          placeholder="••••••••"
          required
          autoComplete="new-password"
          style={{
            width: '100%', padding: '10px 14px',
            borderRadius: 'var(--radius-md)', border: `1.5px solid ${validErr && confirm ? 'var(--s-overdue)' : 'var(--border)'}`,
            background: 'var(--surface)', fontSize: 14, color: 'var(--text-1)',
            fontFamily: 'var(--font-body)', outline: 'none',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)' }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
        />
      </div>

      {/* C3: role="alert" sur l'erreur de validation */}
      {validErr && (
        <p role="alert" aria-live="assertive" style={{ fontSize: 13, color: 'var(--s-overdue)', marginTop: -8 }}>
          {validErr}
        </p>
      )}

      {/* H1: opacity, H3: minHeight, H4: aria-hidden Loader2 */}
      <button
        type="submit"
        disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        style={{
          padding: '11px', borderRadius: 'var(--radius-md)',
          background: 'var(--primary)',
          color: '#fff', border: 'none', cursor: mutation.isPending ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          minHeight: 44,
          opacity: mutation.isPending ? 0.65 : 1,
          transition: 'opacity 0.15s, background 0.15s',
        }}
      >
        {mutation.isPending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
        Réinitialiser le mot de passe
      </button>
    </form>
  )
}

// ─── Main page ────────────────────────────────────────────────

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: 'var(--font-body)' }}>
      {/* H6: <main> landmark */}
      <main style={{ width: '100%', maxWidth: 400, padding: '0 24px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <CompanyLogo variant="blue" height={36} alt="InvoiceHub" public />
        </div>

        <div className="card" style={{ padding: '32px 28px' }}>
          <div style={{ marginBottom: 24 }}>
            <h1 className="font-display" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>
              {token ? 'Nouveau mot de passe' : 'Mot de passe oublié'}
            </h1>
            <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
              {token
                ? 'Choisissez un nouveau mot de passe sécurisé'
                : 'Saisissez votre email pour recevoir un lien de réinitialisation'
              }
            </p>
          </div>

          {token ? <ResetForm token={token} /> : <ForgotForm />}
        </div>

        {/* Retour (H4: aria-hidden ChevronLeft) */}
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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  )
}
