// ─── Dashboard API types ───────────────────────────────────────

export interface RecentInvoice {
  id:         string
  number:     string
  status:     string
  totalTtc:   number
  issueDate:  string
  dueDate:    string
  client:     { name: string }
}

export interface TopClient {
  clientId:     string
  clientName:   string
  totalRevenue: number
}

export interface MonthlyRevenue {
  month: string   // "2026-03"
  total: number
}

export interface DashboardKpis {
  invoices: {
    totalAmount:      number
    totalCount:       number
    thisMonthAmount:  number
    thisMonthCount:   number
  }
  overdue: {
    amount: number
    count:  number
  }
  payments: {
    thisMonthAmount: number
  }
  pending: {
    amount: number
    count:  number
  }
  drafts: {
    count: number
  }
  clients: {
    activeCount: number
  }
  proformas: {
    thisMonthCount: number
  }
  // ─── Achats & Finance (déjà calculés par le backend) ─────────
  purchases: {
    thisMonthAmount: number
    thisMonthCount:  number
  }
  payables: {
    outstandingAmount: number
    count:             number
  }
  expenses: {
    thisMonthAmount: number
    thisMonthCount:  number
  }
  grossMarginMonth: number
  cashPosition: {
    total:        number
    accountCount: number
  }
  stockAlerts: number
  recentInvoices:  RecentInvoice[]
  topClients:      TopClient[]
  topSuppliers:    TopSupplier[]
  expensesByCategory: ExpenseCategoryStat[]
  monthlyRevenue:  MonthlyRevenue[]
}

export interface TopSupplier {
  supplierId:     string
  supplierName:   string
  totalPurchases: number
}

export interface ExpenseCategoryStat {
  categoryId:   string | null
  categoryName: string
  totalAmount:  number
  count:        number
}

export interface AgingBucket {
  amount: number
  count:  number
}

export interface DashboardAging {
  current:    AgingBucket
  days_1_30:  AgingBucket
  days_31_60: AgingBucket
  days_61_90: AgingBucket
  over_90:    AgingBucket
  total:      AgingBucket
}

// ─── Chart data shapes ─────────────────────────────────────────

export interface ChartDataPoint {
  label:   string
  value:   number
  display: string    // formatted label for XAxis
}

export type PeriodToggle = 'month' | 'quarter' | 'year'

// ─── Cashflow forecast ─────────────────────────────────────────

export interface CashflowDay {
  date:         string   // "2026-04-15"
  expected:     number   // montant prévu ce jour (XAF)
  invoiceCount: number
  cumulative:   number   // cumulatif depuis J+0
}
