import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { eventBus } from '../../lib/eventBus';
import * as accountingEngine from '../../lib/accountingEngine';
import { approvalsService } from '../approvals/approvals.service';
import {
  CreateExpenseCategoryInput, CreateExpenseInput,
  UpdateExpenseInput, CreateBudgetInput,
} from './expenses.schema';

async function recordHistory(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  expenseId: string,
  newStatus: string,
  userId: string,
  reason?: string | null,
) {
  await tx.expenseStatusHistory.create({
    data: { expenseId, newStatus: newStatus as any, changedById: userId, reason: reason ?? undefined },
  });
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function listCategories() {
  return prisma.expenseCategory.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    include: { _count: { select: { expenses: true } } },
  });
}

export async function createCategory(data: CreateExpenseCategoryInput) {
  const exists = await prisma.expenseCategory.findFirst({ where: { name: data.name, deletedAt: null } });
  if (exists) throw AppError.conflict('Une catégorie avec ce nom existe déjà');
  return prisma.expenseCategory.create({ data });
}

export async function updateCategory(id: string, data: Partial<CreateExpenseCategoryInput>) {
  const cat = await prisma.expenseCategory.findFirst({ where: { id, deletedAt: null } });
  if (!cat) throw AppError.notFound('Catégorie introuvable');
  return prisma.expenseCategory.update({ where: { id }, data });
}

export async function deleteCategory(id: string) {
  const cat = await prisma.expenseCategory.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { expenses: true } } },
  });
  if (!cat) throw AppError.notFound('Catégorie introuvable');
  if (cat._count.expenses > 0) throw AppError.conflict('Des dépenses sont liées à cette catégorie');
  await prisma.expenseCategory.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export async function listExpenses(params: {
  page: number; limit: number;
  search?: string; status?: string; categoryId?: string;
  officeId?: string; dateFrom?: string; dateTo?: string;
  isEmployeeExpense?: boolean;
}) {
  const { page, limit, search, status, categoryId, officeId, dateFrom, dateTo, isEmployeeExpense } = params;
  const where: Record<string, unknown> = { deletedAt: null };
  if (status) where['status'] = status;
  if (categoryId) where['categoryId'] = categoryId;
  if (officeId) where['officeId'] = officeId;
  if (typeof isEmployeeExpense === 'boolean') where['isEmployeeExpense'] = isEmployeeExpense;
  if (search) where['OR'] = [
    { title: { contains: search, mode: 'insensitive' } },
    { expenseNumber: { contains: search, mode: 'insensitive' } },
  ];
  if (dateFrom || dateTo) {
    where['expenseDate'] = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  const [data, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.expense.count({ where }),
  ]);
  return { data, total };
}

export async function getExpenseById(id: string) {
  const expense = await prisma.expense.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
      statusHistory: { orderBy: { changedAt: 'asc' } },
    },
  });
  if (!expense) throw AppError.notFound('Dépense introuvable');
  return expense;
}

export async function createExpense(data: CreateExpenseInput, userId: string) {
  const amountTtc = data.amountHt * (1 + (data.taxRate ?? 0) / 100);

  const officeIdResolved = data.officeId ?? (
    await prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } })
  )?.id;
  if (!officeIdResolved) throw AppError.badRequest('Aucun bureau disponible');

  const [result] = await prisma.$queryRaw<[{ fn_next_document_number: string }]>`
    SELECT fn_next_document_number('expense', ${officeIdResolved}::uuid)
  `;

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        ...data as any,
        officeId: officeIdResolved,
        number: result.fn_next_document_number,
        amountTtc,
        status: 'draft' as any,
        createdById: userId,
      },
    });
    await recordHistory(tx, expense.id, 'draft', userId);
    return expense;
  });
}

export async function updateExpense(id: string, data: UpdateExpenseInput, _userId: string) {
  const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } });
  if (!expense) throw AppError.notFound('Dépense introuvable');
  if (expense.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être modifiés');

  const amountTtc = data.amountHt !== undefined
    ? data.amountHt * (1 + ((data.taxRate ?? Number(expense.taxRate)) / 100))
    : undefined;

  const updateData: Record<string, unknown> = { ...data };
  if (amountTtc !== undefined) updateData['amountTtc'] = amountTtc;
  if (data.officeId === null) updateData['officeId'] = null;

  return prisma.expense.update({ where: { id }, data: updateData as any });
}

export async function deleteExpense(id: string) {
  const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } });
  if (!expense) throw AppError.notFound('Dépense introuvable');
  if (expense.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être supprimés');
  await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
}

async function transition(id: string, from: string | string[], to: string, userId: string, extra?: Record<string, unknown>, reason?: string) {
  const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } });
  if (!expense) throw AppError.notFound('Dépense introuvable');
  const fromArr = Array.isArray(from) ? from : [from];
  if (!fromArr.includes(String(expense.status))) throw AppError.badRequest(`Transition invalide : ${expense.status} → ${to}`);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.expense.update({ where: { id }, data: { status: to as any, ...extra } });
    await recordHistory(tx, id, to, userId, reason);
    return updated;
  });
}

export async function submitExpense(id: string, userId: string) {
  const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null }, select: { amountTtc: true, amountHt: true, createdById: true, status: true, description: true } });

  // ── Vérification workflow d'approbation ───────────────────────
  const pendingRequest = await approvalsService.getDocumentPendingRequest('expense', id);
  if (pendingRequest) {
    throw AppError.forbidden(`Cette dépense est en attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps})`);
  }
  const approvedRequest = await prisma.approvalRequest.findFirst({ where: { documentId: id, documentType: 'expense', status: 'approved' } });
  if (!approvedRequest) {
    const request = await approvalsService.requestApproval({
      documentType:   'expense',
      documentId:     id,
      documentNumber: `DEP-${id.slice(0, 8)}`,
      document:       { id, ...expense, totalTtc: expense?.amountTtc, totalHt: expense?.amountHt } as unknown as Record<string, unknown>,
      requestedById:  userId,
    });
    if (request) {
      await prisma.expense.update({ where: { id }, data: { requiresApproval: true } });
      throw AppError.badRequest('Cette dépense a été soumise pour approbation. Elle sera traitée après validation.');
    }
  }
  // ─────────────────────────────────────────────────────────────

  const result = await transition(id, 'draft', 'submitted', userId);
  void eventBus.emit('expense.submitted', { expenseId: id, amount: Number(expense?.amountTtc ?? 0), submittedById: userId });
  return result;
}

export async function approveExpense(id: string, userId: string) {
  const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null }, select: { amountTtc: true } });
  const result = await transition(id, 'submitted', 'approved', userId, { approvedById: userId, approvedAt: new Date() });
  void eventBus.emit('expense.approved', { expenseId: id, amount: Number(expense?.amountTtc ?? 0), approvedById: userId });
  return result;
}

export const rejectExpense = (id: string, userId: string, reason: string) =>
  transition(id, 'submitted', 'rejected', userId, { rejectionReason: reason }, reason);

export async function payExpense(id: string, userId: string) {
  const result = await transition(id, 'approved', 'paid', userId, { paidAt: new Date() });
  void prisma.$transaction((tx) => accountingEngine.onExpensePaid(id, tx));
  void eventBus.emit('expense.paid', { expenseId: id });
  return result;
}

export const cancelExpense = (id: string, userId: string) =>
  transition(id, ['draft', 'submitted', 'approved'], 'cancelled', userId);

// ── Budgets ───────────────────────────────────────────────────────────────────

export async function listBudgets(params: { year?: number; categoryId?: string; officeId?: string }) {
  const where: Record<string, unknown> = {};
  if (params.year) where['year'] = params.year;
  if (params.categoryId) where['categoryId'] = params.categoryId;
  if (params.officeId) where['officeId'] = params.officeId;

  const budgets = await prisma.expenseBudget.findMany({
    where,
    orderBy: [{ year: 'desc' }, { month: 'asc' }],
    include: { category: { select: { id: true, name: true } } },
  });

  const enriched = await Promise.all(budgets.map(async (b) => {
    const dateFilter: Record<string, unknown> = {};
    if (b.month) {
      const start = new Date(b.year, b.month - 1, 1);
      const end = new Date(b.year, b.month, 0, 23, 59, 59);
      dateFilter['expenseDate'] = { gte: start, lte: end };
    } else {
      dateFilter['expenseDate'] = {
        gte: new Date(b.year, 0, 1),
        lte: new Date(b.year, 11, 31, 23, 59, 59),
      };
    }

    const agg = await prisma.expense.aggregate({
      where: { categoryId: b.categoryId, status: 'paid' as any, deletedAt: null, ...dateFilter },
      _sum: { amountTtc: true },
    });

    const realised = Number(agg._sum.amountTtc ?? 0);
    return { ...b, realised, remaining: Number(b.budgetAmount) - realised };
  }));

  return enriched;
}

export async function createBudget(data: CreateBudgetInput) {
  const { amountBudget, ...rest } = data;
  return prisma.expenseBudget.create({ data: { ...rest, budgetAmount: amountBudget } });
}

export async function updateBudget(id: string, data: Partial<CreateBudgetInput>) {
  const budget = await prisma.expenseBudget.findUnique({ where: { id } });
  if (!budget) throw AppError.notFound('Budget introuvable');
  const { amountBudget, ...rest } = data;
  const updateData: Record<string, unknown> = { ...rest };
  if (amountBudget !== undefined) updateData['budgetAmount'] = amountBudget;
  return prisma.expenseBudget.update({ where: { id }, data: updateData as any });
}
