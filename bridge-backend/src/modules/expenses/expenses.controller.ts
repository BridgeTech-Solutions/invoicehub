import { Request, Response, NextFunction } from 'express';
import * as service from './expenses.service';
import {
  createExpenseCategorySchema, updateExpenseCategorySchema,
  createExpenseSchema, updateExpenseSchema,
  rejectExpenseSchema, createBudgetSchema, updateBudgetSchema,
} from './expenses.schema';

function pagination(req: Request) {
  return {
    page: Math.max(1, parseInt(String(req.query['page'] ?? '1'))),
    limit: Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20')))),
  };
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listCategories();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createExpenseCategorySchema.parse(req.body);
    const data = await service.createCategory(input);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateExpenseCategorySchema.parse(req.body);
    const data = await service.updateCategory(String(req.params['id']), input);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteCategory(String(req.params['id']));
    res.json({ success: true, message: 'Catégorie supprimée' });
  } catch (err) { next(err); }
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { data, total } = await service.listExpenses({
      page, limit,
      search: req.query['search'] as string | undefined,
      status: req.query['status'] as string | undefined,
      categoryId: req.query['categoryId'] as string | undefined,
      officeId: req.query['officeId'] as string | undefined,
      dateFrom: req.query['dateFrom'] as string | undefined,
      dateTo: req.query['dateTo'] as string | undefined,
      isEmployeeExpense: req.query['isEmployeeExpense'] === 'true' ? true
        : req.query['isEmployeeExpense'] === 'false' ? false : undefined,
    });
    res.json({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
}

export async function findById(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getExpenseById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createExpenseSchema.parse(req.body);
    const data = await service.createExpense(input, req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateExpenseSchema.parse(req.body);
    const data = await service.updateExpense(String(req.params['id']), input, req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteExpense(String(req.params['id']));
    res.json({ success: true, message: 'Dépense supprimée' });
  } catch (err) { next(err); }
}

export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.submitExpense(String(req.params['id']), req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.approveExpense(String(req.params['id']), req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = rejectExpenseSchema.parse(req.body);
    const data = await service.rejectExpense(String(req.params['id']), req.user!.id, reason);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function pay(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.payExpense(String(req.params['id']), req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.cancelExpense(String(req.params['id']), req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Budgets ───────────────────────────────────────────────────────────────────

export async function listBudgets(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listBudgets({
      year: req.query['year'] ? parseInt(String(req.query['year'])) : undefined,
      categoryId: req.query['categoryId'] as string | undefined,
      officeId: req.query['officeId'] as string | undefined,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createBudget(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createBudgetSchema.parse(req.body);
    const data = await service.createBudget(input);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateBudget(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateBudgetSchema.parse(req.body);
    const data = await service.updateBudget(String(req.params['id']), input);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
