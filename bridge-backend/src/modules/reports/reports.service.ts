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
        SUM(total_ht)::numeric  AS ht,
        SUM(total_tax)::numeric AS tax,
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

    const rows = await prisma.invoice.groupBy({
      by: ['clientId'],
      where: {
        deletedAt: null,
        status: { notIn: ['draft', 'cancelled'] },
        issueDate: { gte: dateFrom, lte: dateTo },
      },
      _sum: { totalHt: true, totalTax: true, totalTtc: true, amountPaid: true, balanceDue: true },
      _count: true,
      orderBy: { _sum: { totalTtc: 'desc' } },
    });

    const clients = await prisma.client.findMany({
      where: { id: { in: rows.map(r => r.clientId) } },
      select: { id: true, name: true, email: true },
    });
    const clientMap = new Map(clients.map(c => [c.id, c]));

    return rows.map(r => ({
      client:     clientMap.get(r.clientId) ?? { id: r.clientId, name: 'Inconnu', email: null },
      totalHt:    Number(r._sum.totalHt ?? 0),
      totalTax:   Number(r._sum.totalTax ?? 0),
      totalTtc:   Number(r._sum.totalTtc ?? 0),
      amountPaid: Number(r._sum.amountPaid ?? 0),
      balanceDue: Number(r._sum.balanceDue ?? 0),
      invoiceCount: r._count,
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
        SUM(total_ht)::numeric  AS ht,
        SUM(total_tax)::numeric AS tax,
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
