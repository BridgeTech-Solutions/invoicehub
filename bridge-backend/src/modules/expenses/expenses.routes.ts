import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';
import * as ctrl from './expenses.controller';

export const expenseCategoriesRouter: Router = Router();
export const expensesRouter: Router = Router();
export const expenseBudgetsRouter: Router = Router();

// ── Categories ────────────────────────────────────────────────────────────────
expenseCategoriesRouter.use(authenticate);
expenseCategoriesRouter.get('/',    authorizePermission('expenses:read'),   ctrl.listCategories);
expenseCategoriesRouter.post('/',   authorizePermission('expenses:manage'), ctrl.createCategory);
expenseCategoriesRouter.put('/:id', authorizePermission('expenses:manage'), ctrl.updateCategory);
expenseCategoriesRouter.delete('/:id', authorizePermission('expenses:manage'), ctrl.deleteCategory);

// ── Expenses ──────────────────────────────────────────────────────────────────
expensesRouter.use(authenticate);
expensesRouter.get('/',    authorizePermission('expenses:read'),   ctrl.list);
expensesRouter.post('/',   authorizePermission('expenses:create'), auditMiddleware('expense', 'CREATE'), ctrl.create);
expensesRouter.get('/:id', authorizePermission('expenses:read'),   ctrl.findById);
expensesRouter.put('/:id', authorizePermission('expenses:update'), auditMiddleware('expense', 'UPDATE'), ctrl.update);
expensesRouter.delete('/:id', authorizePermission('expenses:delete'), auditMiddleware('expense', 'SOFT_DELETE'), ctrl.remove);

expensesRouter.post('/:id/submit', authorizePermission('expenses:submit'),  auditMiddleware('expense', 'STATUS_CHANGE'), ctrl.submit);
expensesRouter.post('/:id/approve', authorizePermission('expenses:approve'), auditMiddleware('expense', 'STATUS_CHANGE'), ctrl.approve);
expensesRouter.post('/:id/reject',  authorizePermission('expenses:approve'), auditMiddleware('expense', 'STATUS_CHANGE'), ctrl.reject);
expensesRouter.post('/:id/pay',     authorizePermission('expenses:pay'),     auditMiddleware('expense', 'STATUS_CHANGE'), ctrl.pay);
expensesRouter.post('/:id/cancel',  authorizePermission('expenses:approve'), auditMiddleware('expense', 'STATUS_CHANGE'), ctrl.cancel);

// ── Budgets ───────────────────────────────────────────────────────────────────
expenseBudgetsRouter.use(authenticate);
expenseBudgetsRouter.get('/',    authorizePermission('expenses:read'),   ctrl.listBudgets);
expenseBudgetsRouter.post('/',   authorizePermission('expenses:manage'), ctrl.createBudget);
expenseBudgetsRouter.put('/:id', authorizePermission('expenses:manage'), ctrl.updateBudget);
