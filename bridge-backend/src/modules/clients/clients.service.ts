import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import type { CreateClientInput, UpdateClientInput, ListClientsInput } from './clients.schema';

export class ClientsService {
  async list(input: ListClientsInput) {
    const { page, limit, type, status, search, city } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {
      deletedAt: null,
      ...(type && { type }),
      ...(status && { status }),
      ...(city && { city: { contains: city, mode: 'insensitive' } }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { taxNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const client = await prisma.client.findFirst({ where: { id, deletedAt: null } });
    if (!client) throw AppError.notFound('Client introuvable');
    return client;
  }

  async create(input: CreateClientInput, createdById: string) {
    return prisma.client.create({
      data: { ...input, createdById, metadata: input.metadata ?? {} },
    });
  }

  async update(id: string, input: UpdateClientInput) {
    await this.findById(id);
    return prisma.client.update({ where: { id }, data: input });
  }

  async archive(id: string): Promise<void> {
    await this.findById(id);
    await prisma.client.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'archived' },
    });
  }

  /**
   * Retourne les données de pré-remplissage intelligent pour un nouveau document.
   *
   * Agrège en un seul appel :
   *  - Produits les plus facturés à ce client (avec dernier prix et fréquence)
   *  - Conditions de paiement et remise du dernier document
   *  - Solde impayé en cours
   *  - Comportement de paiement (retard moyen, taux ponctualité)
   *  - Date d'échéance suggérée selon les paramètres de l'entreprise
   */
  async quickFill(clientId: string) {
    await this.findById(clientId);

    const settings = await prisma.companySettings.findFirst({
      select: { defaultInvoiceDueDays: true },
    });
    const dueDays = settings?.defaultInvoiceDueDays ?? 30;

    type ProductRow = {
      product_id: string; name: string; reference: string | null;
      unit: string; last_price_ht: string; usage_count: bigint;
    };
    type BehaviorRow = {
      avg_days_late: number | null; on_time_count: bigint; total_paid: bigint;
    };

    const [suggestedProductsRaw, lastInvoice, unpaidAgg, behaviorRaw] = await Promise.all([

      // Top 5 produits les plus utilisés avec ce client (avec dernier prix)
      prisma.$queryRaw<ProductRow[]>`
        WITH ranked AS (
          SELECT
            il.product_id,
            il.unit_price_ht,
            ROW_NUMBER() OVER (PARTITION BY il.product_id ORDER BY i.created_at DESC) AS rn,
            COUNT(*) OVER (PARTITION BY il.product_id) AS usage_count
          FROM invoice_lines il
          JOIN invoices i ON i.id = il.invoice_id
          WHERE i.client_id = ${clientId}::uuid
            AND i.deleted_at IS NULL
            AND il.product_id IS NOT NULL
        )
        SELECT p.id AS product_id, p.name, p.reference, p.unit,
               r.unit_price_ht AS last_price_ht, r.usage_count
        FROM ranked r
        JOIN products p ON p.id = r.product_id
        WHERE r.rn = 1 AND p.deleted_at IS NULL
        ORDER BY r.usage_count DESC
        LIMIT 5
      `,

      // Dernier document : conditions de paiement + remise
      prisma.invoice.findFirst({
        where: { clientId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { paymentConditions: true, globalDiscountType: true, globalDiscountValue: true, currency: true },
      }),

      // Solde impayé total
      prisma.invoice.aggregate({
        where: { clientId, deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] as any[] } },
        _sum: { balanceDue: true },
        _count: true,
      }),

      // Comportement de paiement : retard moyen + taux de ponctualité
      prisma.$queryRaw<BehaviorRow[]>`
        SELECT
          AVG(EXTRACT(EPOCH FROM (pay.payment_date - inv.due_date)) / 86400) AS avg_days_late,
          COUNT(CASE WHEN pay.payment_date <= inv.due_date THEN 1 END)       AS on_time_count,
          COUNT(*)                                                             AS total_paid
        FROM payments pay
        JOIN invoices inv ON inv.id = pay.invoice_id
        WHERE inv.client_id = ${clientId}::uuid
          AND inv.deleted_at IS NULL
      `,
    ]);

    const behavior    = behaviorRaw[0];
    const totalPaid   = Number(behavior?.total_paid ?? 0);
    const onTimeCount = Number(behavior?.on_time_count ?? 0);
    const avgDaysLate = behavior?.avg_days_late !== null
      ? Math.round(Number(behavior?.avg_days_late ?? 0))
      : null;

    const suggestedDueDate = new Date();
    suggestedDueDate.setDate(suggestedDueDate.getDate() + dueDays);

    return {
      /** Date d'échéance proposée selon les paramètres entreprise */
      suggestedDueDate: suggestedDueDate.toISOString().split('T')[0],
      /** Top 5 produits les plus facturés à ce client */
      suggestedProducts: suggestedProductsRaw.map(p => ({
        productId:   p.product_id,
        name:        p.name,
        reference:   p.reference ?? null,
        unit:        p.unit,
        lastPriceHt: Number(p.last_price_ht),
        usageCount:  Number(p.usage_count),
      })),
      /** Conditions de paiement du dernier document */
      lastPaymentConditions: lastInvoice?.paymentConditions ?? null,
      /** Remise appliquée sur le dernier document */
      lastDiscount: lastInvoice
        ? { type: lastInvoice.globalDiscountType, value: Number(lastInvoice.globalDiscountValue) }
        : null,
      lastCurrency: lastInvoice?.currency ?? 'XAF',
      /** Solde impayé actuel (alerte si > 0) */
      unpaidBalance:       Number(unpaidAgg._sum.balanceDue ?? 0),
      unpaidInvoicesCount: unpaidAgg._count,
      /** Comportement de paiement historique */
      paymentBehavior: {
        avgDaysLate,
        onTimeRate:        totalPaid > 0 ? Math.round((onTimeCount / totalPaid) * 100) / 100 : null,
        totalPaidInvoices: totalPaid,
      },
    };
  }

  async getSummary(id: string) {
    await this.findById(id);

    const [invoicesAgg, paidAgg, pendingCount] = await Promise.all([
      // Total facturé (factures émises ou plus)
      prisma.invoice.aggregate({
        where: {
          clientId: id,
          deletedAt: null,
          status: { notIn: ['draft', 'cancelled'] },
        },
        _sum: { totalTtc: true },
        _count: true,
      }),
      // Total payé
      prisma.invoice.aggregate({
        where: {
          clientId: id,
          deletedAt: null,
          status: 'paid',
        },
        _sum: { totalTtc: true },
      }),
      // Factures en attente
      prisma.invoice.count({
        where: {
          clientId: id,
          deletedAt: null,
          status: { in: ['issued', 'partially_paid', 'overdue'] },
        },
      }),
    ]);

    const totalInvoiced = Number(invoicesAgg._sum.totalTtc ?? 0);
    const totalPaid = Number(paidAgg._sum.totalTtc ?? 0);

    return {
      invoiceCount: invoicesAgg._count,
      totalInvoiced,
      totalPaid,
      totalPending: totalInvoiced - totalPaid,
      pendingInvoiceCount: pendingCount,
    };
  }
}

export const clientsService = new ClientsService();
