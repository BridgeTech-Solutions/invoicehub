import { z } from 'zod';

export const createPaymentSchema = z.object({
  paymentDate:    z.coerce.date().default(() => new Date()),
  amount:         z.coerce.number().positive('Le montant doit être positif'),
  method:         z.enum(['virement', 'especes', 'cheque', 'mobile_money', 'autre']).default('virement'),
  reference:      z.string().max(255).optional(),
  notes:          z.string().optional(),
  bankAccountId:  z.string().uuid().optional(),
  attachmentPath: z.string().max(500).optional(),
  applyEscompte:  z.boolean().optional(),
  // Retenue à la source subie (acompte IR / précompte) prélevée par le client.
  // Montant déjà calculé côté client (taux configurable × base), modifiable.
  withholdingAmount: z.coerce.number().min(0).optional(),
});

export const listPaymentsSchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(20),
  invoiceId:  z.string().uuid().optional(),
  method:     z.enum(['virement', 'especes', 'cheque', 'mobile_money', 'autre']).optional(),
  dateFrom:   z.coerce.date().optional(),
  dateTo:     z.coerce.date().optional(),
  reconciled: z.enum(['true', 'false']).optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ListPaymentsInput = z.infer<typeof listPaymentsSchema>;
