import { z } from 'zod';

export const createBankAccountSchema = z.object({
  name:             z.string().min(2).max(255),
  bankName:         z.string().min(1).max(255),
  accountNumber:    z.string().max(100).optional().nullable(),
  branchName:       z.string().max(255).optional().nullable(),
  iban:             z.string().max(50).optional().nullable(),
  swiftBic:         z.string().max(20).optional().nullable(),
  currency:         z.string().length(3).default('XAF'),
  openingBalance:   z.number().default(0),
  isDefault:        z.boolean().default(false),
  accountingAccount: z.string().max(20).optional().nullable(),
  color:            z.string().length(7).optional().nullable(),
  notes:            z.string().optional().nullable(),
});

export const updateBankAccountSchema = createBankAccountSchema.partial();

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

export const importCsvSchema = z.object({
  bankAccountId:  z.string().uuid(),
  dateColumn:     z.string().default('date'),
  labelColumn:    z.string().default('libelle'),
  debitColumn:    z.string().default('debit'),
  creditColumn:   z.string().default('credit'),
  referenceColumn: z.string().optional(),
  dateFormat:     z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('DD/MM/YYYY'),
  delimiter:      z.enum([',', ';', '\t']).default(';'),
});

// Nouveau pipeline import
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

export type CreateBankAccountInput    = z.infer<typeof createBankAccountSchema>;
export type CreateTransactionInput    = z.infer<typeof createTransactionSchema>;
export type ReconcileInput            = z.infer<typeof reconcileTransactionSchema>;
export type OpenReconciliationInput   = z.infer<typeof openReconciliationSchema>;
export type ImportCsvInput            = z.infer<typeof importCsvSchema>;
export type DetectFormatInput         = z.infer<typeof detectFormatSchema>;
export type PreviewImportInput        = z.infer<typeof previewImportSchema>;
