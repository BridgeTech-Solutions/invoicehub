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

export const createProformaSchema = z.object({
  clientId: z.string().uuid(),
  officeId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  issueDate: z.coerce.date().optional(),
  validUntil: z.coerce.date(),
  subject: z.string().max(500).optional(),
  notes: z.string().optional(),
  paymentConditions: z.string().optional(),
  deliveryDelay: z.string().optional(),
  warranty: z.string().optional(),
  currency: z.string().length(3).default('XAF'),
  globalDiscountType: z.enum(['none', 'percentage', 'fixed']).default('none'),
  globalDiscountValue: z.number().min(0).default(0),
  lines: z.array(lineSchema).min(1, 'Au moins une ligne est requise'),
});

export const updateProformaSchema = createProformaSchema.partial().omit({ lines: true }).extend({
  lines: z.array(lineSchema).optional(),
});

export const listProformasSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  clientId: z.string().uuid().optional(),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']).optional(),
  search: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const rejectProformaSchema = z.object({
  reason: z.string().optional(),
});

export type CreateProformaInput = z.infer<typeof createProformaSchema>;
export type UpdateProformaInput = z.infer<typeof updateProformaSchema>;
export type ListProformasInput = z.infer<typeof listProformasSchema>;
export type LineInput = z.infer<typeof lineSchema>;
