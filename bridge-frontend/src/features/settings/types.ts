export interface ReminderEscalationLevel {
  daysOverdue:      number
  label:            string
  notifyCreator:    boolean
  notifyManagers:   boolean
  sendEmail:        boolean
}

/** Niveau de vérification active (issued/sent) ou brouillon */
export interface CheckLevel {
  daysSince:      number
  notifyManagers: boolean
  sendEmail:      boolean
}

export interface CompanySettings {
  id:                           string
  companyName:                  string
  legalForm:                    string | null
  taxNumber:                    string | null
  rccm:                         string | null
  address:                      string
  city:                         string | null
  country:                      string | null
  postalBox:                    string | null
  phone:                        string
  email:                        string
  website:                      string | null
  defaultCurrency:              string
  defaultTaxRate:               number
  defaultProformaValidityDays:  number
  defaultInvoiceDueDays:        number
  sessionTimeoutMinutes:        number
  maxLoginAttempts:             number
  require2FA:                   boolean
  autoReminderDays:             number[]
  footerSafeZonePx:             number
  logoPath:                     string | null
  stampPath:                    string | null
  signaturePath:                string | null
  headerImagePath:              string | null
  footerImagePath:              string | null
  reminderEscalation:           {
    levels:           ReminderEscalationLevel[]
    checkLevels?:     CheckLevel[]
    draftCheckLevels?: CheckLevel[]
  } | null
  createdAt:                    string
  updatedAt:                    string
}

export type UpdateSettingsPayload = Partial<Omit<
  CompanySettings,
  'id' | 'createdAt' | 'updatedAt' | 'logoPath' | 'stampPath' | 'signaturePath' | 'headerImagePath' | 'footerImagePath'
>>

export type AssetType = 'logo' | 'stamp' | 'signature' | 'header' | 'footer'
