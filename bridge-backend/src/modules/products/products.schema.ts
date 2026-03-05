import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createProductSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  reference: z.string().max(100).optional(),
  type: z.enum(['product', 'service']).default('product'),
  description: z.string().optional(),
  unit: z.enum(['heure', 'jour', 'forfait', 'piece', 'licence', 'mois', 'annee']).default('piece'),
  unitPriceHt: z.number().min(0).default(0),
  taxRateId: z.string().uuid().optional(),
  taxRateValue: z.number().min(0).max(100).default(19.25),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const listProductsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  categoryId: z.string().uuid().optional(),
  type: z.enum(['product', 'service']).optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsInput = z.infer<typeof listProductsSchema>;
