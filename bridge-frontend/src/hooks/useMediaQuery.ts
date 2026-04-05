import { useState, useEffect } from 'react'

/**
 * Retourne true si la media query correspond.
 * SSR-safe : retourne false côté serveur.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

/** < 640px */
export function useIsMobile() {
  return useMediaQuery('(max-width: 639px)')
}

/** 640px – 1023px */
export function useIsTablet() {
  return useMediaQuery('(min-width: 640px) and (max-width: 1023px)')
}

/** ≥ 1024px */
export function useIsDesktop() {
  return useMediaQuery('(min-width: 1024px)')
}
