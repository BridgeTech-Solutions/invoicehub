import { z } from 'zod';
import { safeTextOptional, safeRichTextOptional } from '../../lib/sanitize';

const lineSchema = z.object({
  productId: z.string().uuid().optional(),
  sortOrder: z.number().int().default(0),
  designation: z.string().min(1).max(500),
  description: safeRichTextOptional(1000),
  unit: z.string().min(1).max(20).default('piece'),
  quantity: z.coerce.number().positive(),
  unitPriceHt: z.coerce.number().min(0),
  discountType: z.enum(['none', 'percentage', 'fixed']).default('none'),
  discountValue: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(19.25),
  hideDetails: z.boolean().default(false),
});

export const createProformaSchema = z.object({
  clientId: z.string().uuid(),
  officeId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  issueDate: z.coerce.date().optional(),
  validUntil: z.coerce.date(),
  subject: z.string().max(500).optional(),
  notes: safeTextOptional(3000),
  paymentConditions: safeTextOptional(1000),
  deliveryDelay: safeTextOptional(500),
  warranty: safeTextOptional(500),
  currency: z.string().length(3).default('XAF'),
  globalDiscountType: z.enum(['none', 'percentage', 'fixed']).default('none'),
  globalDiscountValue: z.number().min(0).default(0),
  bankAccountId: z.string().uuid().optional(),
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
  reason: safeTextOptional(500),
});

export const convertProformaSchema = z.object({
  invoiceType: z.enum(['standard', 'acompte']).default('standard'),
  acomptePercentage: z.number().min(1).max(99).optional(),
}).refine(
  (data) => data.invoiceType !== 'acompte' || data.acomptePercentage !== undefined,
  { message: "acomptePercentage est requis pour une facture d'acompte", path: ['acomptePercentage'] },
);

// Réordonnancement des lignes — présentation pure (champ sortOrder), autorisé
// quel que soit le statut. lineIds = l'ordre voulu, liste complète.
export const reorderLinesSchema = z.object({
  lineIds: z.array(z.string().uuid()).min(1, 'Au moins une ligne est requise'),
});

export type CreateProformaInput = z.infer<typeof createProformaSchema>;
export type UpdateProformaInput = z.infer<typeof updateProformaSchema>;
export type ListProformasInput = z.infer<typeof listProformasSchema>;
export type ConvertProformaInput = z.infer<typeof convertProformaSchema>;
export type RejectProformaInput = z.infer<typeof rejectProformaSchema>;
export type ReorderLinesInput = z.infer<typeof reorderLinesSchema>;
export type LineInput = z.infer<typeof lineSchema>;
