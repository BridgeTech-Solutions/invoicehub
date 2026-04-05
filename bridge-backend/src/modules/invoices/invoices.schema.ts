import { z } from 'zod';
import { safeTextOptional, safeRichTextOptional } from '../../lib/sanitize';

const lineSchema = z.object({
  productId: z.string().uuid().optional(),
  sortOrder: z.number().int().default(0),
  designation: z.string().min(1).max(500),
  description: safeRichTextOptional(1000),
  unit: z.enum(['heure', 'jour', 'forfait', 'piece', 'licence', 'mois', 'annee']).default('piece'),
  quantity: z.coerce.number().positive(),
  unitPriceHt: z.coerce.number().min(0),
  discountType: z.enum(['none', 'percentage', 'fixed']).default('none'),
  discountValue: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(19.25),
  hideDetails: z.boolean().default(false),
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
  notes: safeTextOptional(3000),
  paymentConditions: safeTextOptional(1000),
  currency: z.string().length(3).default('XAF'),
  globalDiscountType: z.enum(['none', 'percentage', 'fixed']).default('none'),
  globalDiscountValue: z.coerce.number().min(0).default(0),
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

/**
 * Schéma pour le calcul à la volée (dry-run).
 * Identique à la création mais sans les champs non-financiers.
 * Aucune donnée n'est sauvegardée — retourne totaux + alertes.
 */
export const computeInvoiceSchema = z.object({
  clientId:           z.string().uuid(),
  lines:              z.array(z.object({
    quantity:      z.coerce.number().positive(),
    unitPriceHt:   z.coerce.number().min(0),
    discountType:  z.enum(['none', 'percentage', 'fixed']).default('none'),
    discountValue: z.coerce.number().min(0).default(0),
    taxRate:       z.coerce.number().min(0).max(100).default(19.25),
    designation:   z.string().default(''),
  })).min(1),
  globalDiscountType:  z.enum(['none', 'percentage', 'fixed']).default('none'),
  globalDiscountValue: z.coerce.number().min(0).default(0),
  /** Pour la détection de doublons, fournir le clientReference (BC client) si connu */
  clientReference:     z.string().optional(),
});

export type ComputeInvoiceInput = z.infer<typeof computeInvoiceSchema>;

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type ListInvoicesInput = z.infer<typeof listInvoicesSchema>;
export type LineInput = z.infer<typeof lineSchema>;

export const createAvoirSchema = z.object({
  reason: z.string().min(1, 'Le motif est obligatoire'),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1).optional(), // si absent → copie les lignes de la facture originale
  dueDate: z.coerce.date().optional(),
});
export type CreateAvoirInput = z.infer<typeof createAvoirSchema>;
