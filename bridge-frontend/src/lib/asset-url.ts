const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api'

/**
 * Construit l'URL complète d'un asset depuis son chemin relatif stocké en DB.
 * Ex: "/api/settings/assets/uuid.png" → "http://localhost:3000/api/settings/assets/uuid.png"
 */
export function buildAssetUrl(relativePath: string): string {
  if (!relativePath) return ''
  if (relativePath.startsWith('http')) return relativePath
  // relativePath commence par "/api/..." — on prend l'origine de l'API
  const origin = API_BASE.replace(/\/api\/?$/, '')
  return origin + relativePath
}
