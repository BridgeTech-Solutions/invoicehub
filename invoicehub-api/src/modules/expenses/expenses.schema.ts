import { z } from 'zod';

// ── Catégories ────────────────────────────────────────────────────────────────

export const createExpenseCategorySchema = z.object({
  name:              z.string().min(2).max(100),
  description:       z.string().optional().nullable(),
  icon:              z.string().max(50).optional().nullable(),
  color:             z.string().max(7).optional().nullable(),
  accountingAccount: z.string().max(20).optional().nullable(),
  isActive:          z.boolean().optional(),
  sortOrder:         z.number().int().optional(),
  parentId:          z.string().uuid().optional().nullable(), // accepté mais ignoré (pas en DB)
});

export const updateExpenseCategorySchema = createExpenseCategorySchema.partial();

// ── Dépenses ──────────────────────────────────────────────────────────────────

export const createExpenseSchema = z.object({
  // Champs frontend → DB mapping dans le service :
  //   designation → title
  //   supplierName → beneficiaryName
  //   analyticalAxis → reference
  designation:       z.string().min(2).max(500),
  description:       z.string().optional().nullable(),
  categoryId:        z.string().uuid().optional().nullable(),
  officeId:          z.string().uuid().optional().nullable(),
  supplierId:        z.string().uuid().optional().nullable(),
  supplierName:      z.string().max(255).optional().nullable(),
  supplierInvoiceId: z.string().uuid().optional().nullable(),
  expenseDate:       z.coerce.date(),
  paymentMethod:     z.enum(['cash', 'bank_transfer', 'check', 'mobile_money', 'card', 'other']).optional().nullable(),
  amountHt:          z.number().positive(),
  taxRate:           z.number().min(0).max(100).default(0),
  currency:          z.string().length(3).default('XAF'),
  bankAccountId:     z.string().uuid().optional().nullable(),
  accountingAccount: z.string().max(20).optional().nullable(),
  analyticalAxis:    z.string().max(255).optional().nullable(),
  isRecurring:       z.boolean().default(false),
  isEmployeeExpense: z.boolean().default(false),
  notes:             z.string().optional().nullable(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const rejectExpenseSchema = z.object({
  reason: z.string().min(1),
});

// ── Budgets ───────────────────────────────────────────────────────────────────

export const createBudgetSchema = z.object({
  categoryId:  z.string().uuid().optional().nullable(),
  officeId:    z.string().uuid().optional().nullable(),
  year:        z.number().int().min(2020).max(2100),
  month:       z.number().int().min(1).max(12).optional().nullable(),
  amount:      z.number().positive(),  // frontend field → DB budgetAmount
  label:       z.string().optional().nullable(), // stocké dans notes
  period:      z.enum(['annual', 'monthly']).optional(), // 'annual' → month null
  notes:       z.string().optional().nullable(),
});

export const updateBudgetSchema = createBudgetSchema.partial();

export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type CreateExpenseInput         = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput         = z.infer<typeof updateExpenseSchema>;
export type CreateBudgetInput          = z.infer<typeof createBudgetSchema>;
