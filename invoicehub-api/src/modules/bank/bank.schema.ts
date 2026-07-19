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
  amount:          z.number().refine((n) => n !== 0, 'Le montant ne peut pas être zéro'),
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
});

export const confirmImportSchema = z.object({
  importId: z.string().uuid(),
});

export const saveProfileOverrideSchema = z.object({
  bankAccountId: z.string().uuid(),
  profileData:   z.record(z.any()),
});

export type CreateBankAccountInput  = z.infer<typeof createBankAccountSchema>;
export type CreateTransactionInput  = z.infer<typeof createTransactionSchema>;
export type ReconcileInput          = z.infer<typeof reconcileTransactionSchema>;
export type OpenReconciliationInput = z.infer<typeof openReconciliationSchema>;
export type DetectFormatInput       = z.infer<typeof detectFormatSchema>;

// ── Import profiles ───────────────────────────────────────────────────────────

export const createImportProfileSchema = z.object({
  name:               z.string().min(1).max(255),
  bankName:           z.string().max(255).optional().nullable(),
  country:            z.string().max(100).optional().nullable(),
  fileFormat:         z.string().max(50).optional().nullable(),
  encoding:           z.string().max(20).optional().nullable(),
  delimiter:          z.string().max(5).optional().nullable(),
  dateFormat:         z.string().max(50).optional().nullable(),
  // Requis en base (NOT NULL) — un profil sans mapping/format n'a pas de sens.
  numberFormat:       z.record(z.any()),
  columnMapping:      z.record(z.any()),
  directionValues:    z.record(z.any()).optional().nullable(),
  amountSign:         z.string().max(50).optional().nullable(),
  skipRowsContaining: z.array(z.string()).optional().nullable(),
  skipFirstRows:      z.number().int().optional().nullable(),
  isPublic:           z.boolean().optional(),
  notes:              z.string().optional().nullable(),
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
