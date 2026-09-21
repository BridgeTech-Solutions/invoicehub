import { apiClient } from '@/lib/api-client'
import type {
  Expense, PaginatedExpenses, ExpenseStats,
  ExpenseCategory, ExpenseBudget,
  CreateExpensePayload, UpdateExpensePayload, ListExpensesParams,
  CreateBudgetPayload, BudgetSummary,
} from './types'

export const expensesApi = {
  // ─── Expenses ────────────────────────────────────────────────
  list: (params?: ListExpensesParams) =>
    apiClient.get<PaginatedExpenses>('/expenses', { params }).then(r => r.data),

  get: (id: string) =>
    apiClient.get<Expense>(`/expenses/${id}`).then(r => r.data),

  stats: () =>
    apiClient.get<ExpenseStats>('/expenses/stats').then(r => r.data),

  create: (data: CreateExpensePayload) =>
    apiClient.post<Expense>('/expenses', data).then(r => r.data),

  update: (id: string, data: UpdateExpensePayload) =>
    apiClient.put<Expense>(`/expenses/${id}`, data).then(r => r.data),

  submit: (id: string) =>
    apiClient.post<Expense>(`/expenses/${id}/submit`).then(r => r.data),

  approve: (id: string) =>
    apiClient.post<Expense>(`/expenses/${id}/approve`).then(r => r.data),

  reject: (id: string, reason: string) =>
    apiClient.post<Expense>(`/expenses/${id}/reject`, { reason }).then(r => r.data),

  markPaid: (id: string, payload?: { bankAccountId?: string | null; paymentMethod?: string | null }) =>
    apiClient.post<Expense>(`/expenses/${id}/pay`, payload ?? {}).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/expenses/${id}`),

  uploadAttachment: async (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<{ attachmentPath: string }>(`/expenses/${id}/attachment`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  // ─── Categories ───────────────────────────────────────────────
  listCategories: () =>
    apiClient.get<ExpenseCategory[]>('/expense-categories').then(r => r.data),

  createCategory: (data: { name: string; description?: string; color?: string; icon?: string; accountingAccount?: string; parentId?: string }) =>
    apiClient.post<ExpenseCategory>('/expense-categories', data).then(r => r.data),

  updateCategory: (id: string, data: Partial<{ name: string; description: string; color: string; icon: string; accountingAccount: string; isActive: boolean }>) =>
    apiClient.put<ExpenseCategory>(`/expense-categories/${id}`, data).then(r => r.data),

  deleteCategory: (id: string) =>
    apiClient.delete(`/expense-categories/${id}`),

  // ─── Budgets ──────────────────────────────────────────────────
  listBudgets: (year: number) =>
    apiClient.get<ExpenseBudget[]>('/expense-budgets', { params: { year } }).then(r => r.data),

  createBudget: (data: CreateBudgetPayload) =>
    apiClient.post<ExpenseBudget>('/expense-budgets', data).then(r => r.data),

  updateBudget: (id: string, data: Partial<CreateBudgetPayload> & { reason?: string }) =>
    apiClient.put<ExpenseBudget>(`/expense-budgets/${id}`, data).then(r => r.data),

  deleteBudget: (id: string) =>
    apiClient.delete(`/expense-budgets/${id}`),

  budgetSummary: (year: number) =>
    apiClient.get<BudgetSummary>('/expense-budgets/summary', { params: { year } }).then(r => r.data),

  activateBudget: (id: string) =>
    apiClient.post(`/expense-budgets/${id}/activate`).then(r => r.data as ExpenseBudget),

  spreadBudget: (id: string) =>
    apiClient.post(`/expense-budgets/${id}/spread`).then(r => r.data as { spread: number; monthlyAmount: number; year: number }),

  budgetRevisions: (id: string) =>
    apiClient.get(`/expense-budgets/${id}/revisions`).then(r => r.data as { id: string; previousAmount: number; newAmount: number; reason: string | null; createdAt: string; changedBy: { firstName: string; lastName: string } | null }[]),

  carryOverBudgets: (fromYear: number, toYear: number, basis: 'budget' | 'remaining') =>
    apiClient.post('/expense-budgets/carry-over', { fromYear, toYear, basis }).then(r => r.data as { created: number; skipped: number }),

  importBudgets: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient.post('/expense-budgets/import', fd).then(r => r.data as { created: number; errors: { row: number; message: string }[] })
  },

  exportBudgets: async (year: number, format: 'xlsx' | 'pdf') => {
    const res = await apiClient.get('/expense-budgets/export', { params: { year, format }, responseType: 'blob' })
    const type = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'
    const url  = URL.createObjectURL(new Blob([res.data], { type }))
    const a    = document.createElement('a')
    a.href = url; a.download = `Budgets_${year}.${format}`; a.click()
    URL.revokeObjectURL(url)
  },
}
