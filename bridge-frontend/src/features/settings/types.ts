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
  level:          number   // index 1-based utilisé par reminder.processor pour la progression
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
  companyCode:                  string
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
  // Comptes comptables SYSCOHADA
  initialStockAccount:          string
  escompteAccountingAccount:    string
  collectedTaxAccount:          string
  deductibleTaxAccount:         string
  stockAccount:                 string
  stockVariationAccount:        string
  stockLossAccount:             string
  defaultClientAccount:         string
  defaultSupplierAccount:       string
  defaultBankAccount:           string
  defaultSalesGoodsAccount:     string
  defaultSalesServiceAccount:   string
  defaultPurchaseAccount:       string
  defaultExpenseAccount:        string
  // Avances et acomptes reçus (option SYSCOHADA — désactivée par défaut)
  useAdvanceAccount:            boolean
  advanceAccount:               string
  // Retenue à la source subie (acompte IR / précompte) — compte 4492, taux 2,2 %
  withholdingAccount:           string
  withholdingRate:              number
  createdAt:                    string
  updatedAt:                    string
}

export type UpdateSettingsPayload = Partial<Omit<
  CompanySettings,
  'id' | 'createdAt' | 'updatedAt' | 'logoPath' | 'stampPath' | 'signaturePath' | 'headerImagePath' | 'footerImagePath'
>>

export type AssetType = 'logo' | 'stamp' | 'signature' | 'header' | 'footer'
