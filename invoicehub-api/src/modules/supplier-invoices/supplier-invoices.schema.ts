import { z } from 'zod';

const lineSchema = z.object({
  purchaseOrderLineId: z.string().uuid().optional().nullable(),
  productId:           z.string().uuid().optional().nullable(),
  designation:         z.string().min(1).max(500),
  description:         z.string().optional().nullable(),
  quantity:            z.number().positive(),
  unitPrice:           z.number().min(0),
  discountPercent:     z.number().min(0).max(100).default(0),
  taxRate:             z.number().min(0).max(100).default(0),
  unit:                z.string().max(50).optional().nullable(),
});

export const createSupplierInvoiceSchema = z.object({
  supplierId:         z.string().uuid(),
  purchaseOrderId:    z.string().uuid().optional().nullable(),
  officeId:           z.string().uuid().optional().nullable(),
  supplierInvoiceRef: z.string().max(100).optional().nullable(),
  invoiceDate:        z.coerce.date(),
  dueDate:            z.coerce.date().optional().nullable(),
  currency:           z.string().length(3).default('XAF'),
  notes:              z.string().optional().nullable(),
  lines:              z.array(lineSchema).min(1),
});

export const updateSupplierInvoiceSchema = z.object({
  supplierInvoiceRef: z.string().max(100).optional().nullable(),
  invoiceDate:        z.coerce.date().optional(),
  dueDate:            z.coerce.date().optional().nullable(),
  notes:              z.string().optional().nullable(),
  lines:              z.array(lineSchema).min(1).optional(),
});

export const paySupplierInvoiceSchema = z.object({
  amount:        z.number().positive(),
  paymentDate:   z.coerce.date(),
  method:        z.enum(['bank_transfer', 'cash', 'check', 'mobile_money', 'other']),
  reference:     z.string().max(100).optional().nullable(),
  bankAccountId: z.string().uuid().optional().nullable(),
  notes:         z.string().optional().nullable(),
});

export const disputeSchema = z.object({
  reason: z.string().min(1),
});

export type CreateSupplierInvoiceInput = z.infer<typeof createSupplierInvoiceSchema>;
export type UpdateSupplierInvoiceInput = z.infer<typeof updateSupplierInvoiceSchema>;
export type PaySupplierInvoiceInput    = z.infer<typeof paySupplierInvoiceSchema>;
