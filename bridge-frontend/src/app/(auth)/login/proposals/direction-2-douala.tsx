'use client'

/**
 * DIRECTION 2 — "DOUALA GOLD"
 * Immersion culturelle premium. Inspiré des textiles géométriques d'Afrique centrale.
 * Fond plein écran sombre avec pattern CSS génératif (aucune image requise).
 * Message : BTS est une entreprise camerounaise qui mérite une identité visuelle forte.
 * Font    : Cormorant Garamond (display élégant) + DM Sans (body moderne)
 * Palette : Forêt profonde #071A0E + Or chaud #C9941A + Crème #FAF6EE + Vert jade #00A878
 */

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useLogin } from '@/features/auth/hooks'
import { ROUTES } from '@/lib/constants'
import type { AxiosError } from 'axios'

const CAPABILITIES = [
  'Facturation SYSCOHADA',
  'Gestion des stocks',
  'Bons de commande',
  'Workflow d\'approbation',
  'Journaux d\'audit',
  'Tableau de bord KPI',
]

export default function LoginDouala() {
  const [showPwd, setShowPwd]     = useState(false)
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [mounted, setMounted]     = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const router       = useRouter()
  const loginMutation = useLogin()
  const timerRef     = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    setMounted(true)
    timerRef.current = setInterval(() => {
      setActiveIdx(i => (i + 1) % CAPABILITIES.length)
    }, 2200)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

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
    return e.response?.data?.error ?? 'Identifiants incorrects.'
  })()

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600&display=swap');

        :root {
          --cormorant: 'Cormorant Garamond', Georgia, serif;
          --dm: 'DM Sans', sans-serif;
          --gold: #C9941A;
          --gold-light: #E8B84B;
          --forest: #071A0E;
          --forest-mid: #0E2D1A;
          --cream: #FAF6EE;
          --jade: #00A878;
        }

        /* Pattern géométrique génératif — inspiré Kente / Adinkra */
        .douala-bg {
          background-color: var(--forest);
          background-image:
            /* Losanges dorés */
            repeating-linear-gradient(
              45deg,
              transparent,
              transparent 28px,
              rgba(201,148,26,0.07) 28px,
              rgba(201,148,26,0.07) 29px
            ),
            repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 28px,
              rgba(201,148,26,0.07) 28px,
              rgba(201,148,26,0.07) 29px
            ),
            /* Grille fine */
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 55px,
              rgba(201,148,26,0.04) 55px,
              rgba(201,148,26,0.04) 56px
            ),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 55px,
              rgba(201,148,26,0.04) 55px,
              rgba(201,148,26,0.04) 56px
            );
        }

        .douala-input {
          background: rgba(250,246,238,0.06) !important;
          border: 1.5px solid rgba(201,148,26,0.25) !important;
          color: var(--cream) !important;
          font-family: var(--dm) !important;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .douala-input::placeholder { color: rgba(250,246,238,0.3); }
        .douala-input:focus {
          border-color: var(--gold) !important;
          box-shadow: 0 0 0 3px rgba(201,148,26,0.15) !important;
        }

        @keyframes cap-in {
          from { opacity:0; transform: translateY(6px); }
          to   { opacity:1; transform: translateY(0); }
        }
        @keyframes cap-out {
          from { opacity:1; transform: translateY(0); }
          to   { opacity:0; transform: translateY(-6px); }
        }
        @keyframes gold-shimmer {
          0%   { background-position: -300% center; }
          100% { background-position:  300% center; }
        }
        @keyframes card-in {
          from { opacity:0; transform: translateY(32px) scale(0.97); }
          to   { opacity:1; transform: translateY(0)    scale(1); }
        }
        .douala-btn:hover:not(:disabled) {
          background: var(--gold-light) !important;
          box-shadow: 0 6px 24px rgba(201,148,26,0.45) !important;
        }
        .douala-forgot:hover { color: var(--gold-light) !important; }

        /* Trait décoratif Adinkra sur le card */
        .adinkra-border {
          position: relative;
        }
        .adinkra-border::before {
          content: '';
          position: absolute;
          top: 0; left: 50%; transform: translateX(-50%);
          width: 40px; height: 3px;
          background: linear-gradient(90deg, transparent, var(--gold), transparent);
          border-radius: 2px;
        }
      `}</style>

      {/* Fond plein écran avec pattern */}
      <div className="douala-bg" style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--dm)', padding: '24px 16px',
        position: 'relative', overflow: 'hidden',
      }}>

        {/* Glow central ambre */}
        <div style={{
          position: 'absolute', top: '30%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(201,148,26,0.08) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        {/* Glow coin bas-droit jade */}
        <div style={{
          position: 'absolute', bottom: -100, right: -100,
          width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(0,168,120,0.1) 0%, transparent 60%)',
          pointerEvents: 'none',
        }} />

        {/* ── En-tête ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          marginBottom: 40, position: 'relative', zIndex: 1,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'none' : 'translateY(-12px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}>
          <img src="/logos/invoicehub.png" alt="InvoiceHub"
            style={{ height: 44, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9, marginBottom: 16 }} />

          {/* Titre principal en Cormorant */}
          <h1 style={{
            fontFamily: 'var(--cormorant)', fontWeight: 700,
            fontSize: 'clamp(32px, 5vw, 52px)',
            lineHeight: 1.1, letterSpacing: '-0.01em',
            margin: '0 0 8px', textAlign: 'center',
            color: 'var(--cream)',
          }}>
            L'entreprise,{' '}
            <em style={{
              fontStyle: 'italic',
              background: 'linear-gradient(90deg, #C9941A, #E8B84B, #C9941A)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              animation: 'gold-shimmer 4s linear infinite',
            }}>
              maîtrisée.
            </em>
          </h1>

          {/* Capacité tournante */}
          <div style={{ height: 24, overflow: 'hidden', position: 'relative', minWidth: 280, textAlign: 'center' }}>
            {CAPABILITIES.map((cap, i) => (
              <p key={cap} style={{
                margin: 0, fontSize: 13.5,
                color: i === activeIdx ? 'rgba(201,148,26,0.9)' : 'transparent',
                fontFamily: 'var(--dm)', fontWeight: 500, letterSpacing: '0.04em',
                position: 'absolute', width: '100%', left: 0,
                transition: 'opacity 0.35s ease, transform 0.35s ease',
                opacity: i === activeIdx ? 1 : 0,
                transform: i === activeIdx ? 'translateY(0)' : 'translateY(-8px)',
              }}>
                {cap}
              </p>
            ))}
          </div>
        </div>

        {/* ── Card formulaire ── */}
        <div
          className="adinkra-border"
          style={{
            width: '100%', maxWidth: 420,
            background: 'rgba(14,45,26,0.7)',
            border: '1px solid rgba(201,148,26,0.2)',
            borderRadius: 16,
            padding: '40px 36px 36px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(201,148,26,0.15)',
            position: 'relative', zIndex: 1,
            opacity: mounted ? 1 : 0,
            animation: mounted ? 'card-in 0.55s cubic-bezier(0.22,1,0.36,1) both' : 'none',
            animationDelay: '0.1s',
          }}
        >
          <div style={{ marginBottom: 28 }}>
            <h2 style={{
              fontFamily: 'var(--cormorant)', fontWeight: 600, fontSize: 24,
              color: 'var(--cream)', margin: '0 0 6px', letterSpacing: '-0.01em',
            }}>
              Connexion
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(250,246,238,0.4)', margin: 0, fontFamily: 'var(--dm)' }}>
              Espace réservé aux collaborateurs BTS
            </p>
          </div>

          {loginError && (
            <div role="alert" style={{
              fontSize: 13, color: '#FCA5A5', marginBottom: 18,
              background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)',
              borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--dm)',
            }}>
              {loginError}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="email-d" style={{ fontSize: 12.5, fontWeight: 500, color: 'rgba(250,246,238,0.6)', fontFamily: 'var(--dm)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Email professionnel
              </label>
              <input id="email-d" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="nom@bts.cm" required autoComplete="email"
                className="douala-input"
                style={{ padding: '11px 14px', borderRadius: 8, fontSize: 14, width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="pwd-d" style={{ fontSize: 12.5, fontWeight: 500, color: 'rgba(250,246,238,0.6)', fontFamily: 'var(--dm)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Mot de passe
                </label>
                <Link href="/reset-password" className="douala-forgot"
                  style={{ fontSize: 12, color: 'rgba(201,148,26,0.7)', textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center', transition: 'color 0.15s' }}>
                  Oublié ?
                </Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input id="pwd-d" type={showPwd ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password"
                  className="douala-input"
                  style={{ padding: '11px 44px 11px 14px', borderRadius: 8, fontSize: 14, width: '100%', boxSizing: 'border-box' }}
                />
                <button type="button" onClick={() => setShowPwd(s => !s)}
                  aria-label={showPwd ? 'Masquer' : 'Afficher'}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(250,246,238,0.35)', padding: 4 }}>
                  {showPwd ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} aria-busy={loading}
              className="douala-btn"
              style={{
                marginTop: 8, padding: '13px 20px', borderRadius: 8,
                background: 'var(--gold)', color: 'var(--forest)',
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--dm)', fontWeight: 600, fontSize: 14.5,
                width: '100%', minHeight: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 20px rgba(201,148,26,0.3)',
                transition: 'background 0.2s, box-shadow 0.2s',
                opacity: loading ? 0.65 : 1,
              }}>
              {loading && <Loader2 size={15} className="animate-spin" aria-hidden />}
              {loading ? 'Connexion...' : 'Accéder à la plateforme'}
            </button>
          </form>

          {/* Séparateur décoratif */}
          <div style={{ margin: '24px 0 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(201,148,26,0.12)' }} />
            <span style={{ fontSize: 10, color: 'rgba(250,246,238,0.2)', letterSpacing: '0.1em', fontFamily: 'var(--dm)' }}>
              BTS · SYSCOHADA · 2026
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(201,148,26,0.12)' }} />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 28, display: 'flex', alignItems: 'center', gap: 8,
          position: 'relative', zIndex: 1,
          opacity: mounted ? 0.4 : 0, transition: 'opacity 0.5s ease 0.4s',
        }}>
          <img src="/logos/logo-bts-white.png" alt="" aria-hidden
            style={{ height: 22, filter: 'brightness(0) invert(1)', opacity: 0.6 }} />
          <span style={{ fontSize: 11, color: 'rgba(250,246,238,0.5)', fontFamily: 'var(--dm)' }}>
            © 2026 Bridge Technologies Solutions — Douala, Cameroun
          </span>
        </div>
      </div>
    </>
  )
}
