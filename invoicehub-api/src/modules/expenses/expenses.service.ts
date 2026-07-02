import * as fs   from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AppError } from '../../common/errors/app-error';
import type { NotificationJobData } from '../../jobs/job-types';
import * as accountingEngine from '../../lib/accountingEngine';
import {
  CreateExpenseCategoryInput, CreateExpenseInput,
  UpdateExpenseInput, CreateBudgetInput, PayExpenseInput,
} from './expenses.schema';

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private approvalsService: ApprovalsService,
    @InjectQueue('notification') private readonly notifQueue: Queue<NotificationJobData>,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────────

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
      return this.formatExpense(updated);
    });
  }

  // Prisma enum (French) ↔ frontend/API values (English)
  private static readonly PM_TO_DB: Record<string, string> = {
    cash: 'especes', bank_transfer: 'virement', check: 'cheque',
    mobile_money: 'mobile_money', card: 'autre', other: 'autre',
  };
  private static readonly PM_FROM_DB: Record<string, string> = {
    especes: 'cash', virement: 'bank_transfer', cheque: 'check',
    mobile_money: 'mobile_money', autre: 'other',
  };

  // Maps DB field names → frontend field names expected by the frontend Expense type
  private formatExpense(expense: any) {
    if (!expense) return expense;
    const {
      title, beneficiaryName, reference,
      attachmentPaths, createdBy, submittedBy,
      paymentMethod,
      ...rest
    } = expense;
    return {
      ...rest,
      designation:    title ?? '',
      supplierName:   beneficiaryName ?? null,
      analyticalAxis: reference       ?? null,
      attachmentPath: Array.isArray(attachmentPaths) ? (attachmentPaths[0] ?? null) : null,
      paymentMethod:  paymentMethod ? (ExpensesService.PM_FROM_DB[String(paymentMethod)] ?? String(paymentMethod)) : null,
      submittedBy:    submittedBy ?? createdBy ?? null,
    };
  }

  // Maps input frontend field names → DB field names for create/update
  private mapInputToDb(data: Record<string, unknown>): Record<string, unknown> {
    // `currency`, `notes`, `supplierInvoiceId`, `parentId`, `period` sont acceptés
    // par le schéma mais n'existent pas sur le modèle Expense -> on les retire pour
    // ne pas casser Prisma. (NB : le commentaire libre va dans `description`, pas `notes`.)
    const { designation, supplierName, analyticalAxis, parentId, period, paymentMethod, currency, notes, supplierInvoiceId, ...rest } = data as any;
    void currency; void notes; void supplierInvoiceId;
    const mapped: Record<string, unknown> = { ...rest };
    if (designation    !== undefined) mapped['title']           = designation;
    if (supplierName   !== undefined) mapped['beneficiaryName'] = supplierName;
    if (analyticalAxis !== undefined) mapped['reference']       = analyticalAxis;
    if (paymentMethod  !== undefined) mapped['paymentMethod']   = ExpensesService.PM_TO_DB[paymentMethod] ?? paymentMethod;
    // parentId et period sont ignorés (pas en DB)
    return mapped;
  }

  // Vérifie si un budget vient de franchir 80 % ou 100 % après paiement d'une dépense
  private async checkBudgetAlerts(categoryId: string | null, paidAmountTtc: number): Promise<void> {
    if (!categoryId) return;

    const now = new Date();
    const y   = now.getFullYear();
    const m   = now.getMonth() + 1; // 1-based

    const budgets = await this.prisma.expenseBudget.findMany({
      where: {
        categoryId,
        year: y,
        OR: [{ month: null }, { month: m }],
      },
      include: { category: { select: { name: true } } },
    });
    if (budgets.length === 0) return;

    const admins = await this.prisma.user.findMany({
      where:  { role: { is: { name: 'admin' } }, status: 'active', deletedAt: null } as any,
      select: { id: true },
    });
    if (admins.length === 0) return;

    for (const budget of budgets) {
      const start = budget.month ? new Date(y, budget.month - 1, 1) : new Date(y, 0, 1);
      const end   = budget.month ? new Date(y, budget.month, 0, 23, 59, 59) : new Date(y, 11, 31, 23, 59, 59);

      const agg = await this.prisma.expense.aggregate({
        where: { categoryId, status: 'paid' as any, deletedAt: null, expenseDate: { gte: start, lte: end } },
        _sum:  { amountTtc: true },
      });

      const spent    = Number(agg._sum.amountTtc ?? 0);
      const amount   = Number(budget.budgetAmount);
      if (amount <= 0) continue;

      const prevSpent = Math.max(0, spent - paidAmountTtc);
      const prevPct   = (prevSpent / amount) * 100;
      const newPct    = (spent    / amount) * 100;

      const catName     = (budget as any).category?.name ?? 'Catégorie';
      const periodLabel = budget.month ? `${budget.month}/${y}` : `${y}`;

      const notifications: { title: string; message: string; threshold: number }[] = [];

      if (prevPct < 80 && newPct >= 80 && newPct < 100) {
        notifications.push({
          title:     `Alerte budget 80 % — ${catName}`,
          message:   `Le budget "${catName}" (${periodLabel}) est utilisé à ${Math.round(newPct)} %. Il reste ${Math.round(amount - spent).toLocaleString()} XAF.`,
          threshold: 80,
        });
      }
      if (prevPct < 100 && newPct >= 100) {
        notifications.push({
          title:     `Budget dépassé — ${catName}`,
          message:   `Le budget "${catName}" (${periodLabel}) est dépassé : ${Math.round(newPct)} % utilisé (dépassement de ${Math.round(spent - amount).toLocaleString()} XAF).`,
          threshold: 100,
        });
      }

      for (const notif of notifications) {
        await Promise.all(admins.map(admin =>
          this.notifQueue.add('notification', {
            userId:  admin.id,
            type:    'budget_exceeded',
            title:   notif.title,
            message: notif.message,
            data:    { budgetId: budget.id, categoryId, categoryName: catName, periodLabel, threshold: notif.threshold, percentUsed: Math.round(newPct) },
          }),
        ));
      }
    }
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
    const { parentId, ...dbData } = data as any; // parentId ignoré (pas en DB)
    const exists = await this.prisma.expenseCategory.findFirst({ where: { name: data.name, deletedAt: null } });
    if (exists) throw AppError.conflict('Une catégorie avec ce nom existe déjà');
    return this.prisma.expenseCategory.create({ data: dbData });
  }

  async updateCategory(id: string, data: Partial<CreateExpenseCategoryInput>) {
    const cat = await this.prisma.expenseCategory.findFirst({ where: { id, deletedAt: null } });
    if (!cat) throw AppError.notFound('Catégorie introuvable');
    const { parentId, ...dbData } = data as any;
    return this.prisma.expenseCategory.update({ where: { id }, data: dbData });
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

  async getExpenseStats() {
    const now   = new Date();
    const y     = now.getFullYear();
    const m     = now.getMonth(); // 0-based

    const monthStart   = new Date(y, m, 1);
    const monthEnd     = new Date(y, m + 1, 0, 23, 59, 59);
    const quarterStart = new Date(y, Math.floor(m / 3) * 3, 1);
    const quarterEnd   = new Date(y, Math.floor(m / 3) * 3 + 3, 0, 23, 59, 59);

    const [currentMonth, currentQuarter, pending, recurring] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { deletedAt: null, status: { not: 'cancelled' as any }, expenseDate: { gte: monthStart, lte: monthEnd } },
        _sum:  { amountTtc: true },
      }),
      this.prisma.expense.aggregate({
        where: { deletedAt: null, status: { not: 'cancelled' as any }, expenseDate: { gte: quarterStart, lte: quarterEnd } },
        _sum:  { amountTtc: true },
      }),
      this.prisma.expense.aggregate({
        where: { deletedAt: null, status: { in: ['draft', 'submitted'] as any[] } },
        _sum:  { amountTtc: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({
        where: { deletedAt: null, isRecurring: true, status: { not: 'cancelled' as any }, expenseDate: { gte: monthStart, lte: monthEnd } },
        _sum:  { amountTtc: true },
      }),
    ]);

    return {
      currentMonth:     Number(currentMonth._sum.amountTtc    ?? 0),
      currentQuarter:   Number(currentQuarter._sum.amountTtc  ?? 0),
      pendingCount:     pending._count,
      pendingAmount:    Number(pending._sum.amountTtc         ?? 0),
      recurringMonthly: Number(recurring._sum.amountTtc       ?? 0),
    };
  }

  async listExpenses(params: {
    page: number; limit: number; search?: string; status?: string;
    categoryId?: string; officeId?: string; dateFrom?: string; dateTo?: string;
    isRecurring?: boolean; isEmployeeExpense?: boolean;
  }) {
    const { page, limit, search, status, categoryId, officeId, dateFrom, dateTo, isRecurring, isEmployeeExpense } = params;
    const where: Record<string, unknown> = { deletedAt: null };
    if (status)     where['status']     = status;
    if (categoryId) where['categoryId'] = categoryId;
    if (officeId)   where['officeId']   = officeId;
    if (typeof isRecurring       === 'boolean') where['isRecurring']       = isRecurring;
    if (typeof isEmployeeExpense === 'boolean') where['isEmployeeExpense'] = isEmployeeExpense;
    if (search) where['OR'] = [
      { title:  { contains: search, mode: 'insensitive' } },
      { number: { contains: search, mode: 'insensitive' } },
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
          category:  { select: { id: true, name: true, color: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { data: data.map(e => this.formatExpense(e)), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getExpenseById(id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: {
        category:      true,
        createdBy:     { select: { id: true, firstName: true, lastName: true } },
        approvedBy:    { select: { id: true, firstName: true, lastName: true } },
        submittedBy:   { select: { id: true, firstName: true, lastName: true } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
      },
    });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    const formatted = this.formatExpense(expense) as any;
    formatted.approvalRequest = await this.approvalsService.getLatestForDocument('expense', id);
    // Brouillon : indique si la soumission déclenchera une demande d'approbation.
    formatted.willRequireApproval = expense.status === 'draft'
      ? !!(await this.approvalsService.evaluateWorkflowForDocument('expense', expense as unknown as Record<string, unknown>))
      : false;
    return formatted;
  }

  async createExpense(data: CreateExpenseInput, userId: string) {
    const dbData = this.mapInputToDb(data as any);
    const amountTtc = data.amountHt * (1 + (data.taxRate ?? 0) / 100);

    const officeIdResolved = (data as any).officeId ?? (
      await this.prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } })
    )?.id;
    if (!officeIdResolved) throw AppError.badRequest('Aucun bureau disponible');

    // Signature : fn_next_document_number(office uuid, type document_type).
    // L'ordre des arguments et le cast du type sont obligatoires (cf. documentNumber.ts).
    const [result] = await this.prisma.$queryRaw<[{ fn_next_document_number: string }]>`
      SELECT fn_next_document_number(${officeIdResolved}::uuid, 'expense'::"document_type")
    `;

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          ...dbData,
          officeId:    officeIdResolved,
          number:      result.fn_next_document_number,
          amountTtc,
          status:      'draft',
          createdById: userId,
        } as any,
      });
      await this.recordHistory(tx, expense.id, 'draft', userId);
      return this.formatExpense(expense);
    });
  }

  async updateExpense(id: string, data: UpdateExpenseInput, _userId: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    if (expense.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être modifiés');

    const dbData = this.mapInputToDb(data as any);
    const amountTtc = data.amountHt !== undefined
      ? data.amountHt * (1 + ((data.taxRate ?? Number(expense.taxRate)) / 100))
      : undefined;

    if (amountTtc !== undefined) dbData['amountTtc'] = amountTtc;
    if ((data as any).officeId === null) dbData['officeId'] = null;

    const updated = await this.prisma.expense.update({ where: { id }, data: dbData as any });
    return this.formatExpense(updated);
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

  async payExpense(id: string, userId: string, input: PayExpenseInput = {}) {
    const expense = await this.prisma.expense.findFirst({
      where:  { id, deletedAt: null },
      select: { categoryId: true, amountTtc: true },
    });

    // Compte de trésorerie réellement utilisé (banque ou caisse). On le valide et
    // on l'enregistre sur la dépense au moment du paiement → l'écriture comptable
    // créditera ce compte 5xx précis au lieu de retomber sur la banque par défaut.
    const extra: Record<string, unknown> = { paidAt: new Date() };
    if (input.bankAccountId) {
      // Refuse un compte inexistant, archivé ou désactivé (on ne paie pas depuis
      // une trésorerie hors service). Mono-entreprise : pas de cloisonnement tenant.
      const account = await this.prisma.bankAccount.findFirst({
        where: { id: input.bankAccountId, deletedAt: null, isActive: true },
      });
      if (!account) throw AppError.badRequest('Compte de trésorerie introuvable ou inactif');
      extra['bankAccountId'] = input.bankAccountId;
    }
    if (input.paymentMethod) {
      extra['paymentMethod'] = ExpensesService.PM_TO_DB[input.paymentMethod] ?? input.paymentMethod;
    }

    const result = await this.transition(id, 'approved', 'paid', userId, extra);
    void this.prisma.$transaction((tx: any) => accountingEngine.onExpensePaid(id, tx));
    this.eventEmitter.emit('expense.paid', { expenseId: id });
    // Alertes budget (fire-and-forget — ne bloque pas la réponse)
    void this.checkBudgetAlerts(expense?.categoryId ?? null, Number(expense?.amountTtc ?? 0));
    return result;
  }

  async cancelExpense(id: string, userId: string) {
    return this.transition(id, ['draft', 'submitted', 'approved'], 'cancelled', userId);
  }

  async uploadAttachment(id: string, file: Express.Multer.File) {
    if (!file) throw AppError.badRequest('Fichier manquant');
    const expense = await this.prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw AppError.notFound('Dépense introuvable');

    const uploadDir = path.join(process.cwd(), 'uploads', 'expenses');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext      = path.extname(file.originalname).toLowerCase();
    const filename = `${id}_${Date.now()}${ext}`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    const relativePath = `uploads/expenses/${filename}`;
    const current = (expense as any).attachmentPaths as string[] ?? [];
    await this.prisma.expense.update({
      where: { id },
      data:  { attachmentPaths: [...current, relativePath] } as any,
    });

    const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
    return { attachmentPath: `${backendUrl}/${relativePath}` };
  }

  async deleteAttachment(id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    await this.prisma.expense.update({ where: { id }, data: { attachmentPaths: [] } as any });
    return { success: true };
  }

  // ── Budgets ───────────────────────────────────────────────────────────────────

  async listBudgets(params: { year?: number; categoryId?: string }) {
    const where: Record<string, unknown> = {};
    if (params.year)       where['year']       = params.year;
    if (params.categoryId) where['categoryId'] = params.categoryId;

    const budgets = await this.prisma.expenseBudget.findMany({
      where, orderBy: [{ year: 'desc' }, { month: 'asc' }],
      include: { category: { select: { id: true, name: true, color: true } } },
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
      const spent  = Number(agg._sum.amountTtc ?? 0);
      const amount = Number(b.budgetAmount);
      return {
        ...b,
        amount,
        spent,
        remaining:   amount - spent,
        percentUsed: amount > 0 ? Math.round((spent / amount) * 100) : 0,
        label:       b.notes ?? b.category?.name ?? `Budget ${b.year}`,
        period:      b.month ? 'monthly' : 'annual',
      };
    }));
  }

  async createBudget(data: CreateBudgetInput) {
    const { amount, label, period, officeId, ...rest } = data as any; // officeId ignoré (pas en DB)
    const notes = label ?? rest.notes ?? undefined;
    return this.prisma.expenseBudget.create({
      data: {
        ...rest,
        budgetAmount: amount,
        notes,
      },
    });
  }

  async deleteBudget(id: string) {
    const budget = await this.prisma.expenseBudget.findUnique({ where: { id } });
    if (!budget) throw AppError.notFound('Budget introuvable');
    await this.prisma.expenseBudget.delete({ where: { id } });
  }

  async updateBudget(id: string, data: Partial<CreateBudgetInput>) {
    const budget = await this.prisma.expenseBudget.findUnique({ where: { id } });
    if (!budget) throw AppError.notFound('Budget introuvable');
    const { amount, label, period, ...rest } = data as any;
    const updateData: Record<string, unknown> = { ...rest };
    if (amount !== undefined) updateData['budgetAmount'] = amount;
    if (label  !== undefined) updateData['notes']        = label;
    return this.prisma.expenseBudget.update({ where: { id }, data: updateData as any });
  }
}
