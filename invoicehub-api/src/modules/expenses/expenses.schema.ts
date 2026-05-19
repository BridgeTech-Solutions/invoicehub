import { z } from 'zod';

export const createExpenseCategorySchema = z.object({
  name:              z.string().min(2).max(200),
  code:              z.string().max(50).optional().nullable(),
  description:       z.string().optional().nullable(),
  accountNumber:     z.string().max(20).optional().nullable(),
  isEmployeeExpense: z.boolean().default(false),
});

export const updateExpenseCategorySchema = createExpenseCategorySchema.partial();

export const createExpenseSchema = z.object({
  categoryId:        z.string().uuid(),
  officeId:          z.string().uuid().optional().nullable(),
  title:             z.string().min(2).max(255),
  description:       z.string().optional().nullable(),
  amountHt:          z.number().positive(),
  taxRate:           z.number().min(0).max(100).default(0),
  currency:          z.string().length(3).default('XAF'),
  expenseDate:       z.coerce.date(),
  paymentMethod:     z.enum(['cash', 'bank_transfer', 'check', 'mobile_money', 'card', 'other']).optional().nullable(),
  supplierId:        z.string().uuid().optional().nullable(),
  supplierInvoiceId: z.string().uuid().optional().nullable(),
  bankAccountId:     z.string().uuid().optional().nullable(),
  receiptUrl:        z.string().url().optional().nullable(),
  isEmployeeExpense: z.boolean().default(false),
  notes:             z.string().optional().nullable(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const rejectExpenseSchema = z.object({
  reason: z.string().min(1),
});

export const createBudgetSchema = z.object({
  categoryId:   z.string().uuid(),
  officeId:     z.string().uuid().optional().nullable(),
  year:         z.number().int().min(2020).max(2100),
  month:        z.number().int().min(1).max(12).optional().nullable(),
  amountBudget: z.number().positive(),
  notes:        z.string().optional().nullable(),
});

export const updateBudgetSchema = createBudgetSchema.partial();

export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type CreateExpenseInput         = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput         = z.infer<typeof updateExpenseSchema>;
export type CreateBudgetInput          = z.infer<typeof createBudgetSchema>;
