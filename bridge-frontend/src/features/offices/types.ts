export interface Office {
  id:         string
  code:       string
  name:       string
  city:       string | null
  address:    string | null
  isDefault:  boolean
  deletedAt:  string | null
  createdAt:  string
  updatedAt:  string
}

export interface CreateOfficePayload {
  code:       string
  name:       string
  city?:      string
  address?:   string
  isDefault?: boolean
}

export type UpdateOfficePayload = Partial<CreateOfficePayload>
