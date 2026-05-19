import { z } from 'zod';

export const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().refine((n) => n !== 0, 'La quantité ne peut pas être zéro'),
  type: z.enum(['adjustment_in', 'adjustment_out']),
  notes: z.string().min(5, 'Une note est obligatoire pour les ajustements manuels'),
  unitCostHt: z.number().min(0).optional().nullable(),
  location: z.string().max(100).optional().nullable(),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
