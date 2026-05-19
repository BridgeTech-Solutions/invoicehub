import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type { CreateClientInput, UpdateClientInput, ListClientsInput } from './clients.schema';

export interface ImportClientRow {
  type?:                'company' | 'individual';
  name:                 string;
  email?:               string;
  phone?:               string;
  phone2?:              string;
  address?:             string;
  city?:                string;
  country?:             string;
  postalBox?:           string;
  taxNumber?:           string;
  rccm?:                string;
  currency?:            string;
  defaultPaymentTerms?: string;
  internalNotes?:       string;
}

export interface ImportClientResult {
  created:    number;
  duplicates: { index: number; name: string; reason: string }[];
  errors:     { index: number; name: string; message: string }[];
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: ListClientsInput) {
    const { page, limit, type, status, search, city } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {
      deletedAt: status === 'archived' ? { not: null } : null,
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
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const client = await this.prisma.client.findFirst({ where: { id, deletedAt: null } });
    if (!client) throw AppError.notFound('Client introuvable');
    return client;
  }

  async create(input: CreateClientInput, createdById: string) {
    const duplicateConditions: Prisma.ClientWhereInput[] = [
      { name: { equals: input.name, mode: 'insensitive' } },
    ];
    if (input.email)     duplicateConditions.push({ email:     { equals: input.email,     mode: 'insensitive' } });
    if (input.taxNumber) duplicateConditions.push({ taxNumber: { equals: input.taxNumber } });

    const existing = await this.prisma.client.findFirst({
      where: { deletedAt: null, OR: duplicateConditions },
      select: { id: true, name: true, email: true, taxNumber: true },
    });

    if (existing) {
      const reason =
        input.taxNumber && existing.taxNumber === input.taxNumber
          ? `numéro fiscal "${input.taxNumber}"`
          : input.email && existing.email?.toLowerCase() === input.email.toLowerCase()
          ? `adresse email "${input.email}"`
          : `nom "${existing.name}"`;
      throw AppError.conflict(
        `Un client avec le même ${reason} existe déjà (id: ${existing.id}). Vérifiez avant de créer un doublon.`,
      );
    }

    return this.prisma.client.create({
      data: { ...input, createdById, metadata: (input.metadata ?? {}) as object },
    });
  }

  async update(id: string, input: UpdateClientInput) {
    await this.findById(id);
    return this.prisma.client.update({ where: { id }, data: input as Parameters<typeof this.prisma.client.update>[0]['data'] });
  }

  async archive(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'archived' },
    });
  }

  async quickFill(clientId: string) {
    await this.findById(clientId);

    const settings = await this.prisma.companySettings.findFirst({
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
      this.prisma.$queryRaw<ProductRow[]>`
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
      this.prisma.invoice.findFirst({
        where: { clientId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { paymentConditions: true, globalDiscountType: true, globalDiscountValue: true, currency: true },
      }),
      this.prisma.invoice.aggregate({
        where: { clientId, deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] as any[] } },
        _sum: { balanceDue: true },
        _count: true,
      }),
      this.prisma.$queryRaw<BehaviorRow[]>`
        SELECT
          AVG((pay.payment_date::date - inv.due_date::date)) AS avg_days_late,
          COUNT(CASE WHEN pay.payment_date <= inv.due_date THEN 1 END) AS on_time_count,
          COUNT(*) AS total_paid
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
      suggestedDueDate: suggestedDueDate.toISOString().split('T')[0],
      suggestedProducts: suggestedProductsRaw.map(p => ({
        productId:   p.product_id,
        name:        p.name,
        reference:   p.reference ?? null,
        unit:        p.unit,
        lastPriceHt: Number(p.last_price_ht),
        usageCount:  Number(p.usage_count),
      })),
      lastPaymentConditions: lastInvoice?.paymentConditions ?? null,
      lastDiscount: lastInvoice
        ? { type: lastInvoice.globalDiscountType, value: Number(lastInvoice.globalDiscountValue) }
        : null,
      lastCurrency: lastInvoice?.currency ?? 'XAF',
      unpaidBalance:       Number(unpaidAgg._sum.balanceDue ?? 0),
      unpaidInvoicesCount: unpaidAgg._count,
      paymentBehavior: {
        avgDaysLate,
        onTimeRate:        totalPaid > 0 ? Math.round((onTimeCount / totalPaid) * 100) / 100 : null,
        totalPaidInvoices: totalPaid,
      },
    };
  }

  async getRiskScore(id: string) {
    await this.findById(id);

    type BehaviorRow = {
      avg_days_late: number | null;
      on_time_count: bigint;
      total_paid:    bigint;
    };

    const [invoicesAgg, unpaidAgg, behaviorRaw] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { clientId: id, deletedAt: null, status: { notIn: ['draft', 'cancelled'] } },
        _sum: { totalTtc: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { clientId: id, deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] as any[] } },
        _sum: { balanceDue: true },
      }),
      this.prisma.$queryRaw<BehaviorRow[]>`
        SELECT
          AVG((pay.payment_date::date - inv.due_date::date)) AS avg_days_late,
          COUNT(CASE WHEN pay.payment_date <= inv.due_date THEN 1 END) AS on_time_count,
          COUNT(*) AS total_paid
        FROM payments pay
        JOIN invoices inv ON inv.id = pay.invoice_id
        WHERE inv.client_id = ${id}::uuid
          AND inv.deleted_at IS NULL
          AND pay.deleted_at IS NULL
      `,
    ]);

    const invoiceCount   = invoicesAgg._count;
    const totalInvoiced  = Number(invoicesAgg._sum.totalTtc ?? 0);
    const unpaidBalance  = Number(unpaidAgg._sum.balanceDue ?? 0);
    const behavior       = behaviorRaw[0];
    const totalPaid      = Number(behavior?.total_paid ?? 0);
    const onTimeCount    = Number(behavior?.on_time_count ?? 0);
    const avgDaysLate    = behavior?.avg_days_late !== null
      ? Math.round(Number(behavior?.avg_days_late ?? 0))
      : null;

    if (invoiceCount === 0) {
      return { score: null, level: 'unknown', details: { invoiceCount, avgDaysLate: null, onTimeRate: null, unpaidRatio: null } };
    }

    let delayScore = 0;
    if (avgDaysLate !== null) {
      if      (avgDaysLate > 30) delayScore = 60;
      else if (avgDaysLate > 15) delayScore = 45;
      else if (avgDaysLate > 7)  delayScore = 30;
      else if (avgDaysLate > 0)  delayScore = 15;
    }

    const onTimeRate = totalPaid > 0 ? onTimeCount / totalPaid : null;
    let punctualityScore = 0;
    if (onTimeRate !== null) {
      if      (onTimeRate < 0.4) punctualityScore = 30;
      else if (onTimeRate < 0.6) punctualityScore = 20;
      else if (onTimeRate < 0.8) punctualityScore = 10;
    }

    const unpaidRatio = totalInvoiced > 0 ? unpaidBalance / totalInvoiced : 0;
    let unpaidScore = 0;
    if      (unpaidRatio > 0.5) unpaidScore = 15;
    else if (unpaidRatio > 0.2) unpaidScore = 10;
    else if (unpaidRatio > 0)   unpaidScore = 5;

    const score = Math.min(100, delayScore + punctualityScore + unpaidScore);
    const level =
      score <= 20 ? 'faible' :
      score <= 50 ? 'modéré' :
      score <= 75 ? 'élevé'  : 'critique';

    return {
      score,
      level,
      details: {
        invoiceCount,
        avgDaysLate,
        onTimeRate: onTimeRate !== null ? Math.round(onTimeRate * 100) : null,
        unpaidBalance,
        unpaidRatio: Math.round(unpaidRatio * 100),
        components: { delayScore, punctualityScore, unpaidScore },
      },
    };
  }

  async getSummary(id: string) {
    await this.findById(id);

    const [invoicesAgg, paidAgg, pendingAgg, pendingCount] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { clientId: id, deletedAt: null, status: { notIn: ['draft', 'cancelled'] } },
        _sum: { totalTtc: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { clientId: id, deletedAt: null, status: 'paid' },
        _sum: { totalTtc: true },
      }),
      this.prisma.invoice.aggregate({
        where: { clientId: id, deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] } },
        _sum: { balanceDue: true },
      }),
      this.prisma.invoice.count({
        where: { clientId: id, deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] } },
      }),
    ]);

    return {
      invoiceCount:        invoicesAgg._count,
      totalInvoiced:       Number(invoicesAgg._sum.totalTtc  ?? 0),
      totalPaid:           Number(paidAgg._sum.totalTtc      ?? 0),
      totalPending:        Number(pendingAgg._sum.balanceDue ?? 0),
      pendingInvoiceCount: pendingCount,
    };
  }

  async importClients(rows: ImportClientRow[], createdById: string): Promise<ImportClientResult> {
    const result: ImportClientResult = { created: 0, duplicates: [], errors: [] };

    const validRows: { idx: number; row: ImportClientRow }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.name?.trim()) {
        result.errors.push({ index: i, name: row.name ?? '', message: 'Le nom est obligatoire' });
        continue;
      }
      if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
        result.errors.push({ index: i, name: row.name, message: `Email invalide : ${row.email}` });
        continue;
      }
      if (row.currency && row.currency.length !== 3) {
        result.errors.push({ index: i, name: row.name, message: `Devise invalide (doit être 3 lettres) : ${row.currency}` });
        continue;
      }
      validRows.push({ idx: i, row });
    }

    if (validRows.length === 0) return result;

    const emails      = validRows.map(r => r.row.email).filter(Boolean) as string[];
    const taxNumbers  = validRows.map(r => r.row.taxNumber).filter(Boolean) as string[];
    const names       = validRows.map(r => r.row.name.trim());

    const existingOR: Prisma.ClientWhereInput[] = [
      { name: { in: names, mode: 'insensitive' } },
    ];
    if (emails.length)     existingOR.push({ email:     { in: emails,     mode: 'insensitive' } });
    if (taxNumbers.length) existingOR.push({ taxNumber: { in: taxNumbers } });

    const existing = await this.prisma.client.findMany({
      where: { deletedAt: null, OR: existingOR },
      select: { name: true, email: true, taxNumber: true },
    });

    const existingEmails      = new Set(existing.map(c => c.email?.toLowerCase()).filter(Boolean));
    const existingTaxNumbers  = new Set(existing.map(c => c.taxNumber).filter(Boolean));
    const existingNames       = new Set(existing.map(c => c.name.toLowerCase()));

    const toCreate: { idx: number; row: ImportClientRow }[] = [];

    for (const { idx, row } of validRows) {
      if (row.taxNumber && existingTaxNumbers.has(row.taxNumber)) {
        result.duplicates.push({ index: idx, name: row.name, reason: `NIF déjà utilisé : ${row.taxNumber}` });
        continue;
      }
      if (row.email && existingEmails.has(row.email.toLowerCase())) {
        result.duplicates.push({ index: idx, name: row.name, reason: `Email déjà utilisé : ${row.email}` });
        continue;
      }
      if (existingNames.has(row.name.toLowerCase().trim())) {
        result.duplicates.push({ index: idx, name: row.name, reason: `Nom déjà existant : ${row.name}` });
        continue;
      }
      toCreate.push({ idx, row });
    }

    if (toCreate.length === 0) return result;

    await this.prisma.client.createMany({
      data: toCreate.map(({ row }) => ({
        type:                (row.type ?? 'company') as 'company' | 'individual',
        name:                row.name.trim(),
        email:               row.email?.toLowerCase() || undefined,
        phone:               row.phone || undefined,
        phone2:              row.phone2 || undefined,
        address:             row.address || undefined,
        city:                row.city || undefined,
        country:             row.country?.trim() || 'Cameroun',
        postalBox:           row.postalBox || undefined,
        taxNumber:           row.taxNumber || undefined,
        rccm:                row.rccm || undefined,
        currency:            row.currency?.toUpperCase() || 'XAF',
        defaultPaymentTerms: row.defaultPaymentTerms || undefined,
        internalNotes:       row.internalNotes || undefined,
        createdById,
      })),
      skipDuplicates: false,
    });

    result.created = toCreate.length;
    return result;
  }
}
