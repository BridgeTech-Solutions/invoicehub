import type { Role } from '@/lib/constants'

// ─── User ─────────────────────────────────────────────────────
export interface AuthUser {
  id:                 string
  email:              string
  firstName:          string
  lastName:           string
  role:               Role
  mustChangePassword: boolean
  twoFactorEnabled:   boolean
}

// ─── Auth store state ─────────────────────────────────────────
export interface AuthState {
  user:         AuthUser | null
  accessToken:  string | null
  refreshToken: string | null
  isLoading:    boolean
}

// ─── API payloads ─────────────────────────────────────────────
export interface LoginPayload {
  email:      string
  password:   string
  totpToken?: string
}

export interface LoginResponse {
  accessToken:  string
  refreshToken: string
  user:         AuthUser
}

export interface RefreshResponse {
  accessToken:  string
  refreshToken: string
  user: { id: string; email: string; role: Role }
}

export interface TwoFAEnableResponse {
  secret:  string
  qrCode:  string   // data URL image/png base64
}

export interface Session {
  id:         string
  deviceName: string
  deviceInfo: Record<string, string>
  ipAddress:  string | null
  createdAt:  string
  expiresAt:  string
  current:    boolean
}
