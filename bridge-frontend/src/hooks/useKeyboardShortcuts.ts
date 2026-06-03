'use client'

/**
 * @hook useKeyboardShortcuts
 * Raccourcis clavier globaux — actifs sur toutes les pages du dashboard.
 *
 * Règles d'activation :
 *  - Ignorés si le focus est dans un input / textarea / select / contentEditable
 *  - Ignorés si Ctrl / Meta / Alt est pressé (évite les conflits navigateur)
 *
 * Raccourcis simples :
 *  n   → /invoices/new
 *  p   → /proformas/new
 *  c   → /clients/new
 *  /   → ouvre la recherche globale (CustomEvent)
 *  ?   → ouvre la modale d'aide
 *  Esc → ferme la modale d'aide (géré par la modale elle-même)
 *
 * Raccourcis chord (G puis lettre, fenêtre 1 500 ms) :
 *  g d → /dashboard
 *  g f → /invoices
 *  g p → /proformas
 *  g c → /clients
 *  g b → /purchase-orders   (Bons de commande)
 *  g i → /supplier-invoices (factures fournIsseurs)
 *  g e → /Expenses (dépenses)
 *  g k → /stock
 *  g a → /bank              (Accounts bancaires)
 *  g m → /accounting        (coMptabilité)
 *  g r → /reports
 *  g n → /notifications
 *  g u → /users
 *  g s → /settings
 */

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

/** Retourne true si l'événement provient d'un champ de saisie */
function isTypingContext(e: KeyboardEvent): boolean {
  const el  = e.target as HTMLElement
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  )
}

export function useKeyboardShortcuts(onOpenHelp: () => void): void {
  const router         = useRouter()
  const chordRef       = useRef<string | null>(null)
  const chordTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearChord = useCallback(() => {
    chordRef.current = null
    if (chordTimerRef.current) {
      clearTimeout(chordTimerRef.current)
      chordTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    function handle(e: KeyboardEvent): void {
      // Ignorer si dans un champ de saisie ou avec modificateurs
      if (isTypingContext(e)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // ── Résolution d'un chord en attente ───────────────────
      if (chordRef.current === 'g') {
        clearChord()
        switch (e.key) {
          case 'd': router.push('/dashboard');          e.preventDefault(); return
          case 'f': router.push('/invoices');           e.preventDefault(); return
          case 'p': router.push('/proformas');          e.preventDefault(); return
          case 'c': router.push('/clients');            e.preventDefault(); return
          case 'b': router.push('/purchase-orders');    e.preventDefault(); return
          case 'i': router.push('/supplier-invoices');  e.preventDefault(); return
          case 'e': router.push('/expenses');           e.preventDefault(); return
          case 'k': router.push('/stock');              e.preventDefault(); return
          case 'a': router.push('/bank');               e.preventDefault(); return
          case 'm': router.push('/accounting');         e.preventDefault(); return
          case 'r': router.push('/reports');            e.preventDefault(); return
          case 'n': router.push('/notifications');      e.preventDefault(); return
          case 'u': router.push('/users');              e.preventDefault(); return
          case 's': router.push('/settings');           e.preventDefault(); return
        }
        // Touche inconnue après g → chord annulé silencieusement
        return
      }

      // ── Raccourcis simples ──────────────────────────────────
      switch (e.key) {
        case 'n':
          router.push('/invoices/new')
          e.preventDefault()
          break

        case 'p':
          router.push('/proformas/new')
          e.preventDefault()
          break

        case 'c':
          router.push('/clients/new')
          e.preventDefault()
          break

        case '/':
          // Délègue l'ouverture de la barre de recherche via événement DOM
          // pour ne pas coupler ce hook à l'état interne du Topbar
          document.dispatchEvent(new CustomEvent('shortcuts:open-search'))
          e.preventDefault()
          break

        case '?':
          onOpenHelp()
          e.preventDefault()
          break

        case 'g':
          // Démarre un chord : attend la 2e touche dans les 1 500 ms
          chordRef.current = 'g'
          chordTimerRef.current = setTimeout(clearChord, 1_500)
          e.preventDefault()
          break
      }
    }

    document.addEventListener('keydown', handle)
    return () => {
      document.removeEventListener('keydown', handle)
      clearChord()
    }
  }, [router, onOpenHelp, clearChord])
}
