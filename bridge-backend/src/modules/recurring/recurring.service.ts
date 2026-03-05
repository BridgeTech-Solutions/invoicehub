import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { generateDocumentNumber, getDefaultOfficeId } from '../../lib/documentNumber';
import type { CreateRecurringInput, UpdateRecurringInput, ListRecurringInput } from './recurring.schema';

/** Calcule la prochaine date de facturation selon l'intervalle */
function nextDate(from: Date, interval: string): Date {
  const d = new Date(from);
  switch (interval) {
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'biannual':  d.setMonth(d.getMonth() + 6); break;
    case 'annual':    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

export class RecurringService {
  async list(input: ListRecurringInput) {
    const { page, limit, clientId, isActive } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.RecurringInvoiceTemplateWhereInput = {
      deletedAt: null,
      ...(clientId && { clientId }),
      ...(isActive !== undefined && { isActive }),
    };

    const [total, data] = await Promise.all([
      prisma.recurringInvoiceTemplate.count({ where }),
      prisma.recurringInvoiceTemplate.findMany({
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
    const template = await prisma.recurringInvoiceTemplate.findFirst({
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
    const officeId = input.officeId ?? await getDefaultOfficeId();

    return prisma.recurringInvoiceTemplate.create({
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

    return prisma.recurringInvoiceTemplate.update({
      where: { id },
      data: updateData,
      include: { lines: true },
    });
  }

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    await this.findById(id);
    await prisma.recurringInvoiceTemplate.update({ where: { id }, data: { isActive } });
  }

  async softDelete(id: string): Promise<void> {
    await this.findById(id);
    await prisma.recurringInvoiceTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  /**
   * Génère manuellement une facture depuis un gabarit récurrent.
   * Appelé manuellement (via API) ou par un cron job.
   */
  async generate(id: string, userId: string) {
    const template = await this.findById(id);

    if (!template.isActive) {
      throw AppError.badRequest('Ce gabarit est inactif');
    }
    if (template.endDate && template.endDate < new Date()) {
      throw AppError.badRequest('Ce gabarit a expiré');
    }

    const company = await prisma.companySettings.findFirst();
    const dueDays = company?.defaultInvoiceDueDays ?? 30;

    const invoiceNumber = await generateDocumentNumber(template.officeId, 'invoice');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);

    // Calcul des totaux
    let totalHt = 0;
    let totalTax = 0;
    const computedLines = template.lines.map(l => {
      const subtotalHt = Number((Number(l.quantity) * Number(l.unitPriceHt)).toFixed(2));
      let discountAmount = 0;
      if (l.discountType === 'percentage') {
        discountAmount = Number((subtotalHt * Number(l.discountValue) / 100).toFixed(2));
      } else if (l.discountType === 'fixed') {
        discountAmount = Math.min(Number(l.discountValue), subtotalHt);
      }
      const netHt = Number((subtotalHt - discountAmount).toFixed(2));
      const taxAmount = Number((netHt * Number(l.taxRate) / 100).toFixed(2));
      const totalTtc = Number((netHt + taxAmount).toFixed(2));
      totalHt += netHt;
      totalTax += taxAmount;
      return { ...l, subtotalHt, discountAmount, netHt, taxAmount, totalTtc };
    });

    const totalTtc = Number((totalHt + totalTax).toFixed(2));

    const invoice = await prisma.$transaction(async (tx) => {
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
          subtotalHt: totalHt,
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

      // Met à jour la prochaine date
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

export const recurringService = new RecurringService();
