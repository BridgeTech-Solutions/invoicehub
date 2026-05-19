import { z } from 'zod';

export const createTaxRateSchema = z.object({
  name:        z.string().min(1).max(100),
  code:        z.string().min(1).max(20).transform(v => v.toUpperCase()),
  rate:        z.number().min(0).max(100),
  description: z.string().optional(),
  isDefault:   z.boolean().optional(),
  isActive:    z.boolean().optional(),
});

export const updateTaxRateSchema = createTaxRateSchema.partial();

export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;
export type UpdateTaxRateInput = z.infer<typeof updateTaxRateSchema>;
