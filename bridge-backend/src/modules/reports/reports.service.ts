/**
 * @module modules/reports/reports.service
 * Génération des rapports financiers.
 *
 * Rapports disponibles :
 *  - revenue        : CA mensuel agrégé
 *  - by-client      : CA par client classé
 *  - by-category    : CA par catégorie de produit
 *  - unpaid         : Situation des impayés
 *  - payments       : Journal des encaissements
 *  - tax-summary    : Récapitulatif TVA par trimestre
 */
import { prisma } from '../../config/database';

export interface DateRangeInput {
  dateFrom?: Date;
  dateTo?: Date;
  year?: number;
  quarter?: number;
}

export class ReportsService {
  async getRevenue(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);

    const rows = await prisma.$queryRaw<Array<{ month: string; ht: number; tax: number; ttc: number; count: bigint }>>`
      SELECT
        TO_CHAR(issue_date, 'YYYY-MM') AS month,
        SUM(CASE WHEN type = 'acompte' AND acompte_percentage > 0
              THEN total_ht * acompte_percentage / 100
              ELSE total_ht END)::numeric  AS ht,
        SUM(CASE WHEN type = 'acompte' AND acompte_percentage > 0
              THEN total_tax * acompte_percentage / 100
              ELSE total_tax END)::numeric AS tax,
        SUM(total_ttc)::numeric AS ttc,
        COUNT(*)                AS count
      FROM invoices
      WHERE deleted_at IS NULL
        AND status NOT IN ('draft', 'cancelled')
        AND issue_date >= ${dateFrom}
        AND issue_date <= ${dateTo}
      GROUP BY month
      ORDER BY month ASC
    `;

    return rows.map(r => ({
      month:  r.month,
      totalHt:  Number(r.ht),
      totalTax: Number(r.tax),
      totalTtc: Number(r.ttc),
      count:    Number(r.count),
    }));
  }

  async getRevenueByClient(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);

    const rows = await prisma.$queryRaw<Array<{
      client_id: string; client_name: string; client_email: string | null;
      ht: number; tax: number; ttc: number; amount_paid: number; balance_due: number; cnt: bigint;
    }>>`
      SELECT
        c.id          AS client_id,
        c.name        AS client_name,
        c.email       AS client_email,
        SUM(CASE WHEN i.type = 'acompte' AND i.acompte_percentage > 0
              THEN i.total_ht * i.acompte_percentage / 100
              ELSE i.total_ht END)::numeric  AS ht,
        SUM(CASE WHEN i.type = 'acompte' AND i.acompte_percentage > 0
              THEN i.total_tax * i.acompte_percentage / 100
              ELSE i.total_tax END)::numeric AS tax,
        SUM(i.total_ttc)::numeric    AS ttc,
        SUM(i.amount_paid)::numeric  AS amount_paid,
        SUM(i.balance_due)::numeric  AS balance_due,
        COUNT(*)                     AS cnt
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      WHERE i.deleted_at IS NULL
        AND i.status NOT IN ('draft', 'cancelled')
        AND i.issue_date >= ${dateFrom}
        AND i.issue_date <= ${dateTo}
      GROUP BY c.id, c.name, c.email
      ORDER BY ttc DESC
    `;

    return rows.map(r => ({
      client:       { id: r.client_id, name: r.client_name, email: r.client_email },
      totalHt:      Number(r.ht),
      totalTax:     Number(r.tax),
      totalTtc:     Number(r.ttc),
      amountPaid:   Number(r.amount_paid),
      balanceDue:   Number(r.balance_due),
      invoiceCount: Number(r.cnt),
    }));
  }

  async getRevenueByCategory(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);

    const rows = await prisma.$queryRaw<Array<{ category: string; ht: number; ttc: number; count: bigint }>>`
      SELECT
        COALESCE(pc.name, 'Sans catégorie') AS category,
        SUM(il.net_ht)::numeric  AS ht,
        SUM(il.total_ttc)::numeric AS ttc,
        COUNT(DISTINCT i.id)     AS count
      FROM invoice_lines il
      JOIN invoices i     ON il.invoice_id = i.id
      LEFT JOIN products p     ON il.product_id = p.id
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE i.deleted_at IS NULL
        AND i.status NOT IN ('draft', 'cancelled')
        AND i.issue_date >= ${dateFrom}
        AND i.issue_date <= ${dateTo}
      GROUP BY category
      ORDER BY ht DESC
    `;

    return rows.map(r => ({
      category: r.category,
      totalHt:  Number(r.ht),
      totalTtc: Number(r.ttc),
      invoiceCount: Number(r.count),
    }));
  }

  async getUnpaid() {
    return prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { in: ['issued', 'partially_paid', 'overdue'] },
      },
      include: { client: { select: { name: true, email: true, phone: true } } },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getPayments(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);

    return prisma.payment.findMany({
      where: {
        deletedAt: null,
        paymentDate: { gte: dateFrom, lte: dateTo },
      },
      include: {
        invoice: {
          select: {
            number: true,
            client: { select: { name: true } },
          },
        },
      },
      orderBy: { paymentDate: 'asc' },
    });
  }

  async getTaxSummary(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);

    const rows = await prisma.$queryRaw<Array<{ period: string; ht: number; tax: number; ttc: number; count: bigint }>>`
      SELECT
        TO_CHAR(issue_date, 'YYYY "T"Q') AS period,
        SUM(CASE WHEN type = 'acompte' AND acompte_percentage > 0
              THEN total_ht * acompte_percentage / 100
              ELSE total_ht END)::numeric  AS ht,
        SUM(CASE WHEN type = 'acompte' AND acompte_percentage > 0
              THEN total_tax * acompte_percentage / 100
              ELSE total_tax END)::numeric AS tax,
        SUM(total_ttc)::numeric AS ttc,
        COUNT(*)                AS count
      FROM invoices
      WHERE deleted_at IS NULL
        AND status NOT IN ('draft', 'cancelled')
        AND issue_date >= ${dateFrom}
        AND issue_date <= ${dateTo}
      GROUP BY period
      ORDER BY period ASC
    `;

    return rows.map(r => ({
      period:   r.period,
      totalHt:  Number(r.ht),
      totalTax: Number(r.tax),
      totalTtc: Number(r.ttc),
      count:    Number(r.count),
    }));
  }

  private _resolveDateRange(input: DateRangeInput): { dateFrom: Date; dateTo: Date } {
    if (input.dateFrom && input.dateTo) {
      return { dateFrom: input.dateFrom, dateTo: input.dateTo };
    }

    const year = input.year ?? new Date().getFullYear();

    if (input.quarter) {
      const startMonth = (input.quarter - 1) * 3;
      return {
        dateFrom: new Date(year, startMonth, 1),
        dateTo:   new Date(year, startMonth + 3, 0, 23, 59, 59),
      };
    }

    return {
      dateFrom: new Date(year, 0, 1),
      dateTo:   new Date(year, 11, 31, 23, 59, 59),
    };
  }
}

export const reportsService = new ReportsService();
