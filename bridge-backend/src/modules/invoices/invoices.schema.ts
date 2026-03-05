import { z } from 'zod';

const lineSchema = z.object({
  productId: z.string().uuid().optional(),
  sortOrder: z.number().int().default(0),
  designation: z.string().min(1).max(500),
  description: z.string().optional(),
  unit: z.enum(['heure', 'jour', 'forfait', 'piece', 'licence', 'mois', 'annee']).default('piece'),
  quantity: z.number().positive(),
  unitPriceHt: z.number().min(0),
  discountType: z.enum(['none', 'percentage', 'fixed']).default('none'),
  discountValue: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(100).default(19.25),
});

export const createInvoiceSchema = z.object({
  type: z.enum(['standard', 'acompte', 'solde', 'avoir', 'recurring']).default('standard'),
  clientId: z.string().uuid(),
  officeId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  proformaId: z.string().uuid().optional(),
  parentInvoiceId: z.string().uuid().optional(),
  creditedInvoiceId: z.string().uuid().optional(),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date(),
  subject: z.string().max(500).optional(),
  clientReference: z.string().max(100).optional(),
  notes: z.string().optional(),
  paymentConditions: z.string().optional(),
  currency: z.string().length(3).default('XAF'),
  globalDiscountType: z.enum(['none', 'percentage', 'fixed']).default('none'),
  globalDiscountValue: z.number().min(0).default(0),
  acomptePercentage: z.number().min(0.01).max(100).optional(),
  lines: z.array(lineSchema).min(1, 'Au moins une ligne est requise'),
});

export const updateInvoiceSchema = createInvoiceSchema
  .partial()
  .omit({ type: true, clientId: true, lines: true })
  .extend({
    lines: z.array(lineSchema).optional(),
  });

export const listInvoicesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  clientId: z.string().uuid().optional(),
  type: z.enum(['standard', 'acompte', 'solde', 'avoir', 'recurring']).optional(),
  status: z.enum(['draft', 'issued', 'partially_paid', 'paid', 'cancelled', 'overdue']).optional(),
  search: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  overdue: z.coerce.boolean().optional(),
});

export const cancelInvoiceSchema = z.object({
  reason: z.string().optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type ListInvoicesInput = z.infer<typeof listInvoicesSchema>;
export type LineInput = z.infer<typeof lineSchema>;
