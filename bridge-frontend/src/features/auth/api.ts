import apiClient from '@/lib/api-client'
import type {
  LoginPayload, LoginResponse, RefreshResponse,
  TwoFAEnableResponse, Session,
} from './types'

// ─── Auth API ─────────────────────────────────────────────────

/** POST /auth/login — email + password (+ totpToken si 2FA actif) */
export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', payload)
  return data
}

/** POST /auth/logout — révoque le refresh token */
export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post('/auth/logout', { refreshToken })
}

/** POST /auth/refresh — échange refresh token → nouveaux tokens */
export async function refreshTokens(refreshToken: string): Promise<RefreshResponse> {
  const { data } = await apiClient.post<RefreshResponse>('/auth/refresh', { refreshToken })
  return data
}

/** POST /auth/forgot-password — envoie email de réinitialisation */
export async function forgotPassword(email: string): Promise<void> {
  await apiClient.post('/auth/forgot-password', { email })
}

/** POST /auth/reset-password — réinitialise avec le token email */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/reset-password', { token, newPassword })
}

// ─── 2FA ──────────────────────────────────────────────────────

/** POST /auth/2fa/enable — génère secret TOTP + QR code */
export async function twoFAEnable(): Promise<TwoFAEnableResponse> {
  const { data } = await apiClient.post<TwoFAEnableResponse>('/auth/2fa/enable')
  return data
}

/** POST /auth/2fa/verify — active le 2FA après vérification du code TOTP */
export async function twoFAVerify(token: string, secret: string): Promise<{ backupCodes: string[] }> {
  const { data } = await apiClient.post<{ backupCodes: string[] }>('/auth/2fa/verify', { token, secret })
  return data
}

/** POST /auth/2fa/disable — désactive le 2FA */
export async function twoFADisable(token: string): Promise<void> {
  await apiClient.post('/auth/2fa/disable', { token })
}

/** POST /auth/2fa/backup-codes — régénère les codes de secours */
export async function twoFARegenerateBackupCodes(totpToken: string): Promise<{ backupCodes: string[] }> {
  const { data } = await apiClient.post<{ backupCodes: string[] }>('/auth/2fa/backup-codes', { totpToken })
  return data
}

// ─── Sessions ─────────────────────────────────────────────────

/** GET /auth/sessions — liste les sessions actives */
export async function listSessions(): Promise<Session[]> {
  const { data } = await apiClient.get<Session[]>('/auth/sessions')
  return data
}

/** DELETE /auth/sessions/:id — révoque une session spécifique */
export async function revokeSession(id: string): Promise<void> {
  await apiClient.delete(`/auth/sessions/${id}`)
}

/** DELETE /auth/sessions — révoque toutes les sessions sauf la courante */
export async function revokeAllSessions(): Promise<void> {
  await apiClient.delete('/auth/sessions')
}
