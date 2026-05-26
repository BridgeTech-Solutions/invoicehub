'use client'

import { CompanyLogo } from '@/components/ui/CompanyLogo'

// ─── Personnage SVG animé ──────────────────────────────────────
function AuthCharacter() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: 200, position: 'relative', zIndex: 1 }}>
      <svg
        viewBox="0 0 290 240"
        style={{ width: '100%', maxWidth: 270, display: 'block' }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Halo doux derrière le personnage */}
        <ellipse cx="145" cy="155" rx="68" ry="60" fill="rgba(45,125,210,0.07)" />

        {/* ── Carte facture flottante (droite) ── */}
        <g style={{ animation: 'authDocFloat 5.8s ease-in-out infinite', transformOrigin: '234px 80px' }}>
          <rect x="196" y="34" width="82" height="92" rx="10"
            fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.20)" strokeWidth="1" />
          {/* Entête carte */}
          <rect x="204" y="44" width="30" height="5" rx="2.5" fill="rgba(255,255,255,0.65)" />
          <rect x="204" y="55" width="62" height="3" rx="1.5" fill="rgba(255,255,255,0.22)" />
          <rect x="204" y="62" width="48" height="3" rx="1.5" fill="rgba(255,255,255,0.22)" />
          <rect x="204" y="69" width="54" height="3" rx="1.5" fill="rgba(255,255,255,0.22)" />
          {/* Montant */}
          <rect x="204" y="81" width="64" height="12" rx="5" fill="rgba(45,125,210,0.55)" />
          {/* Statut payé */}
          <rect x="204" y="99" width="48" height="14" rx="7" fill="rgba(16,185,129,0.75)" />
          <rect x="209" y="104" width="26" height="4" rx="2" fill="rgba(255,255,255,0.8)" />
          {/* Badge check */}
          <circle cx="268" cy="42" r="10" fill="rgba(16,185,129,0.9)" />
          <path d="M263 42 L266 45 L273 38" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* ── Widget graphique (gauche) ── */}
        <g style={{ animation: 'authChartFloat 5.2s ease-in-out 0.5s infinite', transformOrigin: '50px 80px' }}>
          <rect x="8" y="40" width="90" height="82" rx="10"
            fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.13)" strokeWidth="1" />
          <rect x="16" y="50" width="42" height="5" rx="2.5" fill="rgba(255,255,255,0.45)" />
          {/* Ligne de base */}
          <line x1="14" y1="112" x2="90" y2="112" stroke="rgba(255,255,255,0.13)" strokeWidth="1" />
          {/* Barre 1 — animation SMIL */}
          <rect x="18" y="112" width="16" height="0" rx="3" fill="#10b981" opacity="0.85">
            <animate attributeName="height" from="0" to="28" dur="0.65s" begin="0.7s" fill="freeze" />
            <animate attributeName="y" from="112" to="84" dur="0.65s" begin="0.7s" fill="freeze" />
          </rect>
          {/* Barre 2 */}
          <rect x="40" y="112" width="16" height="0" rx="3" fill="#2D7DD2" opacity="0.85">
            <animate attributeName="height" from="0" to="44" dur="0.65s" begin="1.0s" fill="freeze" />
            <animate attributeName="y" from="112" to="68" dur="0.65s" begin="1.0s" fill="freeze" />
          </rect>
          {/* Barre 3 */}
          <rect x="62" y="112" width="16" height="0" rx="3" fill="#f59e0b" opacity="0.85">
            <animate attributeName="height" from="0" to="34" dur="0.65s" begin="1.3s" fill="freeze" />
            <animate attributeName="y" from="112" to="78" dur="0.65s" begin="1.3s" fill="freeze" />
          </rect>
        </g>

        {/* ── Badge notification (haut centre, pulsant) ── */}
        <g style={{ animation: 'authNotifPulse 3.6s ease-in-out infinite', transformOrigin: '145px 16px' }}>
          <rect x="110" y="5" width="70" height="22" rx="11" fill="rgba(45,125,210,0.88)" />
          <circle cx="122" cy="16" r="5.5" fill="#ef4444" />
          <text x="122" y="19.5" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="sans-serif">3</text>
          <rect x="132" y="11" width="36" height="4" rx="2" fill="rgba(255,255,255,0.6)" />
          <rect x="132" y="17" width="24" height="3" rx="1.5" fill="rgba(255,255,255,0.32)" />
        </g>

        {/* ── Pièce XAF (bas gauche) ── */}
        <g style={{ animation: 'authCoinSpin 4.4s ease-in-out 0.8s infinite', transformOrigin: '28px 196px' }}>
          <circle cx="28" cy="196" r="16" fill="rgba(245,158,11,0.72)" />
          <circle cx="28" cy="196" r="12" fill="rgba(245,158,11,0.0)" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
          <text x="28" y="200" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" fontFamily="sans-serif">XAF</text>
        </g>
        <g style={{ animation: 'authCoinSpin 4.4s ease-in-out 1.3s infinite', transformOrigin: '54px 208px' }}>
          <circle cx="54" cy="208" r="11" fill="rgba(245,158,11,0.50)" />
          <text x="54" y="211.5" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold" fontFamily="sans-serif">XAF</text>
        </g>

        {/* ══ Personnage (groupe principal flottant) ══ */}
        <g style={{ animation: 'authCharBob 4.8s ease-in-out infinite' }}>
          {/* Ombre au sol */}
          <ellipse cx="145" cy="228" rx="40" ry="7" fill="rgba(0,0,0,0.13)" />

          {/* Jambes */}
          <rect x="130" y="188" width="13" height="38" rx="6" fill="#142d45" />
          <rect x="147" y="188" width="13" height="38" rx="6" fill="#142d45" />
          {/* Chaussures */}
          <ellipse cx="136" cy="226" rx="14" ry="5.5" fill="#0b1e30" />
          <ellipse cx="153" cy="226" rx="14" ry="5.5" fill="#0b1e30" />

          {/* Corps — costume */}
          <path d="M117 115 Q117 102 128 100 L145 100 L162 100 Q173 102 173 115 L174 190 Q145 196 116 190Z" fill="#1a3d5c" />
          {/* Revers gauche */}
          <path d="M117 115 L128 100 L136 116 Q126 110 117 118Z" fill="#112235" />
          {/* Revers droit */}
          <path d="M173 115 L162 100 L154 116 Q164 110 173 118Z" fill="#112235" />
          {/* Chemise */}
          <rect x="136" y="100" width="13" height="44" fill="rgba(255,255,255,0.93)" />
          {/* Cravate */}
          <polygon points="138,105 147,105 145,140 142.5,145 140,140" fill="#2D7DD2" />
          {/* Boutons de veste */}
          <circle cx="142" cy="152" r="2.2" fill="rgba(255,255,255,0.28)" />
          <circle cx="142" cy="162" r="2.2" fill="rgba(255,255,255,0.28)" />

          {/* Bras gauche */}
          <path d="M117 122 Q100 130 93 148" stroke="#1a3d5c" strokeWidth="18" strokeLinecap="round" fill="none" />
          <circle cx="92" cy="150" r="9.5" fill="#FDE4C8" />
          {/* Bras droit */}
          <path d="M173 122 Q190 130 196 145" stroke="#1a3d5c" strokeWidth="18" strokeLinecap="round" fill="none" />
          <circle cx="197" cy="147" r="9.5" fill="#FDE4C8" />

          {/* Cou */}
          <rect x="137" y="89" width="11" height="13" rx="3" fill="#FDE4C8" />

          {/* Tête */}
          <circle cx="142" cy="72" r="26" fill="#FDE4C8" />
          {/* Cheveux */}
          <path d="M116 67 Q142 37 168 67 Q161 46 142 42 Q123 46 116 67Z" fill="#2D3748" />
          {/* Oreilles */}
          <circle cx="116" cy="72" r="5.5" fill="#FDE4C8" />
          <circle cx="168" cy="72" r="5.5" fill="#FDE4C8" />
          {/* Yeux */}
          <circle cx="134" cy="70" r="3.8" fill="#2D3748" />
          <circle cx="150" cy="70" r="3.8" fill="#2D3748" />
          {/* Reflets yeux */}
          <circle cx="135.5" cy="68.5" r="1.3" fill="white" opacity="0.75" />
          <circle cx="151.5" cy="68.5" r="1.3" fill="white" opacity="0.75" />
          {/* Sourcils */}
          <path d="M129 64 Q134 61 139 64" stroke="#2D3748" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M145 64 Q150 61 155 64" stroke="#2D3748" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          {/* Sourire */}
          <path d="M134 80 Q142 87 150 80" stroke="#b86a4a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  )
}

// ─── Panneau gauche auth ───────────────────────────────────────
export function AuthLeftPanel() {
  return (
    <div className="auth-left-panel" style={{
      background: 'linear-gradient(155deg, #0f2d4a 0%, #0b2240 55%, #0d1f38 100%)',
      display: 'flex',
      flexDirection: 'column',
      padding: '44px 52px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Grille de fond */}
      <svg aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        opacity: 0.032, pointerEvents: 'none',
      }}>
        <defs>
          <pattern id="auth-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#auth-grid)" />
      </svg>

      {/* Lueur haute droite */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: -120, right: -120,
        width: 440, height: 440, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(45,125,210,0.20) 0%, transparent 62%)',
        pointerEvents: 'none',
      }} />
      {/* Lueur basse gauche */}
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: -80, left: -60,
        width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(45,125,210,0.09) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* ── Logo ──────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <CompanyLogo variant="white" height={32} alt="InvoiceHub" public style={{ opacity: 0.9 }} />
      </div>

      {/* ── Personnage animé ───────────────────────────── */}
      <AuthCharacter />

      {/* ── Tagline ────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h2 style={{
          fontSize: 'clamp(22px, 2vw, 32px)',
          fontWeight: 800,
          fontFamily: 'var(--font-display)',
          color: '#fff',
          lineHeight: 1.2,
          letterSpacing: '-0.03em',
          margin: '0 0 14px',
        }}>
          Pilotez toute votre<br />
          <span style={{ color: 'rgba(255,255,255,0.62)' }}>gestion financière</span><br />
          <span style={{ color: 'rgba(255,255,255,0.62)' }}>depuis un seul endroit.</span>
        </h2>
        <p style={{
          fontSize: 13.5,
          color: 'rgba(255,255,255,0.38)',
          lineHeight: 1.8,
          fontFamily: 'var(--font-body)',
          margin: 0,
          maxWidth: 310,
        }}>
          Centralisez votre activité, simplifiez vos finances et gardez le contrôle — où que vous soyez.
        </p>
      </div>

      {/* ── Footer ─────────────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 1,
        marginTop: 24,
        paddingTop: 18,
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <CompanyLogo variant="white" height={18} alt="" public style={{ opacity: 0.20 }} />
        <span style={{
          fontSize: 11.5,
          color: 'rgba(255,255,255,0.18)',
          fontFamily: 'var(--font-body)',
        }}>
          © 2026 Bridge Technologies Solutions
        </span>
      </div>
    </div>
  )
}
