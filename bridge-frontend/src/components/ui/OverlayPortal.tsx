'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * OverlayPortal — rattache son contenu à <body> via un portal.
 *
 * Indispensable pour tout overlay en `position: fixed` (drawer, modale…).
 * Rendu en place, un élément fixed casse dès qu'un ancêtre porte une
 * `transform` / `filter` / `will-change` / `contain` : il devient positionné
 * relativement à cet ancêtre et « cale en haut » / défile avec la page au lieu
 * de rester ancré au viewport. Le portal vers <body> l'immunise contre tout
 * ancêtre transformé, présent ou futur.
 */
export function OverlayPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(children, document.body)
}
