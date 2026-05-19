import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseSearchQuery, describeParsedQuery } from './search.parser';

const MODE = 'insensitive' as const;

function buildDateFilter(year: number | null, month: number | null) {
  if (!year && !month) return null;
  const now = new Date(); const y = year ?? now.getFullYear();
  if (month) return { gte: new Date(y, month - 1, 1), lt: new Date(y, month, 1) };
  return { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
}

function buildAmountFilter(p: { amountGt: number | null; amountGte: number | null; amountLt: number | null; amountLte: number | null }) {
  const f: Record<string, number> = {};
  if (p.amountGt  !== null) f['gt']  = p.amountGt;
  if (p.amountGte !== null) f['gte'] = p.amountGte;
  if (p.amountLt  !== null) f['lt']  = p.amountLt;
  if (p.amountLte !== null) f['lte'] = p.amountLte;
  return Object.keys(f).length > 0 ? f : null;
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(q: string, limit: number, isAdmin: boolean) {
    const parsed     = parseSearchQuery(q);
    const dateFilter = buildDateFilter(parsed.year, parsed.month);
    const amountF    = buildAmountFilter(parsed);
    const text       = parsed.text;
    const hasText    = text.length > 0;

    if (!hasText && !parsed.hasFilters) {
      return { parsed: { description: '', filters: parsed }, navigation: null, results: { invoices: [], proformas: [], clients: [], products: [], users: [] }, total: 0 };
    }

    const [invoices, proformas, clients, products, users] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          deletedAt: null,
          ...(parsed.invoiceStatuses.length > 0 && { status: { in: parsed.invoiceStatuses as any[] } }),
          ...(amountF    && { totalTtc: amountF }),
          ...(dateFilter && { issueDate: dateFilter }),
          ...(hasText || parsed.documentNumber ? { OR: [
            ...(hasText ? [
              { number:  { contains: text, mode: MODE } },
              { subject: { contains: text, mode: MODE } },
              { client:  { name:      { contains: text, mode: MODE } } },
              { client:  { email:     { contains: text, mode: MODE } } },
              { client:  { taxNumber: { contains: text, mode: MODE } } },
            ] : []),
            ...(parsed.documentNumber ? [{ number: { contains: parsed.documentNumber, mode: MODE } }] : []),
          ]} : {}),
        },
        select: { id: true, number: true, status: true, type: true, totalTtc: true, issueDate: true, dueDate: true, client: { select: { id: true, name: true } } },
        orderBy: { issueDate: 'desc' }, take: limit,
      }),

      this.prisma.proforma.findMany({
        where: {
          deletedAt: null,
          ...(parsed.proformaStatuses.length > 0 && { status: { in: parsed.proformaStatuses as any[] } }),
          ...(amountF    && { totalTtc: amountF }),
          ...(dateFilter && { createdAt: dateFilter }),
          ...(hasText || parsed.documentNumber ? { OR: [
            ...(hasText ? [{ number: { contains: text, mode: MODE } }, { subject: { contains: text, mode: MODE } }, { client: { name: { contains: text, mode: MODE } } }, { client: { email: { contains: text, mode: MODE } } }] : []),
            ...(parsed.documentNumber ? [{ number: { contains: parsed.documentNumber, mode: MODE } }] : []),
          ]} : {}),
        },
        select: { id: true, number: true, status: true, totalTtc: true, createdAt: true, validUntil: true, client: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' }, take: limit,
      }),

      hasText
        ? this.prisma.client.findMany({
            where: { deletedAt: null, OR: [{ name: { contains: text, mode: MODE } }, { email: { contains: text, mode: MODE } }, { taxNumber: { contains: text, mode: MODE } }, { rccm: { contains: text, mode: MODE } }, { phone: { contains: text, mode: MODE } }, { city: { contains: text, mode: MODE } }] },
            select: { id: true, name: true, email: true, phone: true, city: true, type: true, status: true },
            orderBy: { name: 'asc' }, take: limit,
          })
        : Promise.resolve([]),

      hasText
        ? this.prisma.product.findMany({
            where: { deletedAt: null, OR: [{ name: { contains: text, mode: MODE } }, { reference: { contains: text, mode: MODE } }, { description: { contains: text, mode: MODE } }] },
            select: { id: true, name: true, reference: true, unitPriceHt: true, type: true, unit: true },
            orderBy: { name: 'asc' }, take: limit,
          })
        : Promise.resolve([]),

      isAdmin && hasText
        ? this.prisma.user.findMany({
            where: { deletedAt: null, OR: [{ firstName: { contains: text, mode: MODE } }, { lastName: { contains: text, mode: MODE } }, { email: { contains: text, mode: MODE } }] },
            select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true },
            orderBy: { lastName: 'asc' }, take: limit,
          })
        : Promise.resolve([]),
    ]);

    let navigation: { type: string; id: string; number: string } | null = null;
    if (parsed.documentNumber) {
      const exactInvoice = invoices.find(i => i.number.toUpperCase() === parsed.documentNumber);
      if (exactInvoice) navigation = { type: 'invoice', id: exactInvoice.id, number: exactInvoice.number };
      else {
        const exactProforma = proformas.find(p => p.number.toUpperCase() === parsed.documentNumber);
        if (exactProforma) navigation = { type: 'proforma', id: exactProforma.id, number: exactProforma.number };
      }
    }

    return {
      parsed: { description: describeParsedQuery(parsed), text: parsed.text || null, documentNumber: parsed.documentNumber, invoiceStatuses: parsed.invoiceStatuses.length > 0 ? parsed.invoiceStatuses : null, proformaStatuses: parsed.proformaStatuses.length > 0 ? parsed.proformaStatuses : null, amountGt: parsed.amountGt, amountGte: parsed.amountGte, amountLt: parsed.amountLt, amountLte: parsed.amountLte, year: parsed.year, month: parsed.month },
      navigation,
      results: { invoices, proformas, clients, products, users },
      total:   invoices.length + proformas.length + clients.length + products.length + users.length,
    };
  }
}
