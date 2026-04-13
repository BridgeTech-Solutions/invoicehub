import type { Role } from '@/lib/constants'

export type UserStatus = 'active' | 'suspended' | 'pending_activation'

export interface User {
  id:                 string
  email:              string
  firstName:          string
  lastName:           string
  role:               Role
  status:             UserStatus
  phone:              string | null
  avatarUrl:          string | null
  lastLoginAt:        string | null
  createdAt:          string
  twoFactorEnabled:   boolean
  mustChangePassword: boolean
  language?:          string
  timezone?:          string
  theme?:             'light' | 'dark' | 'system'
}

export interface ListUsersParams {
  page?:   number
  limit?:  number
  role?:   Role
  status?: UserStatus
  search?: string
}

export interface PaginatedUsers {
  data:       User[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface CreateUserPayload {
  firstName:   string
  lastName:    string
  email:       string
  phone?:      string
  role:        Role
  password:    string
}

export interface UpdateUserPayload {
  firstName?:            string
  lastName?:             string
  phone?:                string
  role?:                 Role
  language?:             string
  timezone?:             string
  theme?:                'light' | 'dark' | 'system'
  emailNotifications?:   boolean
  invoiceNotifications?: boolean
}

export interface UpdateMePayload {
  firstName?:            string
  lastName?:             string
  phone?:                string
  language?:             string
  timezone?:             string
  theme?:                'light' | 'dark' | 'system'
  emailNotifications?:   boolean
  invoiceNotifications?: boolean
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword:     string
}
