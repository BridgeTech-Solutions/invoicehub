import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveDocumentAssets } from '../../lib/pdf';

export interface DateRangeInput {
  dateFrom?: Date; dateTo?: Date; year?: number; quarter?: number;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private _resolveDateRange(input: DateRangeInput): { dateFrom: Date; dateTo: Date } {
    if (input.dateFrom && input.dateTo) return { dateFrom: input.dateFrom, dateTo: input.dateTo };
    const year = input.year ?? new Date().getFullYear();
    if (input.quarter) {
      const startMonth = (input.quarter - 1) * 3;
      return { dateFrom: new Date(year, startMonth, 1), dateTo: new Date(year, startMonth + 3, 0, 23, 59, 59) };
    }
    return { dateFrom: new Date(year, 0, 1), dateTo: new Date(year, 11, 31, 23, 59, 59) };
  }

  async getRevenue(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);
    const rows = await this.prisma.$queryRaw<Array<{ month: string; ht: number; tax: number; ttc: number; count: bigint }>>`
      SELECT TO_CHAR(issue_date, 'YYYY-MM') AS month,
        SUM(CASE WHEN type='acompte' AND acompte_percentage>0 THEN total_ht*acompte_percentage/100 ELSE total_ht END)::numeric AS ht,
        SUM(CASE WHEN type='acompte' AND acompte_percentage>0 THEN total_tax*acompte_percentage/100 ELSE total_tax END)::numeric AS tax,
        SUM(CASE WHEN type='acompte' AND acompte_percentage>0 THEN total_ttc*acompte_percentage/100 ELSE total_ttc END)::numeric AS ttc,
        COUNT(*) AS count
      FROM invoices WHERE deleted_at IS NULL AND status NOT IN ('draft','cancelled')
        AND issue_date >= ${dateFrom} AND issue_date <= ${dateTo}
      GROUP BY month ORDER BY month ASC`;
    return rows.map(r => ({ month: r.month, totalHt: Number(r.ht), totalTax: Number(r.tax), totalTtc: Number(r.ttc), count: Number(r.count) }));
  }

  async getRevenueByClient(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);
    const rows = await this.prisma.$queryRaw<Array<{ client_id: string; client_name: string; client_email: string | null; ht: number; tax: number; ttc: number; amount_paid: number; balance_due: number; cnt: bigint }>>`
      SELECT c.id AS client_id, c.name AS client_name, c.email AS client_email,
        SUM(CASE WHEN i.type='acompte' AND i.acompte_percentage>0 THEN i.total_ht*i.acompte_percentage/100 ELSE i.total_ht END)::numeric AS ht,
        SUM(CASE WHEN i.type='acompte' AND i.acompte_percentage>0 THEN i.total_tax*i.acompte_percentage/100 ELSE i.total_tax END)::numeric AS tax,
        SUM(CASE WHEN i.type='acompte' AND i.acompte_percentage>0 THEN i.total_ttc*i.acompte_percentage/100 ELSE i.total_ttc END)::numeric AS ttc,
        SUM(i.amount_paid)::numeric AS amount_paid, SUM(i.balance_due)::numeric AS balance_due, COUNT(*) AS cnt
      FROM invoices i JOIN clients c ON i.client_id=c.id
      WHERE i.deleted_at IS NULL AND i.status NOT IN ('draft','cancelled')
        AND i.issue_date >= ${dateFrom} AND i.issue_date <= ${dateTo}
      GROUP BY c.id, c.name, c.email ORDER BY ttc DESC`;
    return rows.map(r => ({ client: { id: r.client_id, name: r.client_name, email: r.client_email }, totalHt: Number(r.ht), totalTax: Number(r.tax), totalTtc: Number(r.ttc), amountPaid: Number(r.amount_paid), balanceDue: Number(r.balance_due), invoiceCount: Number(r.cnt) }));
  }

  async getRevenueByCategory(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);
    const rows = await this.prisma.$queryRaw<Array<{ category: string; ht: number; ttc: number; count: bigint }>>`
      SELECT COALESCE(pc.name,'Sans catégorie') AS category, SUM(il.net_ht)::numeric AS ht, SUM(il.total_ttc)::numeric AS ttc, COUNT(DISTINCT i.id) AS count
      FROM invoice_lines il JOIN invoices i ON il.invoice_id=i.id LEFT JOIN products p ON il.product_id=p.id LEFT JOIN product_categories pc ON p.category_id=pc.id
      WHERE i.deleted_at IS NULL AND i.status NOT IN ('draft','cancelled') AND i.issue_date >= ${dateFrom} AND i.issue_date <= ${dateTo}
      GROUP BY category ORDER BY ht DESC`;
    return rows.map(r => ({ category: r.category, totalHt: Number(r.ht), totalTtc: Number(r.ttc), invoiceCount: Number(r.count) }));
  }

  async getUnpaid(input?: DateRangeInput) {
    const { dateFrom, dateTo } = input ? this._resolveDateRange(input) : { dateFrom: undefined, dateTo: undefined };
    return this.prisma.invoice.findMany({
      where: { deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] }, ...(dateFrom && dateTo ? { issueDate: { gte: dateFrom, lte: dateTo } } : {}) },
      select: { id: true, number: true, clientReference: true, issueDate: true, dueDate: true, status: true, totalTtc: true, amountPaid: true, balanceDue: true, client: { select: { name: true, email: true, phone: true } } },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getPayments(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);
    return this.prisma.payment.findMany({
      where: { deletedAt: null, paymentDate: { gte: dateFrom, lte: dateTo } },
      include: { invoice: { select: { number: true, client: { select: { name: true } } } } },
      orderBy: { paymentDate: 'asc' },
    });
  }

  async getTaxSummary(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);
    const rows = await this.prisma.$queryRaw<Array<{ period: string; ht: number; tax: number; ttc: number; count: bigint }>>`
      SELECT TO_CHAR(issue_date,'YYYY "T"Q') AS period,
        SUM(CASE WHEN type='acompte' AND acompte_percentage>0 THEN total_ht*acompte_percentage/100 ELSE total_ht END)::numeric AS ht,
        SUM(CASE WHEN type='acompte' AND acompte_percentage>0 THEN total_tax*acompte_percentage/100 ELSE total_tax END)::numeric AS tax,
        SUM(CASE WHEN type='acompte' AND acompte_percentage>0 THEN total_ttc*acompte_percentage/100 ELSE total_ttc END)::numeric AS ttc,
        COUNT(*) AS count
      FROM invoices WHERE deleted_at IS NULL AND status NOT IN ('draft','cancelled')
        AND issue_date >= ${dateFrom} AND issue_date <= ${dateTo}
      GROUP BY period ORDER BY period ASC`;
    return rows.map(r => ({ period: r.period, totalHt: Number(r.ht), totalTax: Number(r.tax), totalTtc: Number(r.ttc), count: Number(r.count) }));
  }

  async getAgingReport() {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const invoices = await this.prisma.invoice.findMany({
      where: { deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] } },
      select: { id: true, number: true, clientReference: true, issueDate: true, dueDate: true, status: true, totalTtc: true, amountPaid: true, balanceDue: true, client: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { dueDate: 'asc' },
    });

    const buckets = {
      current:    { label: 'Courant',  amount: 0, count: 0 },
      days_1_30:  { label: '1-30j',    amount: 0, count: 0 },
      days_31_60: { label: '31-60j',   amount: 0, count: 0 },
      days_61_90: { label: '61-90j',   amount: 0, count: 0 },
      over_90:    { label: '> 90j',    amount: 0, count: 0 },
    };

    const rows = invoices.map(inv => {
      const daysLateVal = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);
      const amount   = Number(inv.balanceDue);
      let bucket: keyof typeof buckets;
      if      (daysLateVal <= 0)  bucket = 'current';
      else if (daysLateVal <= 30) bucket = 'days_1_30';
      else if (daysLateVal <= 60) bucket = 'days_31_60';
      else if (daysLateVal <= 90) bucket = 'days_61_90';
      else                        bucket = 'over_90';
      buckets[bucket].amount += amount; buckets[bucket].count += 1;
      return { id: inv.id, number: inv.number, client: inv.client, issueDate: inv.issueDate, dueDate: inv.dueDate, status: inv.status, totalTtc: Number(inv.totalTtc), balanceDue: amount, daysLate: Math.max(0, daysLateVal), bucket };
    });

    const total = Object.values(buckets).reduce((acc, b) => ({ amount: acc.amount + b.amount, count: acc.count + b.count }), { amount: 0, count: 0 });
    return { rows, buckets, total };
  }

  async getPaymentsByMethod(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);
    const rows = await this.prisma.$queryRaw<Array<{ method: string; total: number; count: bigint }>>`
      SELECT p.method, SUM(p.amount)::numeric AS total, COUNT(*) AS count
      FROM payments p WHERE p.deleted_at IS NULL AND p.payment_date >= ${dateFrom} AND p.payment_date <= ${dateTo}
      GROUP BY p.method ORDER BY total DESC`;
    const grandTotal = rows.reduce((s, r) => s + Number(r.total), 0);
    return rows.map(r => ({ method: r.method, total: Number(r.total), count: Number(r.count), percentage: grandTotal > 0 ? Math.round((Number(r.total) / grandTotal) * 100) : 0 }));
  }

  async getReportAssets() {
    const settings = await this.prisma.companySettings.findFirst({ select: { companyName: true, headerImagePath: true, footerImagePath: true } });
    const { headerImageB64, footerImageB64 } = resolveDocumentAssets(settings ?? null);
    return {
      companyName: settings?.companyName ?? 'Bridge Technologies Solutions',
      headerImageB64,
      footerImageB64,
    };
  }
}
