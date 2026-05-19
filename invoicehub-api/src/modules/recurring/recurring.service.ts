import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { generateDocumentNumber, getDefaultOfficeId } from '../../lib/documentNumber';
import { computeLine, computeTotals } from '../../lib/document-math';
import type { CreateRecurringInput, UpdateRecurringInput, ListRecurringInput } from './recurring.schema';

/**
 * Calcule la prochaine date de facturation selon l'intervalle.
 *
 * Utilise setFullYear(year, month, day) avec clamping du jour pour éviter
 * l'overflow JavaScript de setMonth() sur les fins de mois.
 */
function nextDate(from: Date, interval: string): Date {
  const d   = new Date(from);
  const day = d.getDate();
  let year  = d.getFullYear();
  let month = d.getMonth();

  switch (interval) {
    case 'monthly':   month += 1;  break;
    case 'quarterly': month += 3;  break;
    case 'biannual':  month += 6;  break;
    case 'annual':    year  += 1;  break;
  }

  year  += Math.floor(month / 12);
  month  = ((month % 12) + 12) % 12;

  const lastDay = new Date(year, month + 1, 0).getDate();
  d.setFullYear(year, month, Math.min(day, lastDay));

  return d;
}

@Injectable()
export class RecurringService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: ListRecurringInput) {
    const { page, limit, clientId, isActive, search, interval } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.RecurringInvoiceTemplateWhereInput = {
      deletedAt: null,
      ...(clientId  && { clientId }),
      ...(isActive !== undefined && { isActive }),
      ...(interval  && { interval }),
      ...(search    && {
        OR: [
          { subject: { contains: search, mode: 'insensitive' } },
          { client:  { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      this.prisma.recurringInvoiceTemplate.count({ where }),
      this.prisma.recurringInvoiceTemplate.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          lines: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { nextInvoiceDate: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const template = await this.prisma.recurringInvoiceTemplate.findFirst({
      where: { id, deletedAt: null },
      include: {
        client: true,
        office: true,
        lines: { orderBy: { sortOrder: 'asc' } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!template) throw AppError.notFound('Gabarit de facturation introuvable');
    return template;
  }

  async create(input: CreateRecurringInput, createdById: string) {
    const officeId = input.officeId ?? await getDefaultOfficeId(this.prisma);

    return this.prisma.recurringInvoiceTemplate.create({
      data: {
        clientId: input.clientId,
        officeId,
        interval: input.interval,
        nextInvoiceDate: input.nextInvoiceDate,
        endDate: input.endDate,
        subject: input.subject,
        notes: input.notes,
        paymentConditions: input.paymentConditions,
        currency: input.currency,
        createdById,
        lines: {
          create: input.lines.map(l => ({
            sortOrder: l.sortOrder,
            designation: l.designation,
            description: l.description,
            unit: l.unit,
            quantity: l.quantity,
            unitPriceHt: l.unitPriceHt,
            discountType: l.discountType,
            discountValue: l.discountValue,
            taxRate: l.taxRate,
          })),
        },
      },
      include: { lines: true, client: true },
    });
  }

  async update(id: string, input: UpdateRecurringInput) {
    await this.findById(id);

    const updateData: Prisma.RecurringInvoiceTemplateUpdateInput = {
      interval: input.interval,
      nextInvoiceDate: input.nextInvoiceDate,
      endDate: input.endDate,
      subject: input.subject,
      notes: input.notes,
      paymentConditions: input.paymentConditions,
      currency: input.currency,
    };

    if (input.lines) {
      Object.assign(updateData, {
        lines: {
          deleteMany: {},
          create: input.lines.map(l => ({
            sortOrder: l.sortOrder,
            designation: l.designation,
            description: l.description,
            unit: l.unit,
            quantity: l.quantity,
            unitPriceHt: l.unitPriceHt,
            discountType: l.discountType,
            discountValue: l.discountValue,
            taxRate: l.taxRate,
          })),
        },
      });
    }

    return this.prisma.recurringInvoiceTemplate.update({
      where: { id },
      data: updateData,
      include: { lines: true },
    });
  }

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    await this.findById(id);
    await this.prisma.recurringInvoiceTemplate.update({ where: { id }, data: { isActive } });
  }

  async softDelete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.recurringInvoiceTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async generate(id: string, userId: string) {
    const template = await this.findById(id);

    if (!template.isActive) {
      throw AppError.badRequest('Ce gabarit est inactif');
    }
    if (template.endDate && template.endDate < new Date()) {
      throw AppError.badRequest('Ce gabarit a expiré');
    }

    const company = await this.prisma.companySettings.findFirst();
    const dueDays = company?.defaultInvoiceDueDays ?? 30;

    const invoiceNumber = await generateDocumentNumber(this.prisma, template.officeId, 'invoice');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);

    const computedLines = template.lines.map(l => ({
      ...l,
      ...computeLine({
        quantity:      Number(l.quantity),
        unitPriceHt:   Number(l.unitPriceHt),
        discountType:  l.discountType as 'none' | 'percentage' | 'fixed',
        discountValue: Number(l.discountValue),
        taxRate:       Number(l.taxRate),
      }),
    }));

    const { totalHt, totalTax, totalTtc, subtotalHt: subtotalHtDoc } =
      computeTotals(computedLines, 'none', 0);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          number: invoiceNumber,
          officeId: template.officeId,
          type: 'recurring',
          clientId: template.clientId,
          createdById: userId,
          recurringTemplateId: template.id,
          issueDate: new Date(),
          dueDate,
          subject: template.subject,
          notes: template.notes,
          paymentConditions: template.paymentConditions,
          currency: template.currency,
          subtotalHt: subtotalHtDoc,
          totalHt,
          totalTax,
          totalTtc,
          amountDue: totalTtc,
          balanceDue: totalTtc,
          lines: {
            create: computedLines.map(l => ({
              sortOrder: Number(l.sortOrder),
              designation: l.designation,
              description: l.description ?? undefined,
              unit: l.unit,
              quantity: l.quantity,
              unitPriceHt: l.unitPriceHt,
              discountType: l.discountType,
              discountValue: l.discountValue,
              discountAmount: l.discountAmount,
              taxRate: l.taxRate,
              subtotalHt: l.subtotalHt,
              netHt: l.netHt,
              taxAmount: l.taxAmount,
              totalTtc: l.totalTtc,
            })),
          },
          statusHistory: {
            create: { changedById: userId, newStatus: 'draft' },
          },
        },
        include: { lines: true },
      });

      await tx.recurringInvoiceTemplate.update({
        where: { id },
        data: {
          lastGeneratedAt: new Date(),
          nextInvoiceDate: nextDate(template.nextInvoiceDate, template.interval),
        },
      });

      return inv;
    });

    return invoice;
  }
}
