import { z } from 'zod';

const lineSchema = z.object({
  sortOrder: z.number().int().default(0),
  designation: z.string().min(1).max(500),
  description: z.string().optional(),
  unit: z.enum(['heure', 'jour', 'forfait', 'piece', 'licence', 'mois', 'annee']).default('piece'),
  quantity: z.coerce.number().positive(),
  unitPriceHt: z.coerce.number().min(0),
  discountType: z.enum(['none', 'percentage', 'fixed']).default('none'),
  discountValue: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(19.25),
});

export const createRecurringSchema = z.object({
  clientId: z.string().uuid(),
  officeId: z.string().uuid().optional(),
  interval: z.enum(['monthly', 'quarterly', 'biannual', 'annual']).default('monthly'),
  nextInvoiceDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  subject: z.string().max(500).optional(),
  notes: z.string().optional(),
  paymentConditions: z.string().optional(),
  currency: z.string().length(3).default('XAF'),
  lines: z.array(lineSchema).min(1),
});

export const updateRecurringSchema = createRecurringSchema.partial().omit({ lines: true }).extend({
  lines: z.array(lineSchema).optional(),
});

export const listRecurringSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  clientId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;
export type UpdateRecurringInput = z.infer<typeof updateRecurringSchema>;
export type ListRecurringInput = z.infer<typeof listRecurringSchema>;
