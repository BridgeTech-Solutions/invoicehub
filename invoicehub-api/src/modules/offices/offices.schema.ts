import { z } from 'zod';

export const createOfficeSchema = z.object({
  code:      z.string().min(1).max(10).transform(v => v.toUpperCase()),
  name:      z.string().min(1).max(255),
  city:      z.string().max(100).optional(),
  address:   z.string().optional(),
  isDefault: z.boolean().optional(),
  isActive:  z.boolean().optional(),
});

export const updateOfficeSchema = createOfficeSchema.partial();

export type CreateOfficeInput = z.infer<typeof createOfficeSchema>;
export type UpdateOfficeInput = z.infer<typeof updateOfficeSchema>;
