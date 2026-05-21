'use client'

import { usePublicSettings } from '@/features/settings/hooks'
import { useSettings } from '@/features/settings/hooks'
import { buildAssetUrl } from '@/lib/asset-url'

interface CompanyLogoProps {
  /**
   * white — logo inversé pour fonds sombres (sidebar, panneau login gauche)
   * blue  — logo couleur naturelle pour fonds clairs (guide, formulaires)
   */
  variant?: 'white' | 'blue'
  /** Hauteur en px */
  height?: number
  /** Largeur en px — si omis, 'auto' */
  width?: number | 'auto'
  alt?: string
  style?: React.CSSProperties
  className?: string
  /** Utiliser le hook public (pas de JWT requis) — pour les pages auth */
  public?: boolean
}

const FALLBACK: Record<'white' | 'blue', string> = {
  white: '/logos/logo-bts-white.png',
  blue:  '/logos/logo-bts-blue.png',
}

const WHITE_FILTER = 'brightness(0) invert(1)'

function useLogo(isPublic: boolean) {
  const pub  = usePublicSettings()
  const auth = useSettings()
  const { data, isLoading } = isPublic ? pub : auth
  return { logoPath: data?.logoPath ?? null, isLoading }
}

export function CompanyLogo({
  variant = 'white',
  height = 40,
  width = 'auto',
  alt = 'Bridge Technologies Solutions',
  style,
  className,
  public: isPublic = false,
}: CompanyLogoProps) {
  const { logoPath, isLoading } = useLogo(isPublic)

  const src = logoPath ? buildAssetUrl(logoPath) : FALLBACK[variant]

  const filterStyle = variant === 'white' && !logoPath
    ? WHITE_FILTER  // logo statique BTS blanc — déjà blanc, filtre pour cohérence
    : variant === 'white' && logoPath
      ? WHITE_FILTER  // logo custom — on force blanc pour fond sombre
      : undefined     // variant blue — couleurs naturelles

  if (isLoading) {
    return (
      <div
        style={{
          height,
          width: width === 'auto' ? 'auto' : width,
          minWidth: typeof height === 'number' ? height : 40,
          ...style,
        }}
        className={className}
      />
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      style={{
        height,
        width: width === 'auto' ? 'auto' : width,
        objectFit: 'contain',
        filter: filterStyle,
        ...style,
      }}
      className={className}
    />
  )
}
