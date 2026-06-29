import { z } from 'zod';

export const createChartAccountSchema = z.object({
  accountNumber:        z.string().min(2).max(20),
  parentAccountNumber:  z.string().max(20).optional().nullable(),
  name:                 z.string().min(2).max(255),
  shortName:            z.string().max(100).optional().nullable(),
  accountClass:         z.enum(['c1','c2','c3','c4','c5','c6','c7','c8']).optional(),
  accountNature:        z.enum(['debit_normal','credit_normal']).optional(),
  isDetailAccount:      z.boolean().default(true),
  allowsReconciliation: z.boolean().default(false),
  description:          z.string().optional().nullable(),
  notes:                z.string().optional().nullable(),
});

export const updateChartAccountSchema = z.object({
  name:                 z.string().min(2).max(255).optional(),
  shortName:            z.string().max(100).optional().nullable(),
  accountNature:        z.enum(['debit_normal','credit_normal']).optional(),
  isDetailAccount:      z.boolean().optional(),
  allowsReconciliation: z.boolean().optional(),
  description:          z.string().optional().nullable(),
  notes:                z.string().optional().nullable(),
  isActive:             z.boolean().optional(),
});

export const createFiscalPeriodSchema = z.object({
  name:       z.string().min(2).max(100),
  startDate:  z.coerce.date(),
  endDate:    z.coerce.date(),
  fiscalYear: z.number().int().min(2000).max(2100),
  periodType: z.string().max(20).optional(),
});

export const createJournalSchema = z.object({
  code:             z.string().min(2).max(20).toUpperCase(),
  name:             z.string().min(2).max(100),
  type:             z.enum(['sales', 'purchases', 'bank', 'cash', 'operations', 'misc', 'opening', 'closing']),
  description:      z.string().optional().nullable(),
  defaultAccountId: z.string().max(20).optional().nullable(), // numéro du compte de contrepartie par défaut
  bankAccountId:    z.string().uuid().optional().nullable(),  // fiche bancaire liée (journaux banque/caisse)
});

export const updateJournalSchema = z.object({
  name:             z.string().min(2).max(100).optional(),
  type:             z.enum(['sales', 'purchases', 'bank', 'cash', 'operations', 'misc', 'opening', 'closing']).optional(),
  description:      z.string().optional().nullable(),
  defaultAccountId: z.string().max(20).optional().nullable(),
  bankAccountId:    z.string().uuid().optional().nullable(),
  isActive:         z.boolean().optional(),
});

const entryLineSchema = z.object({
  accountNumber: z.string().min(2).max(20),
  label:         z.string().min(1).max(500),
  debit:         z.number().min(0).default(0),
  credit:        z.number().min(0).default(0),
  analyticAxis1: z.string().max(100).optional().nullable(),
  analyticAxis2: z.string().max(100).optional().nullable(),
});

export const createJournalEntrySchema = z.object({
  journalId:      z.string().uuid(),
  fiscalPeriodId: z.string().uuid().optional().nullable(),
  entryDate:      z.coerce.date(),
  accountingDate: z.coerce.date().optional(),
  label:          z.string().min(2).max(500),
  sourceType:     z.string().max(50).optional().nullable(),
  sourceId:       z.string().uuid().optional().nullable(),
  lines:          z.array(entryLineSchema).min(2),
}).refine((data) => {
  const totalDebit  = data.lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = data.lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(totalDebit - totalCredit) < 0.01;
}, { message: 'Écriture non équilibrée : débit ≠ crédit' });

export const updateJournalEntrySchema = z.object({
  label:          z.string().min(2).max(500).optional(),
  entryDate:      z.coerce.date().optional(),
  accountingDate: z.coerce.date().optional().nullable(),
  lines:          z.array(entryLineSchema).min(2).optional(),
}).refine((data) => {
  if (!data.lines) return true;
  const totalDebit  = data.lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = data.lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(totalDebit - totalCredit) < 0.01;
}, { message: 'Écriture non équilibrée : débit ≠ crédit' });

export const createTaxDeclarationSchema = z.object({
  declarationType: z.string().max(50),
  fiscalPeriodId:  z.string().uuid().optional().nullable(),
  periodStart:     z.coerce.date(),
  periodEnd:       z.coerce.date(),
  tvaCollected:    z.number().min(0).default(0),
  tvaDeductible:   z.number().min(0).default(0),
  tvaCredit:       z.number().min(0).default(0),
  notes:           z.string().optional().nullable(),
});

export const manualLetteringSchema = z.object({
  lineIds:       z.array(z.string().uuid()).min(2, 'Au moins 2 lignes requises'),
  accountNumber: z.string().min(3, 'Numéro de compte requis'),
});

export const deleteLetteringSchema = z.object({
  accountNumber: z.string().min(3, 'Numéro de compte requis'),
});

// ── Rubriques des états financiers (paramétrage « façon Sage ») ────────────────
export const rubriqueSourceSchema = z.object({
  column:   z.enum(['brut', 'amort']),
  prefixes: z.array(z.string().trim().min(1).max(10)).min(1, 'Au moins un compte/préfixe'),
  mode:     z.enum(['debitRaw', 'creditRaw', 'debitSign', 'creditSign']),
  exclude:  z.array(z.string().trim().min(1).max(10)).optional(),
});

export const updateRubriqueSchema = z.object({
  label:   z.string().trim().min(2).max(255).optional(),
  sources: z.array(rubriqueSourceSchema).optional(),
});
export type UpdateRubriqueInput = z.infer<typeof updateRubriqueSchema>;

export const unletteredLinesSchema = z.object({
  accountNumber: z.string().min(3),
  dateFrom:      z.string().optional(),
  dateTo:        z.string().optional(),
  page:          z.coerce.number().int().min(1).default(1),
  limit:         z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateChartAccountInput   = z.infer<typeof createChartAccountSchema>;
export type UpdateChartAccountInput   = z.infer<typeof updateChartAccountSchema>;
export type CreateFiscalPeriodInput   = z.infer<typeof createFiscalPeriodSchema>;
export type CreateJournalInput        = z.infer<typeof createJournalSchema>;
export type UpdateJournalInput        = z.infer<typeof updateJournalSchema>;
export type CreateJournalEntryInput   = z.infer<typeof createJournalEntrySchema>;
export type UpdateJournalEntryInput   = z.infer<typeof updateJournalEntrySchema>;
export type CreateTaxDeclarationInput = z.infer<typeof createTaxDeclarationSchema>;
export type ManualLetteringInput      = z.infer<typeof manualLetteringSchema>;
export type DeleteLetteringInput      = z.infer<typeof deleteLetteringSchema>;
export type UnletteredLinesInput      = z.infer<typeof unletteredLinesSchema>;
