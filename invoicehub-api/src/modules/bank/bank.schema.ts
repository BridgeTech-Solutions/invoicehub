import { z } from 'zod';

export const createBankAccountSchema = z.object({
  name:              z.string().min(2).max(255),
  bankName:          z.string().min(1).max(255),
  accountNumber:     z.string().max(100).optional().nullable(),
  branchName:        z.string().max(255).optional().nullable(),
  iban:              z.string().max(50).optional().nullable(),
  swiftBic:          z.string().max(20).optional().nullable(),
  currency:          z.string().length(3).default('XAF'),
  openingBalance:    z.number().default(0),
  isDefault:         z.boolean().default(false),
  accountType:       z.enum(['checking','savings','petty_cash','mobile_money','term_deposit']).default('checking').optional(),
  accountingAccount: z.string().max(20).optional().nullable(),
  color:             z.string().length(7).optional().nullable(),
  notes:             z.string().optional().nullable(),
});

export const updateBankAccountSchema = createBankAccountSchema.partial();
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;

export const createTransactionSchema = z.object({
  bankAccountId:   z.string().uuid(),
  transactionDate: z.coerce.date(),
  label:           z.string().min(1).max(500),
  // Toujours positif : le sens (entrée/sortie) est porté par `type`, pas par le
  // signe. Un montant négatif inverserait le calcul du solde.
  amount:          z.number().positive('Le montant doit être strictement positif'),
  type:            z.enum(['debit', 'credit']),
  reference:       z.string().max(255).optional().nullable(),
  category:        z.string().max(100).optional().nullable(),
  notes:           z.string().optional().nullable(),
});

export const reconcileTransactionSchema = z.object({
  matchedEntityType: z.enum(['payment', 'supplier_payment', 'expense']),
  matchedEntityId:   z.string().uuid(),
});

export const openReconciliationSchema = z.object({
  bankAccountId:  z.string().uuid(),
  periodStart:    z.coerce.date(),
  periodEnd:      z.coerce.date(),
  openingBalance: z.number().default(0),
  notes:          z.string().optional().nullable(),
});

export const detectFormatSchema = z.object({
  bankAccountId: z.string().uuid(),
  encoding:      z.enum(['auto', 'utf-8', 'win1252', 'iso-8859-1', 'utf-16le']).optional().default('auto'),
});

export const previewImportSchema = z.object({
  bankAccountId: z.string().uuid(),
  encoding:      z.enum(['auto', 'utf-8', 'win1252', 'iso-8859-1', 'utf-16le']).optional().default('auto'),
  // Multipart : ce champ arrive en chaîne JSON (mapping manuel du ColumnMapper).
  columnMapping: z.string().max(5000).optional(),
});

export const confirmImportSchema = z.object({
  importId: z.string().uuid(),
});

// Forme d'un format d'import détecté/mappé (DetectedFormat) : on valide au moins
// les champs structurants avant de mémoriser un override réutilisé au parsing,
// pour ne pas stocker un objet arbitraire qui casserait les imports suivants.
export const detectedFormatSchema = z.object({
  delimiter:    z.enum([',', ';', '\t', '|']),
  encoding:     z.string().max(20),
  dateFormat:   z.string().min(1).max(50),
  numberFormat: z.object({ thousands: z.string().max(2), decimal: z.string().max(2) }),
  columnMapping: z.object({
    date:         z.string().max(100),
    label:        z.string().max(100),
    debit:        z.string().max(100).optional(),
    credit:       z.string().max(100).optional(),
    amount:       z.string().max(100).optional(),
    direction:    z.string().max(100).optional(),
    reference:    z.string().max(100).optional(),
    balanceAfter: z.string().max(100).optional(),
    valueDate:    z.string().max(100).optional(),
  }),
  headerRow:    z.number().int().min(0).max(100).optional(),
  amountSign:   z.string().max(50).optional(),
}).passthrough(); // tolère les champs annexes (profileName, confidence…)

export const saveProfileOverrideSchema = z.object({
  bankAccountId: z.string().uuid(),
  profileData:   detectedFormatSchema,
});

export type CreateBankAccountInput  = z.infer<typeof createBankAccountSchema>;
export type CreateTransactionInput  = z.infer<typeof createTransactionSchema>;
export type ReconcileInput          = z.infer<typeof reconcileTransactionSchema>;
export type OpenReconciliationInput = z.infer<typeof openReconciliationSchema>;
export type DetectFormatInput       = z.infer<typeof detectFormatSchema>;

// ── Import profiles ───────────────────────────────────────────────────────────

// Une colonne d'un profil se réfère à un en-tête (chaîne) ou à une liste de
// synonymes d'en-têtes (comme les profils intégrés) — jamais à un objet arbitraire.
const profileColField = z.union([
  z.string().max(100),
  z.array(z.string().max(100)).min(1),
]);
const profileNumberFormatSchema = z.object({
  thousands: z.string().max(2),
  decimal:   z.string().min(1).max(2),
});
const profileColumnMappingSchema = z.object({
  date:         z.union([z.string().min(1).max(100), z.array(z.string().min(1).max(100)).min(1)]),
  label:        z.union([z.string().min(1).max(100), z.array(z.string().min(1).max(100)).min(1)]),
  debit:        profileColField.optional().nullable(),
  credit:       profileColField.optional().nullable(),
  amount:       profileColField.optional().nullable(),
  direction:    profileColField.optional().nullable(),
  reference:    profileColField.optional().nullable(),
  balanceAfter: profileColField.optional().nullable(),
  valueDate:    profileColField.optional().nullable(),
}).refine(
  (c) => !!(c.debit || c.credit || c.amount),
  { message: 'Le mapping doit désigner une colonne de montant (débit/crédit ou montant unique).' },
);

export const createImportProfileSchema = z.object({
  name:               z.string().min(1).max(255),
  bankName:           z.string().max(255).optional().nullable(),
  country:            z.string().max(100).optional().nullable(),
  fileFormat:         z.string().max(50).optional().nullable(),
  encoding:           z.string().max(20).optional().nullable(),
  delimiter:          z.string().max(5).optional().nullable(),
  dateFormat:         z.string().max(50).optional().nullable(),
  // Requis en base (NOT NULL) — un profil sans mapping/format n'a pas de sens.
  // Structurés : un profil au mapping incohérent parserait 0 ligne en silence.
  numberFormat:       profileNumberFormatSchema,
  columnMapping:      profileColumnMappingSchema,
  directionValues:    z.object({ debit: z.array(z.string()), credit: z.array(z.string()) }).optional().nullable(),
  amountSign:         z.enum(['negative-is-debit', 'positive-is-credit']).optional().nullable(),
  skipRowsContaining: z.array(z.string()).optional().nullable(),
  skipFirstRows:      z.number().int().min(0).max(50).optional().nullable(),
  isPublic:           z.boolean().optional(),
  notes:              z.string().max(2000).optional().nullable(),
});

export const updateImportProfileSchema = createImportProfileSchema.partial();

export type CreateImportProfileInput = z.infer<typeof createImportProfileSchema>;
export type UpdateImportProfileInput = z.infer<typeof updateImportProfileSchema>;

// ── Matching rules ────────────────────────────────────────────────────────────

export const createMatchingRuleSchema = z.object({
  bankAccountId: z.string().uuid().optional().nullable(),
  labelContains: z.string().min(1).max(255),
  entityType:    z.enum(['payment', 'supplier_payment', 'expense']),
  entityId:      z.string().uuid().optional().nullable(),
  category:      z.string().max(100).optional().nullable(),
  amountMin:     z.number().optional().nullable(),
  amountMax:     z.number().optional().nullable(),
  autoApply:     z.boolean().optional(),
});

export const updateMatchingRuleSchema = createMatchingRuleSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreateMatchingRuleInput = z.infer<typeof createMatchingRuleSchema>;
export type UpdateMatchingRuleInput = z.infer<typeof updateMatchingRuleSchema>;
