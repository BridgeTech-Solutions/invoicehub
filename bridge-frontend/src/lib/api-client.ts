import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
})

// ─── Token storage helpers ──────────────────────────────────────
const TOKEN_KEY = 'bts_access_token'
const REFRESH_KEY = 'bts_refresh_token'
/**
 * Store Zustand persisté (`persist({ name: 'bts-auth' })`). Il conserve une COPIE
 * de `user` / `accessToken` / `refreshToken`, et c'est LUI que lisent les gardes de
 * route — alors que l'intercepteur axios lit `tokenStorage`. Les deux doivent donc
 * être effacés ensemble, sinon ils divergent (voir `clear` ci-dessous).
 *
 * Référencé par sa clé plutôt qu'en important le store : le store importe déjà
 * `tokenStorage`, un import croisé créerait un cycle.
 */
const AUTH_STORE_KEY = 'bts-auth'

export const tokenStorage = {
  getAccess:    () => (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null),
  setAccess:    (t: string) => localStorage.setItem(TOKEN_KEY, t),
  getRefresh:   () => (typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null),
  setRefresh:   (t: string) => localStorage.setItem(REFRESH_KEY, t),
  /**
   * Efface TOUTE l'empreinte d'authentification.
   *
   * Ne vider que les deux jetons laissait le store `bts-auth` intact : l'application
   * se croyait encore connectée (les gardes lisent `accessToken` DANS LE STORE) et
   * affichait le tableau de bord, pendant que l'intercepteur n'avait plus de jeton à
   * injecter. Chaque requête repartait donc en 401 et chaque liste s'affichait vide
   * — page qui charge, contenu absent, sans erreur visible.
   */
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(AUTH_STORE_KEY)
  },
}

// ─── Request interceptor: inject Bearer token ──────────────────
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccess()
  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// ─── Callback pour mettre à jour les permissions après refresh ─
// Évite la dépendance circulaire api-client ↔ store
type PermissionsUpdater = (permissions: string[]) => void
let onPermissionsUpdated: PermissionsUpdater | null = null
export function setPermissionsUpdater(fn: PermissionsUpdater) { onPermissionsUpdated = fn }

// ─── Response interceptor: handle 401 → refresh ───────────────
let isRefreshing = false
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)))
  failedQueue = []
}

// ─── Response interceptor: unwrap { success, data } envelope ──
// The backend wraps responses as { success, data } or { success, data, total, ... }.
// - Single-payload (detail/create/update): { success, data: entity } → unwrap to entity
// - Paginated list: { success, data: [], total, page, totalPages } → strip success, keep rest
// - Cancel/special: { success, data: entity, message } → message is ignored, unwrap to entity
apiClient.interceptors.response.use(
  (res) => {
    if (res.data?.success === true && 'data' in res.data) {
      const { success, message, ...rest } = res.data
      // Pagination keys present → keep { data, total, page, ... }
      // Only 'data' key (no extra pagination) → unwrap to entity directly
      const extraKeys = Object.keys(rest).filter((k) => k !== 'data')
      res.data = extraKeys.length > 0 ? rest : rest.data
    }
    return res
  },
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          original.headers['Authorization'] = `Bearer ${token}`
          return apiClient(original)
        })
      }

      original._retry = true
      isRefreshing = true

      try {
        const refreshToken = tokenStorage.getRefresh()
        if (!refreshToken) throw new Error('No refresh token')

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
        const newToken: string        = data.data.accessToken
        const newRefresh: string | undefined = data.data.refreshToken
        tokenStorage.setAccess(newToken)
        if (newRefresh) tokenStorage.setRefresh(newRefresh)
        // Mise à jour des permissions si incluses dans la réponse refresh
        const newPerms: string[] | undefined = data.data.user?.permissions
        if (newPerms && onPermissionsUpdated) onPermissionsUpdated(newPerms)
        processQueue(null, newToken)
        original.headers['Authorization'] = `Bearer ${newToken}`
        return apiClient(original)
      } catch (err) {
        processQueue(err, null)
        tokenStorage.clear()
        if (typeof window !== 'undefined') {
          // Redirection avec motif pour afficher le bon message sur /login
          const isTimeout = (err as AxiosError<{ code?: string }>)?.response?.data?.code === 'SESSION_TIMEOUT'
          window.location.href = isTimeout ? '/login?reason=timeout' : '/login'
        }
        return Promise.reject(err)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

export default apiClient
