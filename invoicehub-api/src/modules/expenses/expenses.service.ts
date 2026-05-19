import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AppError } from '../../common/errors/app-error';
import * as accountingEngine from '../../lib/accountingEngine';
import {
  CreateExpenseCategoryInput, CreateExpenseInput,
  UpdateExpenseInput, CreateBudgetInput,
} from './expenses.schema';

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private approvalsService: ApprovalsService,
  ) {}

  private async recordHistory(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    expenseId: string, newStatus: string, userId: string, reason?: string | null,
  ) {
    await tx.expenseStatusHistory.create({
      data: { expenseId, newStatus: newStatus as any, changedById: userId, reason: reason ?? undefined },
    });
  }

  private async transition(
    id: string, from: string | string[], to: string, userId: string,
    extra?: Record<string, unknown>, reason?: string,
  ) {
    const expense = await this.prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    const fromArr = Array.isArray(from) ? from : [from];
    if (!fromArr.includes(String(expense.status))) {
      throw AppError.badRequest(`Transition invalide : ${expense.status} → ${to}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({ where: { id }, data: { status: to as any, ...extra } });
      await this.recordHistory(tx, id, to, userId, reason);
      return updated;
    });
  }

  // ── Categories ────────────────────────────────────────────────────────────────

  async listCategories() {
    return this.prisma.expenseCategory.findMany({
      where:   { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { expenses: true } } },
    });
  }

  async createCategory(data: CreateExpenseCategoryInput) {
    const exists = await this.prisma.expenseCategory.findFirst({ where: { name: data.name, deletedAt: null } });
    if (exists) throw AppError.conflict('Une catégorie avec ce nom existe déjà');
    return this.prisma.expenseCategory.create({ data });
  }

  async updateCategory(id: string, data: Partial<CreateExpenseCategoryInput>) {
    const cat = await this.prisma.expenseCategory.findFirst({ where: { id, deletedAt: null } });
    if (!cat) throw AppError.notFound('Catégorie introuvable');
    return this.prisma.expenseCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: string) {
    const cat = await this.prisma.expenseCategory.findFirst({
      where:   { id, deletedAt: null },
      include: { _count: { select: { expenses: true } } },
    });
    if (!cat) throw AppError.notFound('Catégorie introuvable');
    if (cat._count.expenses > 0) throw AppError.conflict('Des dépenses sont liées à cette catégorie');
    await this.prisma.expenseCategory.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Expenses ──────────────────────────────────────────────────────────────────

  async listExpenses(params: {
    page: number; limit: number; search?: string; status?: string;
    categoryId?: string; officeId?: string; dateFrom?: string; dateTo?: string;
    isEmployeeExpense?: boolean;
  }) {
    const { page, limit, search, status, categoryId, officeId, dateFrom, dateTo, isEmployeeExpense } = params;
    const where: Record<string, unknown> = { deletedAt: null };
    if (status)     where['status']     = status;
    if (categoryId) where['categoryId'] = categoryId;
    if (officeId)   where['officeId']   = officeId;
    if (typeof isEmployeeExpense === 'boolean') where['isEmployeeExpense'] = isEmployeeExpense;
    if (search) where['OR'] = [
      { title:         { contains: search, mode: 'insensitive' } },
      { expenseNumber: { contains: search, mode: 'insensitive' } },
    ];
    if (dateFrom || dateTo) {
      where['expenseDate'] = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          category:  { select: { id: true, name: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { data, total };
  }

  async getExpenseById(id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: {
        category:      true,
        createdBy:     { select: { id: true, firstName: true, lastName: true } },
        approvedBy:    { select: { id: true, firstName: true, lastName: true } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
      },
    });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    return expense;
  }

  async createExpense(data: CreateExpenseInput, userId: string) {
    const amountTtc = data.amountHt * (1 + (data.taxRate ?? 0) / 100);

    const officeIdResolved = data.officeId ?? (
      await this.prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } })
    )?.id;
    if (!officeIdResolved) throw AppError.badRequest('Aucun bureau disponible');

    const [result] = await this.prisma.$queryRaw<[{ fn_next_document_number: string }]>`
      SELECT fn_next_document_number('expense', ${officeIdResolved}::uuid)
    `;

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          ...(data as any), officeId: officeIdResolved,
          number: result.fn_next_document_number,
          amountTtc, status: 'draft' as any, createdById: userId,
        },
      });
      await this.recordHistory(tx, expense.id, 'draft', userId);
      return expense;
    });
  }

  async updateExpense(id: string, data: UpdateExpenseInput, _userId: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    if (expense.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être modifiés');

    const amountTtc = data.amountHt !== undefined
      ? data.amountHt * (1 + ((data.taxRate ?? Number(expense.taxRate)) / 100))
      : undefined;

    const updateData: Record<string, unknown> = { ...data };
    if (amountTtc !== undefined) updateData['amountTtc'] = amountTtc;
    if (data.officeId === null)  updateData['officeId']  = null;

    return this.prisma.expense.update({ where: { id }, data: updateData as any });
  }

  async deleteExpense(id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    if (expense.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être supprimés');
    await this.prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async submitExpense(id: string, userId: string) {
    const expense = await this.prisma.expense.findFirst({
      where:  { id, deletedAt: null },
      select: { amountTtc: true, amountHt: true, createdById: true, status: true, description: true },
    });

    const pendingRequest = await this.approvalsService.getDocumentPendingRequest('expense', id);
    if (pendingRequest) {
      throw AppError.forbidden(`En attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps})`);
    }
    const approvedRequest = await this.prisma.approvalRequest.findFirst({
      where: { documentId: id, documentType: 'expense', status: 'approved' },
    });
    if (!approvedRequest) {
      const request = await this.approvalsService.requestApproval({
        documentType:   'expense',
        documentId:     id,
        documentNumber: `DEP-${id.slice(0, 8)}`,
        document:       { id, ...expense, totalTtc: expense?.amountTtc, totalHt: expense?.amountHt } as unknown as Record<string, unknown>,
        requestedById:  userId,
      });
      if (request) {
        await this.prisma.expense.update({ where: { id }, data: { requiresApproval: true } });
        throw AppError.badRequest('Dépense soumise pour approbation. Elle sera traitée après validation.');
      }
    }

    const result = await this.transition(id, 'draft', 'submitted', userId);
    this.eventEmitter.emit('expense.submitted', { expenseId: id, amount: Number(expense?.amountTtc ?? 0), submittedById: userId });
    return result;
  }

  async approveExpense(id: string, userId: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, deletedAt: null }, select: { amountTtc: true } });
    const result  = await this.transition(id, 'submitted', 'approved', userId, { approvedById: userId, approvedAt: new Date() });
    this.eventEmitter.emit('expense.approved', { expenseId: id, amount: Number(expense?.amountTtc ?? 0), approvedById: userId });
    return result;
  }

  async rejectExpense(id: string, userId: string, reason: string) {
    return this.transition(id, 'submitted', 'rejected', userId, { rejectionReason: reason }, reason);
  }

  async payExpense(id: string, userId: string) {
    const result = await this.transition(id, 'approved', 'paid', userId, { paidAt: new Date() });
    void this.prisma.$transaction((tx: any) => accountingEngine.onExpensePaid(id, tx));
    this.eventEmitter.emit('expense.paid', { expenseId: id });
    return result;
  }

  async cancelExpense(id: string, userId: string) {
    return this.transition(id, ['draft', 'submitted', 'approved'], 'cancelled', userId);
  }

  // ── Budgets ───────────────────────────────────────────────────────────────────

  async listBudgets(params: { year?: number; categoryId?: string; officeId?: string }) {
    const where: Record<string, unknown> = {};
    if (params.year)       where['year']       = params.year;
    if (params.categoryId) where['categoryId'] = params.categoryId;
    if (params.officeId)   where['officeId']   = params.officeId;

    const budgets = await this.prisma.expenseBudget.findMany({
      where, orderBy: [{ year: 'desc' }, { month: 'asc' }],
      include: { category: { select: { id: true, name: true } } },
    });

    return Promise.all(budgets.map(async (b) => {
      const dateFilter: Record<string, unknown> = {};
      if (b.month) {
        dateFilter['expenseDate'] = {
          gte: new Date(b.year, b.month - 1, 1),
          lte: new Date(b.year, b.month, 0, 23, 59, 59),
        };
      } else {
        dateFilter['expenseDate'] = {
          gte: new Date(b.year, 0, 1), lte: new Date(b.year, 11, 31, 23, 59, 59),
        };
      }
      const agg = await this.prisma.expense.aggregate({
        where: { categoryId: b.categoryId, status: 'paid' as any, deletedAt: null, ...dateFilter },
        _sum:  { amountTtc: true },
      });
      const realised = Number(agg._sum.amountTtc ?? 0);
      return { ...b, realised, remaining: Number(b.budgetAmount) - realised };
    }));
  }

  async createBudget(data: CreateBudgetInput) {
    const { amountBudget, ...rest } = data;
    return this.prisma.expenseBudget.create({ data: { ...rest, budgetAmount: amountBudget } });
  }

  async updateBudget(id: string, data: Partial<CreateBudgetInput>) {
    const budget = await this.prisma.expenseBudget.findUnique({ where: { id } });
    if (!budget) throw AppError.notFound('Budget introuvable');
    const { amountBudget, ...rest } = data;
    const updateData: Record<string, unknown> = { ...rest };
    if (amountBudget !== undefined) updateData['budgetAmount'] = amountBudget;
    return this.prisma.expenseBudget.update({ where: { id }, data: updateData as any });
  }
}
