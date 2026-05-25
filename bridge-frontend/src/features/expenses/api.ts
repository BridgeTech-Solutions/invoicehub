import { apiClient } from '@/lib/api-client'
import type {
  Expense, PaginatedExpenses, ExpenseStats,
  ExpenseCategory, ExpenseBudget,
  CreateExpensePayload, UpdateExpensePayload, ListExpensesParams,
  CreateBudgetPayload,
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

  reject: (id: string, reason?: string) =>
    apiClient.post<Expense>(`/expenses/${id}/reject`, { reason }).then(r => r.data),

  markPaid: (id: string) =>
    apiClient.post<Expense>(`/expenses/${id}/pay`).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/expenses/${id}`),

  uploadAttachment: async (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<{ attachmentPath: string }>(`/expenses/${id}/attachment`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  exportCsv: async (params?: ListExpensesParams) => {
    const res = await apiClient.get('/expenses', {
      params: { ...params, export: 'csv', page: 1, limit: 10_000 },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a   = document.createElement('a')
    a.href = url; a.download = 'depenses.csv'; a.click()
    URL.revokeObjectURL(url)
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

  updateBudget: (id: string, data: Partial<CreateBudgetPayload>) =>
    apiClient.put<ExpenseBudget>(`/expense-budgets/${id}`, data).then(r => r.data),

  deleteBudget: (id: string) =>
    apiClient.delete(`/expense-budgets/${id}`),
}
