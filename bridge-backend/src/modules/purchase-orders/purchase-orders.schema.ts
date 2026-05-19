import { z } from 'zod';

const lineSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  designation: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).max(100).default(0),
  unit: z.string().max(50).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  officeId: z.string().uuid().optional().nullable(),
  orderDate: z.coerce.date().optional(),
  expectedDeliveryDate: z.coerce.date().optional().nullable(),
  deliveryAddress: z.string().max(500).optional().nullable(),
  currency: z.string().length(3).default('XAF'),
  notes: z.string().optional().nullable(),
  internalRef: z.string().max(100).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

export const updatePurchaseOrderSchema = z.object({
  expectedDeliveryDate: z.coerce.date().optional().nullable(),
  deliveryAddress: z.string().max(500).optional().nullable(),
  notes: z.string().optional().nullable(),
  internalRef: z.string().max(100).optional().nullable(),
  lines: z.array(lineSchema).min(1).optional(),
});

export const receiveLineSchema = z.object({
  lines: z.array(z.object({
    lineId: z.string().uuid(),
    quantityReceived: z.number().min(0),
  })),
  notes: z.string().optional().nullable(),
});

export const computeSchema = z.object({
  lines: z.array(lineSchema).min(1),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
export type ReceiveInput = z.infer<typeof receiveLineSchema>;
