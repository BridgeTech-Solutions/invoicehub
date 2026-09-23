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
  // Requis : la table expenses impose category_id NOT NULL (classification +
  // compte comptable de la charge). Sans catégorie, la dépense est inclassable.
  categoryId:        z.string().uuid(),
  officeId:          z.string().uuid().optional().nullable(),
  supplierId:        z.string().uuid().optional().nullable(),
  supplierName:      z.string().max(255).optional().nullable(),
  expenseDate:       z.coerce.date(),
  paymentMethod:     z.enum(['cash', 'bank_transfer', 'check', 'mobile_money', 'card', 'other']).optional().nullable(),
  amountHt:          z.number().positive(),
  taxRate:           z.number().min(0).max(100).default(0),
  currency:          z.string().length(3).default('XAF'),
  bankAccountId:     z.string().uuid().optional().nullable(),
  accountingAccount: z.string().max(20).optional().nullable(),
  analyticalAxis:    z.string().max(255).optional().nullable(),
  isRecurring:       z.boolean().default(false),
  frequency:         z.enum(['once', 'weekly', 'monthly', 'quarterly', 'annual']).optional().nullable(),
  endDate:           z.coerce.date().optional().nullable(), // fin de récurrence (option)
  isEmployeeExpense: z.boolean().default(false),
  notes:             z.string().optional().nullable(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const rejectExpenseSchema = z.object({
  reason: z.string().min(1),
});

// Remboursement d'une note de frais employé : référence de virement/opération (option).
export const reimburseExpenseSchema = z.object({
  reference: z.string().max(255).optional().nullable(),
});

// Paiement d'une dépense : on capture le compte de trésorerie réellement utilisé
// (banque OU caisse — un BankAccount de type petty_cash) pour que l'écriture
// comptable crédite le bon compte 5xx, et le moyen de paiement.
export const payExpenseSchema = z.object({
  bankAccountId: z.string().uuid().optional().nullable(),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'check', 'mobile_money', 'card', 'other']).optional().nullable(),
});

// ── Budgets ───────────────────────────────────────────────────────────────────

export const createBudgetSchema = z.object({
  // QUOI : compte comptable budgété (classe 6 charge / 7 produit) — cible principale.
  accountNumber: z.string().max(20).optional().nullable(),
  // Dimensions optionnelles.
  categoryId:  z.string().uuid().optional().nullable(),
  officeId:    z.string().uuid().optional().nullable(),
  // QUAND.
  period:      z.enum(['annual', 'quarterly', 'monthly']).optional(),
  year:        z.number().int().min(2020).max(2100),
  quarter:     z.number().int().min(1).max(4).optional().nullable(),
  month:       z.number().int().min(1).max(12).optional().nullable(),
  amount:      z.number().positive(),  // frontend field → DB budgetAmount
  label:       z.string().optional().nullable(), // stocké dans notes
  notes:       z.string().optional().nullable(),
});

export const updateBudgetSchema = createBudgetSchema.partial().extend({
  reason: z.string().max(500).optional(), // motif de la révision (montant)
});

export type PayExpenseInput            = z.infer<typeof payExpenseSchema>;
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type CreateExpenseInput         = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput         = z.infer<typeof updateExpenseSchema>;
export type CreateBudgetInput          = z.infer<typeof createBudgetSchema>;
