import * as fs from 'fs';
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
import { recordAccountingEvent } from '../../lib/accounting-outbox';
import {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  UpdateExpenseInput,
  CreateBudgetInput,
  PayExpenseInput,
} from './expenses.schema';

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private approvalsService: ApprovalsService,
    @InjectQueue('notification')
    private readonly notifQueue: Queue<NotificationJobData>,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async recordHistory(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    expenseId: string,
    newStatus: string,
    userId: string,
    reason?: string | null,
  ) {
    await tx.expenseStatusHistory.create({
      data: {
        expenseId,
        newStatus: newStatus as any,
        changedById: userId,
        reason: reason ?? undefined,
      },
    });
  }

  private async transition(
    id: string,
    from: string | string[],
    to: string,
    userId: string,
    extra?: Record<string, unknown>,
    reason?: string,
  ) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
    });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    const fromArr = Array.isArray(from) ? from : [from];
    if (!fromArr.includes(String(expense.status))) {
      throw AppError.badRequest(
        `Transition invalide : ${expense.status} → ${to}`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: { status: to as any, ...extra },
      });
      await this.recordHistory(tx, id, to, userId, reason);
      return this.formatExpense(updated);
    });
  }

  // Prisma enum (French) ↔ frontend/API values (English)
  private static readonly PM_TO_DB: Record<string, string> = {
    cash: 'especes',
    bank_transfer: 'virement',
    check: 'cheque',
    mobile_money: 'mobile_money',
    card: 'autre',
    other: 'autre',
  };
  private static readonly PM_FROM_DB: Record<string, string> = {
    especes: 'cash',
    virement: 'bank_transfer',
    cheque: 'check',
    mobile_money: 'mobile_money',
    autre: 'other',
  };

  // Maps DB field names → frontend field names expected by the frontend Expense type
  private formatExpense(expense: any) {
    if (!expense) return expense;
    const {
      title,
      beneficiaryName,
      reference,
      attachmentPaths,
      createdBy,
      submittedBy,
      paymentMethod,
      ...rest
    } = expense;
    return {
      ...rest,
      designation: title ?? '',
      supplierName: beneficiaryName ?? null,
      analyticalAxis: reference ?? null,
      attachmentPath: Array.isArray(attachmentPaths)
        ? (attachmentPaths[0] ?? null)
        : null,
      paymentMethod: paymentMethod
        ? (ExpensesService.PM_FROM_DB[String(paymentMethod)] ??
          String(paymentMethod))
        : null,
      submittedBy: submittedBy ?? createdBy ?? null,
    };
  }

  // Maps input frontend field names → DB field names for create/update
  private mapInputToDb(data: Record<string, unknown>): Record<string, unknown> {
    // `currency`, `notes`, `supplierInvoiceId`, `parentId`, `period` sont acceptés
    // par le schéma mais n'existent pas sur le modèle Expense -> on les retire pour
    // ne pas casser Prisma. (NB : le commentaire libre va dans `description`, pas `notes`.)
    const {
      designation,
      supplierName,
      analyticalAxis,
      parentId,
      period,
      paymentMethod,
      currency,
      notes,
      supplierInvoiceId,
      ...rest
    } = data as any;
    void currency;
    void notes;
    void supplierInvoiceId;
    const mapped: Record<string, unknown> = { ...rest };
    if (designation !== undefined) mapped['title'] = designation;
    if (supplierName !== undefined) mapped['beneficiaryName'] = supplierName;
    if (analyticalAxis !== undefined) mapped['reference'] = analyticalAxis;
    if (paymentMethod !== undefined)
      mapped['paymentMethod'] =
        ExpensesService.PM_TO_DB[paymentMethod] ?? paymentMethod;
    // parentId et period sont ignorés (pas en DB)
    return mapped;
  }

  // Vérifie si un budget vient de franchir 80 % ou 100 % après paiement d'une dépense
  /**
   * Alerte les administrateurs au FRANCHISSEMENT d'un seuil de budget (80 %, 100 %).
   *
   * La période analysée est celle de la DÉPENSE, pas celle du jour. Auparavant elle
   * était déduite de `new Date()` : payer en juillet une dépense datée de janvier
   * interrogeait le budget de juillet tout en retranchant un montant absent de cet
   * agrégat — d'où des alertes sur un mois où rien n'avait bougé, et un dépassement
   * réel de janvier jamais signalé.
   */
  /** Config du contrôle budgétaire (company_settings.budgetControl), avec défauts. */
  private async budgetControlConfig(): Promise<{ warnThresholdPct: number; blockOnExceed: boolean; notifyRoles: string[] }> {
    const s = await this.prisma.companySettings.findFirst({ select: { budgetControl: true } });
    const c = (s?.budgetControl ?? {}) as Record<string, unknown>;
    return {
      warnThresholdPct: typeof c['warnThresholdPct'] === 'number' ? (c['warnThresholdPct'] as number) : 80,
      blockOnExceed:    c['blockOnExceed'] === true,
      notifyRoles:      Array.isArray(c['notifyRoles']) && (c['notifyRoles'] as unknown[]).length ? (c['notifyRoles'] as string[]) : ['admin'],
    };
  }

  private async notifyBudget(budgetId: string, label: string, pct: number, exceeded: boolean, roles: string[]) {
    const recipients = await this.prisma.user.findMany({
      where: { role: { is: { name: { in: roles } } }, status: 'active', deletedAt: null } as any,
      select: { id: true },
    });
    if (recipients.length === 0) return;
    const title = exceeded ? `Budget dépassé — ${label}` : `Alerte budget ${pct} % — ${label}`;
    const message = exceeded
      ? `Le budget « ${label} » est dépassé : ${pct} % consommé (engagé + réalisé).`
      : `Le budget « ${label} » atteint ${pct} % (engagé + réalisé).`;
    await Promise.all(recipients.map((u) => this.notifQueue.add('notification', {
      userId: u.id, type: 'budget_exceeded', title, message, data: { budgetId, threshold: pct, exceeded },
    })));
  }

  /**
   * Évalue les budgets impactés par une dépense — appelé à l'APPROBATION (moment où
   * la dépense entre dans l'« engagé » et augmente le consommé). Le paiement ne
   * change pas le consommé (engagé → réalisé), donc le contrôle est ici, en amont.
   * enforce + blockOnExceed → refuse l'approbation ; sinon notifie au seuil.
   */
  private async evaluateBudgetForExpense(expenseId: string, opts: { enforce: boolean }): Promise<void> {
    const exp = await this.prisma.expense.findUnique({
      where:  { id: expenseId },
      select: { expenseDate: true, categoryId: true, officeId: true, accountingAccount: true, category: { select: { accountingAccount: true, name: true } } },
    });
    if (!exp) return;
    const account = exp.accountingAccount ?? exp.category?.accountingAccount ?? null;
    if (!account) return; // dépense non rattachée à un compte → aucun budget applicable

    const ref = exp.expenseDate ? new Date(exp.expenseDate) : new Date();
    const y = ref.getUTCFullYear();

    // Budgets de l'année dont le compte est un préfixe du compte de la dépense,
    // dimensions compatibles, et dont la période contient la date de la dépense.
    const yearBudgets = await this.prisma.expenseBudget.findMany({
      where:   { year: y, accountNumber: { not: null } },
      include: { category: { select: { name: true } } },
    });
    const matching = yearBudgets.filter((b) => {
      if (!b.accountNumber || !account.startsWith(b.accountNumber)) return false;
      if (b.categoryId && b.categoryId !== exp.categoryId) return false;
      if (b.officeId && b.officeId !== exp.officeId) return false;
      const win = ExpensesService.budgetWindow(b);
      return ref >= win.gte && ref <= win.lte;
    });
    if (matching.length === 0) return;

    const config = await this.budgetControlConfig();

    for (const b of matching) {
      const amount = Number(b.budgetAmount);
      if (amount <= 0) continue;
      const kind = ExpensesService.budgetKind(b.accountNumber);
      const win  = ExpensesService.budgetWindow(b);
      const consumed = (await this.budgetRealized(b.accountNumber!, kind, win)) + (await this.budgetEngaged(b.accountNumber!, kind, win));
      const pct = Math.round((consumed / amount) * 100);
      const label = b.notes ?? (b as any).category?.name ?? b.accountNumber!;

      if (opts.enforce && config.blockOnExceed && consumed > amount) {
        throw AppError.badRequest(
          `Approbation refusée : le budget « ${label} » serait dépassé (${pct} % — ${Math.round(consumed - amount).toLocaleString('fr-FR')} XAF au-dessus). Ajustez le budget ou rejetez la dépense.`,
        );
      }
      if (pct >= config.warnThresholdPct) {
        await this.notifyBudget(b.id, label, pct, consumed > amount, config.notifyRoles);
      }
    }
  }

  // ── Categories ────────────────────────────────────────────────────────────────

  async listCategories() {
    return this.prisma.expenseCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { expenses: true } } },
    });
  }

  async createCategory(data: CreateExpenseCategoryInput) {
    const { parentId, ...dbData } = data as any; // parentId ignoré (pas en DB)
    const exists = await this.prisma.expenseCategory.findFirst({
      where: { name: data.name, deletedAt: null },
    });
    if (exists)
      throw AppError.conflict('Une catégorie avec ce nom existe déjà');
    return this.prisma.expenseCategory.create({ data: dbData });
  }

  async updateCategory(id: string, data: Partial<CreateExpenseCategoryInput>) {
    const cat = await this.prisma.expenseCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!cat) throw AppError.notFound('Catégorie introuvable');
    const { parentId, ...dbData } = data as any;
    return this.prisma.expenseCategory.update({ where: { id }, data: dbData });
  }

  async deleteCategory(id: string) {
    const cat = await this.prisma.expenseCategory.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { expenses: true } } },
    });
    if (!cat) throw AppError.notFound('Catégorie introuvable');
    if (cat._count.expenses > 0)
      throw AppError.conflict('Des dépenses sont liées à cette catégorie');
    await this.prisma.expenseCategory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ── Expenses ──────────────────────────────────────────────────────────────────

  async getExpenseStats() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-based

    const monthStart = new Date(y, m, 1);
    const monthEnd = new Date(y, m + 1, 0, 23, 59, 59);
    const quarterStart = new Date(y, Math.floor(m / 3) * 3, 1);
    const quarterEnd = new Date(y, Math.floor(m / 3) * 3 + 3, 0, 23, 59, 59);

    const [currentMonth, currentQuarter, pending, recurring] =
      await Promise.all([
        this.prisma.expense.aggregate({
          where: {
            deletedAt: null,
            status: { not: 'cancelled' as any },
            expenseDate: { gte: monthStart, lte: monthEnd },
          },
          _sum: { amountTtc: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            deletedAt: null,
            status: { not: 'cancelled' as any },
            expenseDate: { gte: quarterStart, lte: quarterEnd },
          },
          _sum: { amountTtc: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            deletedAt: null,
            status: { in: ['draft', 'submitted'] as any[] },
          },
          _sum: { amountTtc: true },
          _count: true,
        }),
        this.prisma.expense.aggregate({
          where: {
            deletedAt: null,
            isRecurring: true,
            status: { not: 'cancelled' as any },
            expenseDate: { gte: monthStart, lte: monthEnd },
          },
          _sum: { amountTtc: true },
        }),
      ]);

    return {
      currentMonth: Number(currentMonth._sum.amountTtc ?? 0),
      currentQuarter: Number(currentQuarter._sum.amountTtc ?? 0),
      pendingCount: pending._count,
      pendingAmount: Number(pending._sum.amountTtc ?? 0),
      recurringMonthly: Number(recurring._sum.amountTtc ?? 0),
    };
  }

  async listExpenses(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    categoryId?: string;
    officeId?: string;
    dateFrom?: string;
    dateTo?: string;
    isRecurring?: boolean;
    isEmployeeExpense?: boolean;
  }) {
    const {
      page,
      limit,
      search,
      status,
      categoryId,
      officeId,
      dateFrom,
      dateTo,
      isRecurring,
      isEmployeeExpense,
    } = params;
    const where: Record<string, unknown> = { deletedAt: null };
    if (status) where['status'] = status;
    if (categoryId) where['categoryId'] = categoryId;
    if (officeId) where['officeId'] = officeId;
    if (typeof isRecurring === 'boolean') where['isRecurring'] = isRecurring;
    if (typeof isEmployeeExpense === 'boolean')
      where['isEmployeeExpense'] = isEmployeeExpense;
    if (search)
      where['OR'] = [
        { title: { contains: search, mode: 'insensitive' } },
        { number: { contains: search, mode: 'insensitive' } },
      ];
    if (dateFrom || dateTo) {
      where['expenseDate'] = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true, color: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.expense.count({ where }),
    ]);
    return {
      data: data.map((e) => this.formatExpense(e)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getExpenseById(id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        submittedBy: { select: { id: true, firstName: true, lastName: true } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
      },
    });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    const formatted = this.formatExpense(expense) as any;
    formatted.approvalRequest =
      await this.approvalsService.getLatestForDocument('expense', id);
    // Brouillon : indique si la soumission déclenchera une demande d'approbation.
    formatted.willRequireApproval =
      expense.status === 'draft'
        ? !!(await this.approvalsService.evaluateWorkflowForDocument(
            'expense',
            expense as unknown as Record<string, unknown>,
          ))
        : false;
    return formatted;
  }

  async createExpense(data: CreateExpenseInput, userId: string) {
    const dbData = this.mapInputToDb(data as any);
    const amountTtc = data.amountHt * (1 + (data.taxRate ?? 0) / 100);

    const officeIdResolved =
      (data as any).officeId ??
      (
        await this.prisma.agencyOffice.findFirst({
          where: { deletedAt: null },
          select: { id: true },
        })
      )?.id;
    if (!officeIdResolved) throw AppError.badRequest('Aucun bureau disponible');

    // Signature : fn_next_document_number(office uuid, type document_type).
    // L'ordre des arguments et le cast du type sont obligatoires (cf. documentNumber.ts).
    const [result] = await this.prisma.$queryRaw<
      [{ fn_next_document_number: string }]
    >`
      SELECT fn_next_document_number(${officeIdResolved}::uuid, 'expense'::"document_type")
    `;

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          ...dbData,
          officeId: officeIdResolved,
          number: result.fn_next_document_number,
          amountTtc,
          status: 'draft',
          createdById: userId,
        } as any,
      });
      await this.recordHistory(tx, expense.id, 'draft', userId);
      return this.formatExpense(expense);
    });
  }

  async updateExpense(id: string, data: UpdateExpenseInput, _userId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
    });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    if (expense.status !== 'draft')
      throw AppError.badRequest('Seuls les brouillons peuvent être modifiés');

    const dbData = this.mapInputToDb(data as any);
    const amountTtc =
      data.amountHt !== undefined
        ? data.amountHt * (1 + (data.taxRate ?? Number(expense.taxRate)) / 100)
        : undefined;

    if (amountTtc !== undefined) dbData['amountTtc'] = amountTtc;
    if ((data as any).officeId === null) dbData['officeId'] = null;

    const updated = await this.prisma.expense.update({
      where: { id },
      data: dbData as any,
    });
    return this.formatExpense(updated);
  }

  async deleteExpense(id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
    });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    if (expense.status !== 'draft')
      throw AppError.badRequest('Seuls les brouillons peuvent être supprimés');
    await this.prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async submitExpense(id: string, userId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
      select: {
        amountTtc: true,
        amountHt: true,
        createdById: true,
        status: true,
        description: true,
      },
    });

    const pendingRequest =
      await this.approvalsService.getDocumentPendingRequest('expense', id);
    if (pendingRequest) {
      throw AppError.forbidden(
        `En attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps})`,
      );
    }
    const approvedRequest = await this.prisma.approvalRequest.findFirst({
      where: { documentId: id, documentType: 'expense', status: 'approved' },
    });
    if (!approvedRequest) {
      const request = await this.approvalsService.requestApproval({
        documentType: 'expense',
        documentId: id,
        documentNumber: `DEP-${id.slice(0, 8)}`,
        document: {
          id,
          ...expense,
          totalTtc: expense?.amountTtc,
          totalHt: expense?.amountHt,
        } as unknown as Record<string, unknown>,
        requestedById: userId,
      });
      if (request) {
        await this.prisma.expense.update({
          where: { id },
          data: { requiresApproval: true },
        });
        throw AppError.badRequest(
          'Dépense soumise pour approbation. Elle sera traitée après validation.',
        );
      }
    }

    const result = await this.transition(id, 'draft', 'submitted', userId);
    this.eventEmitter.emit('expense.submitted', {
      expenseId: id,
      amount: Number(expense?.amountTtc ?? 0),
      submittedById: userId,
    });
    return result;
  }

  async approveExpense(id: string, userId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
      select: { amountTtc: true },
    });
    // Contrôle a priori : bloque l'approbation si le budget serait dépassé (config
    // blockOnExceed), sinon notifie au franchissement du seuil. AVANT la transition.
    await this.evaluateBudgetForExpense(id, { enforce: true });
    const result = await this.transition(id, 'submitted', 'approved', userId, {
      approvedById: userId,
      approvedAt: new Date(),
    });
    this.eventEmitter.emit('expense.approved', {
      expenseId: id,
      amount: Number(expense?.amountTtc ?? 0),
      approvedById: userId,
    });
    return result;
  }

  async rejectExpense(id: string, userId: string, reason: string) {
    return this.transition(
      id,
      'submitted',
      'rejected',
      userId,
      { rejectionReason: reason },
      reason,
    );
  }

  async payExpense(id: string, userId: string, input: PayExpenseInput = {}) {
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
      if (!account)
        throw AppError.badRequest(
          'Compte de trésorerie introuvable ou inactif',
        );
      extra['bankAccountId'] = input.bankAccountId;
    }
    if (input.paymentMethod) {
      extra['paymentMethod'] =
        ExpensesService.PM_TO_DB[input.paymentMethod] ?? input.paymentMethod;
    }

    const result = await this.transition(id, 'approved', 'paid', userId, extra);
    // Outbox : l'écriture de dépense sera rejouée si la tentative immédiate échoue
    // (onExpensePaid avale son erreur → une dépense pouvait rester sans écriture).
    await recordAccountingEvent(this.prisma as any, 'onExpensePaid', 'expense', id);
    void this.prisma.$transaction((tx: any) =>
      accountingEngine.onExpensePaid(id, tx),
    );
    this.eventEmitter.emit('expense.paid', { expenseId: id });
    // NB : le contrôle budgétaire est fait à l'APPROBATION (le paiement ne change pas
    // le consommé : engagé → réalisé). On ne re-notifie donc pas ici.
    return result;
  }

  async cancelExpense(id: string, userId: string) {
    return this.transition(
      id,
      ['draft', 'submitted', 'approved'],
      'cancelled',
      userId,
    );
  }

  async uploadAttachment(id: string, file: Express.Multer.File) {
    if (!file) throw AppError.badRequest('Fichier manquant');
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
    });
    if (!expense) throw AppError.notFound('Dépense introuvable');

    const uploadDir = path.join(process.cwd(), 'uploads', 'expenses');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${id}_${Date.now()}${ext}`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    const relativePath = `uploads/expenses/${filename}`;
    const current = ((expense as any).attachmentPaths as string[]) ?? [];
    await this.prisma.expense.update({
      where: { id },
      data: { attachmentPaths: [...current, relativePath] } as any,
    });

    // URL de l'endpoint AUTHENTIFIÉ de téléchargement (jamais un chemin statique :
    // document financier). Le frontend le récupère via l'apiClient (avec jeton).
    const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3005';
    const apiSeg = (process.env['API_PREFIX'] ?? '/api').replace(/^\/+|\/+$/g, '');
    return { attachmentPath: `${backendUrl}/${apiSeg}/expenses/${id}/attachments/${filename}` };
  }

  async deleteAttachment(id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
    });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    await this.prisma.expense.update({
      where: { id },
      data: { attachmentPaths: [] } as any,
    });
    return { success: true };
  }

  /**
   * Stream authentifié d'un justificatif. Contrôles : nom de fichier sûr,
   * appartenance à la dépense (présent dans `attachmentPaths`), et confinement du
   * chemin à uploads/expenses (anti-traversée).
   */
  async streamAttachment(id: string, filename: string, res: import('express').Response) {
    const SAFE = /^[A-Za-z0-9._-]+$/;
    if (!SAFE.test(filename) || filename.includes('..')) {
      res.status(400).json({ error: 'Nom de fichier invalide' }); return;
    }
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
      select: { attachmentPaths: true } as any,
    });
    if (!expense) { res.status(404).json({ error: 'Dépense introuvable' }); return; }

    const rel = `uploads/expenses/${filename}`;
    const paths = ((expense as any).attachmentPaths as string[]) ?? [];
    if (!paths.includes(rel)) { res.status(404).json({ error: 'Justificatif introuvable' }); return; }

    const baseDir  = path.resolve(process.cwd(), 'uploads', 'expenses');
    const filePath = path.resolve(baseDir, filename);
    if (!filePath.startsWith(baseDir + path.sep)) { res.status(403).json({ error: 'Accès refusé' }); return; }
    if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Fichier absent du serveur' }); return; }

    const ext = path.extname(filePath).toLowerCase();
    const mime: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.pdf': 'application/pdf',
    };
    res.setHeader('Content-Type', mime[ext] ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(filePath);
  }

  // ══ Budgets (par compte comptable 6/7 + dimensions) ═══════════════════════════

  // Fenêtre calendaire d'un budget selon sa périodicité, bornée en UTC (les dates
  // comptables/dépenses sont @db.Date → minuit UTC).
  private static budgetWindow(b: { periodType: string; year: number; quarter: number | null; month: number | null }) {
    const y = b.year;
    if (b.periodType === 'monthly' && b.month) {
      return { gte: new Date(Date.UTC(y, b.month - 1, 1)), lte: new Date(Date.UTC(y, b.month, 0, 23, 59, 59)) };
    }
    if (b.periodType === 'quarterly' && b.quarter) {
      const startM = (b.quarter - 1) * 3;
      return { gte: new Date(Date.UTC(y, startM, 1)), lte: new Date(Date.UTC(y, startM + 3, 0, 23, 59, 59)) };
    }
    return { gte: new Date(Date.UTC(y, 0, 1)), lte: new Date(Date.UTC(y, 11, 31, 23, 59, 59)) };
  }

  private static budgetKind(accountNumber?: string | null): 'charge' | 'revenue' | 'other' {
    if (accountNumber?.startsWith('6')) return 'charge';
    if (accountNumber?.startsWith('7')) return 'revenue';
    return 'other';
  }

  /** Réalisé depuis le GRAND-LIVRE (couvre charges 6 ET produits 7). */
  private async budgetRealized(accountNumber: string, kind: 'charge' | 'revenue' | 'other', win: { gte: Date; lte: Date }): Promise<number> {
    const agg = await this.prisma.journalEntryLine.aggregate({
      where: {
        accountNumber: { startsWith: accountNumber },
        journalEntry: { status: { not: 'cancelled' as any }, entryDate: { gte: win.gte, lte: win.lte } },
      },
      _sum: { debit: true, credit: true },
    });
    const d = Number(agg._sum.debit ?? 0), c = Number(agg._sum.credit ?? 0);
    return kind === 'revenue' ? c - d : d - c; // charge : solde débiteur ; produit : solde créditeur
  }

  /** Engagé = dépenses approuvées/soumises NON encore payées (pas d'écriture) mappées au compte. */
  private async budgetEngaged(accountNumber: string, kind: 'charge' | 'revenue' | 'other', win: { gte: Date; lte: Date }): Promise<number> {
    if (kind !== 'charge') return 0;
    const agg = await this.prisma.expense.aggregate({
      where: {
        status: { in: ['submitted', 'approved'] as any },
        deletedAt: null,
        expenseDate: { gte: win.gte, lte: win.lte },
        OR: [
          { accountingAccount: { startsWith: accountNumber } },
          { accountingAccount: null, category: { accountingAccount: { startsWith: accountNumber } } },
        ],
      },
      _sum: { amountTtc: true },
    });
    return Number(agg._sum.amountTtc ?? 0);
  }

  async listBudgets(params: { year?: number; categoryId?: string; officeId?: string; accountNumber?: string }) {
    const where: Record<string, unknown> = {};
    if (params.year)          where['year'] = params.year;
    if (params.categoryId)    where['categoryId'] = params.categoryId;
    if (params.officeId)      where['officeId'] = params.officeId;
    if (params.accountNumber) where['accountNumber'] = params.accountNumber;

    const budgets = await this.prisma.expenseBudget.findMany({
      where,
      orderBy: [{ year: 'desc' }, { accountNumber: 'asc' }, { month: 'asc' }],
      include: {
        category: { select: { id: true, name: true, color: true } },
        office:   { select: { id: true, name: true, code: true } },
      },
    });

    // Noms des comptes budgétés (une seule requête).
    const accountNumbers = [...new Set(budgets.map((b) => b.accountNumber).filter(Boolean) as string[])];
    const accounts = accountNumbers.length
      ? await this.prisma.chartOfAccount.findMany({ where: { accountNumber: { in: accountNumbers } }, select: { accountNumber: true, name: true } })
      : [];
    const accountName = new Map(accounts.map((a) => [a.accountNumber, a.name]));

    return Promise.all(
      budgets.map(async (b) => {
        const amount = Number(b.budgetAmount);
        const kind   = ExpensesService.budgetKind(b.accountNumber);
        const win    = ExpensesService.budgetWindow(b);

        const realized = b.accountNumber ? await this.budgetRealized(b.accountNumber, kind, win) : 0;
        const engaged  = b.accountNumber ? await this.budgetEngaged(b.accountNumber, kind, win)  : 0;
        const available = amount - engaged - realized;
        const consumed  = engaged + realized; // engagé + réalisé, pour la jauge

        return {
          ...b,
          amount,
          kind,
          accountNumber: b.accountNumber,
          accountName:   b.accountNumber ? accountName.get(b.accountNumber) ?? null : null,
          officeName:    b.office?.name ?? null,
          realized,
          engaged,
          available,
          consumed,
          // Rétro-compat champs existants
          spent:       realized,
          remaining:   available,
          percentUsed: amount > 0 ? Math.round((consumed / amount) * 100) : 0,
          label:  b.notes ?? accountName.get(b.accountNumber ?? '') ?? b.category?.name ?? `Budget ${b.year}`,
          period: b.periodType,
        };
      }),
    );
  }

  /** Valide le compte budgété : existant, imputable, actif, et de classe 6 ou 7. */
  private async assertBudgetAccount(accountNumber?: string | null) {
    if (!accountNumber) return;
    const acc = await this.prisma.chartOfAccount.findUnique({
      where:  { accountNumber },
      select: { isDetailAccount: true, isActive: true },
    });
    if (!acc) throw AppError.badRequest(`Compte budgété inexistant au plan comptable : ${accountNumber}.`);
    if (acc.isActive === false) throw AppError.badRequest(`Compte budgété désactivé : ${accountNumber}.`);
    if (!(accountNumber.startsWith('6') || accountNumber.startsWith('7')))
      throw AppError.badRequest('Un budget cible un compte de charges (classe 6) ou de produits (classe 7).');
  }

  private normalizeBudgetPeriod(period?: string, month?: number | null, quarter?: number | null) {
    const periodType = period === 'monthly' || period === 'quarterly' ? period : 'annual';
    return {
      periodType,
      month:   periodType === 'monthly'   ? (month   ?? null) : null,
      quarter: periodType === 'quarterly' ? (quarter ?? null) : null,
    };
  }

  private async assertBudgetUnique(args: { accountNumber: string | null; categoryId: string | null; officeId: string | null; year: number; periodType: string; month: number | null; quarter: number | null; excludeId?: string }) {
    const dup = await this.prisma.expenseBudget.findFirst({
      where: {
        accountNumber: args.accountNumber, categoryId: args.categoryId, officeId: args.officeId,
        year: args.year, periodType: args.periodType, month: args.month, quarter: args.quarter,
        ...(args.excludeId ? { id: { not: args.excludeId } } : {}),
      },
      select: { id: true },
    });
    if (dup) throw AppError.conflict('Un budget existe déjà pour ce compte, cette dimension et cette période.');
  }

  async createBudget(data: CreateBudgetInput, userId: string) {
    const { amount, label, period, accountNumber, categoryId, officeId, month, quarter, notes: rawNotes } = data as any;
    const p = this.normalizeBudgetPeriod(period, month, quarter);
    const notes = label ?? rawNotes ?? undefined;

    if (!accountNumber && !categoryId) throw AppError.badRequest('Précisez au moins un compte comptable ou une catégorie.');
    await this.assertBudgetAccount(accountNumber);
    if (categoryId) {
      const cat = await this.prisma.expenseCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
      if (!cat) throw AppError.badRequest('Catégorie de dépense introuvable.');
    }
    await this.assertBudgetUnique({ accountNumber: accountNumber ?? null, categoryId: categoryId ?? null, officeId: officeId ?? null, year: data.year, ...p });

    return this.prisma.expenseBudget.create({
      data: {
        accountNumber: accountNumber ?? null, categoryId: categoryId ?? null, officeId: officeId ?? null,
        year: data.year, periodType: p.periodType, month: p.month, quarter: p.quarter,
        budgetAmount: amount, notes, createdById: userId,
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

    const { amount, label, period, accountNumber, categoryId, officeId, month, quarter, notes: rawNotes } = data as any;
    const updateData: Record<string, unknown> = {};
    if (amount        !== undefined) updateData['budgetAmount']  = amount;
    if (label         !== undefined) updateData['notes']         = label;
    else if (rawNotes !== undefined) updateData['notes']         = rawNotes;
    if (accountNumber !== undefined) updateData['accountNumber'] = accountNumber ?? null;
    if (categoryId    !== undefined) updateData['categoryId']    = categoryId ?? null;
    if (officeId      !== undefined) updateData['officeId']      = officeId ?? null;
    if (data.year     !== undefined) updateData['year']          = data.year;
    if (period !== undefined || month !== undefined || quarter !== undefined) {
      const p = this.normalizeBudgetPeriod(period ?? budget.periodType, month ?? budget.month, quarter ?? budget.quarter);
      updateData['periodType'] = p.periodType; updateData['month'] = p.month; updateData['quarter'] = p.quarter;
    }

    const next = {
      accountNumber: (updateData['accountNumber'] as string | null) ?? budget.accountNumber,
      categoryId:    (updateData['categoryId'] as string | null) ?? budget.categoryId,
      officeId:      (updateData['officeId'] as string | null) ?? budget.officeId,
      year:          (updateData['year'] as number) ?? budget.year,
      periodType:    (updateData['periodType'] as string) ?? budget.periodType,
      month:         ('month' in updateData) ? (updateData['month'] as number | null) : budget.month,
      quarter:       ('quarter' in updateData) ? (updateData['quarter'] as number | null) : budget.quarter,
    };
    if (accountNumber !== undefined) await this.assertBudgetAccount(next.accountNumber);
    if (categoryId) {
      const cat = await this.prisma.expenseCategory.findUnique({ where: { id: next.categoryId! }, select: { id: true } });
      if (!cat) throw AppError.badRequest('Catégorie de dépense introuvable.');
    }
    await this.assertBudgetUnique({ ...next, excludeId: id });

    return this.prisma.expenseBudget.update({ where: { id }, data: updateData as any });
  }
}
