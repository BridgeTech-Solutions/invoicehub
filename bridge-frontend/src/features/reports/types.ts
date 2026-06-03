export interface ReportRange {
  year?: number
  quarter?: number
  dateFrom?: string
  dateTo?: string
}

export interface RevenueRow {
  month: string
  totalHt: number
  totalTax: number
  totalTtc: number
  count: number
}

export interface ClientRevenueRow {
  client: { id: string; name: string; email: string | null }
  totalHt: number
  totalTax: number
  totalTtc: number
  amountPaid: number
  balanceDue: number
  invoiceCount: number
}

export interface CategoryRevenueRow {
  category: string
  totalHt: number
  totalTtc: number
  invoiceCount: number
}

export interface UnpaidRow {
  id: string
  number: string
  client: { name: string; email: string | null; phone: string | null }
  issueDate: string
  dueDate: string
  totalTtc: string | number
  balanceDue: string | number
  status: string
}

export interface PaymentRow {
  id: string
  invoiceId: string
  paymentDate: string
  amount: string | number
  method: string
  reference: string | null
  invoice: { number: string; client: { name: string } }
}

export interface TaxSummaryRow {
  period: string
  totalHt: number
  totalTax: number
  totalTtc: number
  count: number
}

// ─── Encaissements par méthode ─────────────────────────────────
export interface PaymentMethodRow {
  method:     string
  total:      number
  count:      number
  percentage: number
}

// ─── Balance âgée (aging) ──────────────────────────────────────
export type AgingBucketKey = 'current' | 'days_1_30' | 'days_31_60' | 'days_61_90' | 'over_90'

export interface AgingRow {
  id:         string
  number:     string
  client:     { id: string; name: string; email: string | null; phone: string | null }
  issueDate:  string
  dueDate:    string
  status:     string
  totalTtc:   number
  balanceDue: number
  daysLate:   number
  bucket:     AgingBucketKey
}

export interface AgingBucket {
  label:  string
  amount: number
  count:  number
}

export interface AgingReport {
  rows:    AgingRow[]
  buckets: Record<AgingBucketKey, AgingBucket>
  total:   { amount: number; count: number }
}
