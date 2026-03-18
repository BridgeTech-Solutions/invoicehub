export interface TaxRate {
  id:           string
  name:         string
  code:         string
  rate:         number
  description:  string | null
  isDefault:    boolean
  isActive:     boolean
  deletedAt:    string | null
  createdAt:    string
  updatedAt:    string
}

export interface CreateTaxRatePayload {
  name:         string
  code:         string
  rate:         number
  description?: string
  isDefault?:   boolean
}

export type UpdateTaxRatePayload = Partial<CreateTaxRatePayload>
