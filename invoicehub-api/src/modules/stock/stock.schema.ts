import { z } from 'zod';

const MANUAL_MOVEMENT_TYPES = [
  'adjustment_in',
  'adjustment_out',
  'write_off',
  'initial_stock',
  'return_customer',
  'return_supplier',
  'purchase_receipt',
] as const;

export const adjustStockSchema = z.object({
  productId:  z.string().uuid(),
  quantity:   z.number().positive('La quantité doit être positive'),
  type:       z.enum(MANUAL_MOVEMENT_TYPES),
  unitCostHt: z.number().min(0).optional().nullable(),
  notes:      z.string().min(5, 'Une note est obligatoire (5 caractères min)'),
  location:   z.string().max(100).optional().nullable(),
  sourceLabel: z.string().max(255).optional().nullable(),
  supplierId:  z.string().uuid().optional().nullable(),
});

export const listMovementsSchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(200).default(20),
  productId:  z.string().uuid().optional(),
  type:       z.string().optional(),
  dateFrom:   z.string().optional(),
  dateTo:     z.string().optional(),
  sourceType: z.string().optional(),
});

export const stockLevelsSchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(50),
  search:     z.string().optional(),
  lowStock:   z.coerce.boolean().optional(),
  rupture:    z.coerce.boolean().optional(),
  categoryId: z.string().uuid().optional(),
});

export type AdjustStockInput   = z.infer<typeof adjustStockSchema>;
export type ListMovementsInput = z.infer<typeof listMovementsSchema>;
export type StockLevelsInput   = z.infer<typeof stockLevelsSchema>;
