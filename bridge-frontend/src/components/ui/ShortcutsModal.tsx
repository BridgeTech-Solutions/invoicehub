'use client'

/**
 * ShortcutsModal — modale d'aide aux raccourcis clavier.
 * Ouverte via la touche ? ou un bouton dans l'UI.
 * Fermée via Escape, clic sur l'overlay, ou le bouton ✕.
 */

import { useEffect } from 'react'
import { X, Keyboard } from 'lucide-react'

// ─── Style partagé pour les badges kbd ───────────────────────
const kbdStyle: React.CSSProperties = {
  display:        'inline-flex',
  alignItems:     'center',
  justifyContent: 'center',
  minWidth:        26,
  height:          22,
  padding:        '0 6px',
  fontSize:        11,
  fontFamily:     'var(--font-mono)',
  fontWeight:      700,
  color:          'var(--text-1)',
  background:     'var(--surface-2)',
  border:         '1.5px solid var(--border)',
  borderRadius:    5,
  boxShadow:      '0 1px 0 var(--border)',
  whiteSpace:     'nowrap' as const,
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd style={kbdStyle}>{children}</kbd>
}

function ChordKbd({ first, second }: { first: string; second: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <Kbd>{first}</Kbd>
      <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>puis</span>
      <Kbd>{second}</Kbd>
    </span>
  )
}

// ─── Ligne de raccourci ───────────────────────────────────────
function ShortcutRow({ keys, label }: { keys: React.ReactNode; label: string }) {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      padding:        '7px 0',
      borderBottom:   '1px solid var(--border)',
      gap:             12,
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
        {label}
      </span>
      <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {keys}
      </span>
    </div>
  )
}

// ─── Section groupe ───────────────────────────────────────────
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{
        fontSize:      10.5,
        fontWeight:     700,
        color:         'var(--text-3)',
        fontFamily:    'var(--font-display)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        margin:        '0 0 4px',
      }}>
        {title}
      </p>
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {children}
      </div>
    </div>
  )
}

// ─── Modale principale ────────────────────────────────────────
interface ShortcutsModalProps {
  open:    boolean
  onClose: () => void
}

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  // Fermeture via Escape
  useEffect(() => {
    if (!open) return
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Raccourcis clavier"
      style={{
        position:        'fixed',
        inset:            0,
        zIndex:           200,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        background:      'rgba(0,0,0,0.45)',
        backdropFilter:  'blur(4px)',
        padding:          16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background:    'var(--bg)',
          border:        '1px solid var(--border)',
          borderRadius:  'var(--radius-lg)',
          width:          '100%',
          maxWidth:       540,
          maxHeight:     'min(90vh, 680px)',
          display:       'flex',
          flexDirection: 'column',
          boxShadow:     '0 20px 60px rgba(0,0,0,0.2)',
          overflow:      'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:           10,
          padding:      '16px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink:    0,
        }}>
          <div style={{
            width:           32,
            height:          32,
            borderRadius:    8,
            background:      'var(--primary-light)',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            flexShrink:       0,
          }}>
            <Keyboard size={15} style={{ color: 'var(--primary)' }} aria-hidden />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              Raccourcis clavier
            </h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0 }}>
              Appuyez sur <Kbd>?</Kbd> à tout moment pour afficher cette aide
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background:    'none',
              border:        'none',
              cursor:        'pointer',
              color:         'var(--text-3)',
              padding:        4,
              borderRadius:   6,
              display:       'flex',
              alignItems:    'center',
              justifyContent:'center',
              transition:    'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color      = 'var(--text-1)'
              e.currentTarget.style.background = 'var(--surface-2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color      = 'var(--text-3)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {/* Body — deux colonnes */}
        <div style={{
          overflowY:   'auto',
          padding:     '16px 20px',
          display:     'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap:          20,
        }}>
          {/* Colonne gauche */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Group title="Créer">
              <ShortcutRow keys={<Kbd>N</Kbd>}         label="Nouvelle facture" />
              <ShortcutRow keys={<Kbd>P</Kbd>}         label="Nouvelle proforma" />
              <ShortcutRow keys={<Kbd>C</Kbd>}         label="Nouveau client" />
            </Group>

            <Group title="Interface">
              <ShortcutRow keys={<Kbd>/</Kbd>}         label="Ouvrir la recherche" />
              <ShortcutRow keys={<Kbd>?</Kbd>}         label="Afficher cette aide" />
              <ShortcutRow keys={<Kbd>Esc</Kbd>}       label="Fermer / Annuler" />
            </Group>
          </div>

          {/* Colonne droite */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Group title="Navigation (G puis…)">
              <ShortcutRow keys={<ChordKbd first="G" second="D" />} label="Tableau de bord" />
              <ShortcutRow keys={<ChordKbd first="G" second="F" />} label="Factures" />
              <ShortcutRow keys={<ChordKbd first="G" second="P" />} label="Proformas" />
              <ShortcutRow keys={<ChordKbd first="G" second="C" />} label="Clients" />
              <ShortcutRow keys={<ChordKbd first="G" second="R" />} label="Rapports" />
              <ShortcutRow keys={<ChordKbd first="G" second="N" />} label="Notifications" />
              <ShortcutRow keys={<ChordKbd first="G" second="U" />} label="Utilisateurs" />
              <ShortcutRow keys={<ChordKbd first="G" second="S" />} label="Paramètres" />
            </Group>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding:      '10px 20px',
          borderTop:    '1px solid var(--border)',
          flexShrink:    0,
          background:   'var(--surface)',
        }}>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--font-body)' }}>
            Les raccourcis sont désactivés quand le curseur est dans un champ de saisie.
            La fenêtre de chord <Kbd>G</Kbd> est de 1,5 secondes.
          </p>
        </div>
      </div>
    </div>
  )
}
