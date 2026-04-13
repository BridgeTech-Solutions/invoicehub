import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { generateDocumentNumber, getDefaultOfficeId } from '../../lib/documentNumber';
import { computeLine, computeTotals } from '../../lib/document-math';
import type { CreateRecurringInput, UpdateRecurringInput, ListRecurringInput } from './recurring.schema';

/**
 * Calcule la prochaine date de facturation selon l'intervalle.
 *
 * Utilise setFullYear(year, month, day) avec clamping du jour pour éviter
 * l'overflow JavaScript de setMonth() sur les fins de mois :
 *   Jan 31 + 1 mois → Fév 28/29 (et non Mars 2/3)
 *   Mars 31 + 1 mois → Avr 30   (et non Mai 1)
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

  // Normalise month overflow (ex: mois 13 → année+1, mois 1)
  year  += Math.floor(month / 12);
  month  = ((month % 12) + 12) % 12;

  // Clamp : new Date(year, month+1, 0) = dernier jour du mois cible
  const lastDay = new Date(year, month + 1, 0).getDate();
  d.setFullYear(year, month, Math.min(day, lastDay));

  return d;
}

export class RecurringService {
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

    // Calcul des totaux via les fonctions partagées (document-math.ts)
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
