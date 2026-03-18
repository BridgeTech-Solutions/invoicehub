'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, ChevronLeft, Mail, CheckCircle } from 'lucide-react'
import { useForgotPassword, useResetPassword } from '@/features/auth/hooks'
import { ROUTES } from '@/lib/constants'

// ─── Forgot password form ─────────────────────────────────────
function ForgotForm() {
  const [email, setEmail]   = useState('')
  const [sent, setSent]     = useState(false)
  const mutation = useForgotPassword()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(email, { onSuccess: () => setSent(true) })
  }

  if (sent) {
    return (
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="email" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
          Email professionnel
        </label>
        <div style={{ position: 'relative' }}>
          <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nom@bts.cm"
            required
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

      <button
        type="submit"
        disabled={mutation.isPending}
        style={{
          padding: '11px', borderRadius: 'var(--radius-md)',
          background: mutation.isPending ? '#93b8e0' : 'var(--primary)',
          color: '#fff', border: 'none', cursor: mutation.isPending ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
        Envoyer le lien de réinitialisation
      </button>
    </form>
  )
}

// ─── Reset password form (with token from URL) ────────────────
function ResetForm({ token }: { token: string }) {
  const [pwd, setPwd]           = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [validErr, setValidErr] = useState('')
  const mutation = useResetPassword()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pwd.length < 8) { setValidErr('Le mot de passe doit contenir au moins 8 caractères'); return }
    if (pwd !== confirm) { setValidErr('Les mots de passe ne correspondent pas'); return }
    setValidErr('')
    mutation.mutate({ token, newPassword: pwd })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* New password */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
          Nouveau mot de passe
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPwd ? 'text' : 'password'}
            value={pwd}
            onChange={(e) => { setPwd(e.target.value); setValidErr('') }}
            placeholder="Min. 8 caractères"
            required
            style={{
              width: '100%', padding: '10px 42px 10px 14px',
              borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
              background: 'var(--surface)', fontSize: 14, color: 'var(--text-1)',
              fontFamily: 'var(--font-body)', outline: 'none',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
          />
          <button type="button" onClick={() => setShowPwd((s) => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {/* Confirm */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
          Confirmer le mot de passe
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setValidErr('') }}
          placeholder="••••••••"
          required
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

      {validErr && <p style={{ fontSize: 13, color: 'var(--s-overdue)', marginTop: -8 }}>{validErr}</p>}

      <button
        type="submit"
        disabled={mutation.isPending}
        style={{
          padding: '11px', borderRadius: 'var(--radius-md)',
          background: mutation.isPending ? '#93b8e0' : 'var(--primary)',
          color: '#fff', border: 'none', cursor: mutation.isPending ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
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
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'var(--font-body)' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 24px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <img src="/logos/invoicehub.png" alt="InvoiceHub" style={{ height: 36, objectFit: 'contain' }} />
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

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <Link href={ROUTES.LOGIN} style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ChevronLeft size={14} />
            Retour à la connexion
          </Link>
        </div>
      </div>
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
