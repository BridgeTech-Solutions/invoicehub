import { z } from 'zod';

export const createChartAccountSchema = z.object({
  accountNumber:       z.string().min(2).max(20),
  parentAccountNumber: z.string().max(20).optional().nullable(),
  name:                z.string().min(2).max(255),
  accountClass:        z.enum(['c1','c2','c3','c4','c5','c6','c7','c8']).optional(),
  isDetailAccount:     z.boolean().default(true),
  notes:               z.string().optional().nullable(),
});

export const updateChartAccountSchema = z.object({
  name:     z.string().min(2).max(255).optional(),
  notes:    z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const createFiscalPeriodSchema = z.object({
  name:       z.string().min(2).max(100),
  startDate:  z.coerce.date(),
  endDate:    z.coerce.date(),
  fiscalYear: z.number().int().min(2000).max(2100),
  periodType: z.string().max(20).optional(),
});

export const createJournalSchema = z.object({
  code:        z.string().min(2).max(20).toUpperCase(),
  name:        z.string().min(2).max(100),
  type:        z.enum(['sales', 'purchases', 'bank', 'cash', 'operations']),
  description: z.string().optional().nullable(),
});

export const updateJournalSchema = z.object({
  name:        z.string().min(2).max(100).optional(),
  type:        z.enum(['sales', 'purchases', 'bank', 'cash', 'operations']).optional(),
  description: z.string().optional().nullable(),
  isActive:    z.boolean().optional(),
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
  fiscalPeriodId: z.string().uuid(),
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
