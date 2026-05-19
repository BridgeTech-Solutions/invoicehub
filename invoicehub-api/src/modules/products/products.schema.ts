import { z } from 'zod';

export const createCategorySchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().optional(),
  icon:        z.string().max(50).optional(),
  color:       z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder:   z.number().int().default(0),
  isActive:    z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createProductSchema = z.object({
  categoryId:        z.string().uuid().optional(),
  name:              z.string().min(1).max(255),
  reference:         z.string().max(100).optional(),
  type:              z.enum(['product', 'service']).default('product'),
  description:       z.string().optional(),
  unit:              z.enum(['heure', 'jour', 'forfait', 'piece', 'licence', 'mois', 'annee']).default('piece'),
  unitPriceHt:       z.coerce.number().min(0).default(0),
  taxRateId:         z.string().uuid().optional(),
  taxRateValue:      z.coerce.number().min(0).max(100).default(19.25),
  isActive:          z.boolean().default(true),
  metadata:          z.record(z.unknown()).optional(),
  // ── Stock ──────────────────────────────────────────────────────
  trackStock:        z.boolean().default(false),
  stockMinLevel:     z.coerce.number().min(0).optional(),
  stockMaxLevel:     z.coerce.number().min(0).optional(),
  stockUnit:         z.string().max(20).optional(),
  purchasePriceHt:   z.coerce.number().min(0).optional(),
  defaultSupplierId: z.string().uuid().optional(),
  barcode:           z.string().max(100).optional(),
  weightKg:          z.coerce.number().min(0).optional(),
  imageUrl:          z.string().max(500).optional(),
}).transform(data => ({
  ...data,
  // Un produit de type service ne gère jamais le stock
  trackStock: data.type === 'service' ? false : data.trackStock,
  stockMinLevel:     data.type === 'service' ? undefined : data.stockMinLevel,
  stockMaxLevel:     data.type === 'service' ? undefined : data.stockMaxLevel,
  stockUnit:         data.type === 'service' ? undefined : data.stockUnit,
  purchasePriceHt:   data.type === 'service' ? undefined : data.purchasePriceHt,
  defaultSupplierId: data.type === 'service' ? undefined : data.defaultSupplierId,
}));

export const updateProductSchema = createProductSchema.innerType().partial().transform(data => ({
  ...data,
  ...(data.type === 'service' && {
    trackStock: false,
    stockMinLevel: undefined,
    stockMaxLevel: undefined,
    stockUnit: undefined,
    purchasePriceHt: undefined,
    defaultSupplierId: undefined,
  }),
}));

export const listProductsSchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(20),
  categoryId: z.string().uuid().optional(),
  type:       z.enum(['product', 'service']).optional(),
  isActive:   z.coerce.boolean().optional(),
  search:     z.string().optional(),
  clientId:   z.string().uuid().optional(),
  trackStock: z.coerce.boolean().optional(),
});

export const importProductRowSchema = z.object({
  name:         z.string().min(1).max(255),
  reference:    z.string().max(100).optional(),
  type:         z.enum(['product', 'service']).default('product'),
  categoryName: z.string().max(100).optional(),
  unitPriceHt:  z.coerce.number().min(0).default(0),
  taxRateValue: z.coerce.number().min(0).max(100).default(19.25),
  unit:         z.enum(['heure', 'jour', 'forfait', 'piece', 'licence', 'mois', 'annee']).default('piece'),
  description:  z.string().optional(),
  isActive:     z.boolean().default(true),
});

export const importProductsSchema = z.object({
  rows: z.array(importProductRowSchema).min(1).max(500),
});

export type CreateCategoryInput  = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput  = z.infer<typeof updateCategorySchema>;
export type CreateProductInput   = z.infer<typeof createProductSchema>;
export type UpdateProductInput   = z.infer<typeof updateProductSchema>;
export type ListProductsInput    = z.infer<typeof listProductsSchema>;
export type ImportProductRow     = z.infer<typeof importProductRowSchema>;
export type ImportProductsInput  = z.infer<typeof importProductsSchema>;
