/* Terminal BTS — styles globaux partagés entre toutes les pages auth */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&display=swap');

        :root {
          --t-mono:    'JetBrains Mono', 'Fira Code', monospace;
          --t-brico:   'Bricolage Grotesque', sans-serif;
          --t-noir:    #070B11;
          --t-panel:   #0A0F1A;
          --t-mid:     #0D1420;
          --t-electric:#00BFFF;
          --t-green:   #00FF88;
          --t-amber:   #FFB800;
          --t-red:     #FF6B6B;
          --t-purple:  #A78BFA;
        }

        /* Input terminal */
        .term-input {
          background:  rgba(0,191,255,0.04) !important;
          border:      1px solid rgba(0,191,255,0.2) !important;
          color:       #E8F4FF !important;
          font-family: var(--t-mono) !important;
          font-size:   13px !important;
          outline:     none !important;
          transition:  border-color 0.15s, box-shadow 0.15s;
          width: 100%; box-sizing: border-box;
          border-radius: 4px;
        }
        .term-input::placeholder { color: rgba(0,191,255,0.25) !important; }
        .term-input:focus {
          border-color: var(--t-electric) !important;
          box-shadow:   0 0 0 2px rgba(0,191,255,0.12), 0 0 14px rgba(0,191,255,0.07) !important;
        }

        /* Bouton terminal */
        .term-btn:hover:not(:disabled) {
          background:  rgba(0,255,136,0.12) !important;
          border-color: var(--t-green) !important;
          color:        var(--t-green) !important;
          box-shadow:   0 0 18px rgba(0,255,136,0.18) !important;
        }

        /* Bouton secondaire terminal */
        .term-btn-sec:hover:not(:disabled) {
          background:  rgba(0,191,255,0.08) !important;
          color:       var(--t-electric) !important;
        }

        @keyframes term-in {
          from { opacity:0; transform:translateX(22px); }
          to   { opacity:1; transform:translateX(0);    }
        }
        @keyframes term-in-up {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:translateY(0);    }
        }
        @keyframes glow-pulse {
          0%,100% { text-shadow: 0 0 8px var(--t-electric), 0 0 22px rgba(0,191,255,0.28); }
          50%     { text-shadow: 0 0 4px var(--t-electric), 0 0 10px rgba(0,191,255,0.12); }
        }
        @keyframes scanline-move {
          from { transform: translateY(-100%); }
          to   { transform: translateY(100vh); }
        }
        @keyframes live-pulse {
          0%,100% { opacity:1; box-shadow: 0 0 7px var(--t-green); }
          50%     { opacity:.35; box-shadow: 0 0 2px var(--t-green); }
        }
        @keyframes otp-appear {
          from { opacity:0; transform:scale(.9) translateY(6px); }
          to   { opacity:1; transform:scale(1) translateY(0);    }
        }

        /* Panneau gauche caché en dessous de lg */
        .t-left-panel {
          width: 52%; flex-shrink: 0; min-width: 440px;
        }
        @media (max-width: 1023px) {
          .t-left-panel { display: none !important; }
        }

        /* Scanline globale */
        .t-scanline {
          position: fixed; left:0; right:0; height:2px;
          pointer-events:none; z-index:999;
          background: linear-gradient(90deg, transparent, rgba(0,191,255,0.1), transparent);
          animation: scanline-move 9s linear infinite;
        }
      `}</style>
      {children}
    </>
  )
}
