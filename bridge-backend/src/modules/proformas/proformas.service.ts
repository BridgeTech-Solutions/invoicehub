import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { generateDocumentNumber, getDefaultOfficeId } from '../../lib/documentNumber';
import { sendMail } from '../../lib/mailer';
import { generatePdf, buildDocumentHtml } from '../../lib/pdf';
import type { CreateProformaInput, UpdateProformaInput, ListProformasInput, LineInput } from './proformas.schema';

/** Calcule les totaux d'une ligne de proforma */
function computeLine(line: LineInput) {
  const subtotalHt = Number((line.quantity * line.unitPriceHt).toFixed(2));

  let discountAmount = 0;
  if (line.discountType === 'percentage') {
    discountAmount = Number((subtotalHt * line.discountValue / 100).toFixed(2));
  } else if (line.discountType === 'fixed') {
    discountAmount = Math.min(line.discountValue, subtotalHt);
  }

  const netHt = Number((subtotalHt - discountAmount).toFixed(2));
  const taxAmount = Number((netHt * line.taxRate / 100).toFixed(2));
  const totalTtc = Number((netHt + taxAmount).toFixed(2));

  return { subtotalHt, discountAmount, netHt, taxAmount, totalTtc };
}

/** Calcule les totaux globaux d'un document */
function computeTotals(
  lines: Array<ReturnType<typeof computeLine>>,
  globalDiscountType: string,
  globalDiscountValue: number,
) {
  const subtotalHt = Number(lines.reduce((s, l) => s + l.netHt, 0).toFixed(2));

  let globalDiscountAmount = 0;
  if (globalDiscountType === 'percentage') {
    globalDiscountAmount = Number((subtotalHt * globalDiscountValue / 100).toFixed(2));
  } else if (globalDiscountType === 'fixed') {
    globalDiscountAmount = Math.min(globalDiscountValue, subtotalHt);
  }

  const totalHt = Number((subtotalHt - globalDiscountAmount).toFixed(2));
  const totalTax = Number(lines.reduce((s, l) => s + l.taxAmount, 0).toFixed(2));
  const totalTtc = Number((totalHt + totalTax).toFixed(2));

  return { subtotalHt, globalDiscountAmount, totalHt, totalTax, totalTtc };
}

export class ProformasService {
  async list(input: ListProformasInput) {
    const { page, limit, clientId, status, search, dateFrom, dateTo } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.ProformaWhereInput = {
      deletedAt: null,
      ...(clientId && { clientId }),
      ...(status && { status }),
      ...(dateFrom && { issueDate: { gte: dateFrom } }),
      ...(dateTo && { issueDate: { lte: dateTo } }),
      ...(search && {
        OR: [
          { number: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
          { client: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      prisma.proforma.count({ where }),
      prisma.proforma.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { issueDate: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const proforma = await prisma.proforma.findFirst({
      where: { id, deletedAt: null },
      include: {
        client: true,
        office: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        lines: { orderBy: { sortOrder: 'asc' } },
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!proforma) throw AppError.notFound('Proforma introuvable');
    return proforma;
  }

  async create(input: CreateProformaInput, createdById: string) {
    const officeId = input.officeId ?? await getDefaultOfficeId();
    const number = await generateDocumentNumber(officeId, 'proforma');

    const computedLines = input.lines.map(l => ({ ...l, ...computeLine(l) }));
    const totals = computeTotals(computedLines, input.globalDiscountType ?? 'none', input.globalDiscountValue ?? 0);

    return prisma.proforma.create({
      data: {
        number,
        officeId,
        clientId: input.clientId,
        createdById,
        assignedToId: input.assignedToId,
        issueDate: input.issueDate ?? new Date(),
        validUntil: input.validUntil,
        subject: input.subject,
        notes: input.notes,
        paymentConditions: input.paymentConditions,
        deliveryDelay: input.deliveryDelay,
        warranty: input.warranty,
        currency: input.currency,
        globalDiscountType: input.globalDiscountType,
        globalDiscountValue: input.globalDiscountValue,
        globalDiscountAmount: totals.globalDiscountAmount,
        subtotalHt: totals.subtotalHt,
        totalHt: totals.totalHt,
        totalTax: totals.totalTax,
        totalTtc: totals.totalTtc,
        lines: {
          create: computedLines.map(l => ({
            productId: l.productId,
            sortOrder: l.sortOrder,
            designation: l.designation,
            description: l.description,
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
          create: {
            changedById: createdById,
            newStatus: 'draft',
          },
        },
      },
      include: { lines: true, client: true },
    });
  }

  async update(id: string, input: UpdateProformaInput, userId: string) {
    const proforma = await this.findById(id);
    if (proforma.status !== 'draft') {
      throw AppError.badRequest('Seules les proformas en brouillon peuvent être modifiées');
    }

    const updateData: Prisma.ProformaUpdateInput = {
      assignedToId: input.assignedToId,
      validUntil: input.validUntil,
      subject: input.subject,
      notes: input.notes,
      paymentConditions: input.paymentConditions,
      deliveryDelay: input.deliveryDelay,
      warranty: input.warranty,
    };

    if (input.lines) {
      const computedLines = input.lines.map(l => ({ ...l, ...computeLine(l) }));
      const totals = computeTotals(
        computedLines,
        input.globalDiscountType ?? proforma.globalDiscountType,
        Number(input.globalDiscountValue ?? proforma.globalDiscountValue),
      );
      Object.assign(updateData, {
        subtotalHt: totals.subtotalHt,
        globalDiscountAmount: totals.globalDiscountAmount,
        totalHt: totals.totalHt,
        totalTax: totals.totalTax,
        totalTtc: totals.totalTtc,
        lines: {
          deleteMany: {},
          create: computedLines.map(l => ({
            productId: l.productId,
            sortOrder: l.sortOrder,
            designation: l.designation,
            description: l.description,
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
      });
    }

    return prisma.proforma.update({
      where: { id },
      data: updateData,
      include: { lines: true },
    });
  }

  async send(id: string, userId: string) {
    const proforma = await this.findById(id);
    if (!['draft', 'rejected'].includes(proforma.status)) {
      throw AppError.badRequest('La proforma doit être en brouillon ou rejetée pour être envoyée');
    }

    const updated = await prisma.proforma.update({
      where: { id },
      data: {
        status: 'sent',
        lastSentAt: new Date(),
        statusHistory: {
          create: {
            changedById: userId,
            previousStatus: proforma.status,
            newStatus: 'sent',
          },
        },
      },
    });

    // Envoi email si le client a un email
    if (proforma.client.email) {
      await sendMail({
        to: proforma.client.email,
        subject: `Devis ${proforma.number} — Bridge Technologies Solutions`,
        html: `
          <p>Bonjour ${proforma.client.name},</p>
          <p>Veuillez trouver ci-joint votre devis N° <strong>${proforma.number}</strong>.</p>
          <p>Ce devis est valable jusqu'au ${new Date(proforma.validUntil).toLocaleDateString('fr-FR')}.</p>
          <p>Cordialement,<br>Bridge Technologies Solutions</p>
        `,
      }).catch(() => {/* Email non critique */});
    }

    return updated;
  }

  async accept(id: string, userId: string) {
    const proforma = await this.findById(id);
    if (proforma.status !== 'sent') {
      throw AppError.badRequest('La proforma doit être envoyée pour être acceptée');
    }

    return prisma.proforma.update({
      where: { id },
      data: {
        status: 'accepted',
        statusHistory: {
          create: { changedById: userId, previousStatus: 'sent', newStatus: 'accepted' },
        },
      },
    });
  }

  async reject(id: string, userId: string, reason?: string) {
    const proforma = await this.findById(id);
    if (proforma.status !== 'sent') {
      throw AppError.badRequest('La proforma doit être envoyée pour être rejetée');
    }

    return prisma.proforma.update({
      where: { id },
      data: {
        status: 'rejected',
        statusHistory: {
          create: { changedById: userId, previousStatus: 'sent', newStatus: 'rejected', reason },
        },
      },
    });
  }

  async convertToInvoice(id: string, userId: string) {
    const proforma = await this.findById(id);
    if (!['accepted', 'sent'].includes(proforma.status)) {
      throw AppError.badRequest('La proforma doit être envoyée ou acceptée pour être convertie');
    }

    const company = await prisma.companySettings.findFirst();
    const dueDays = company?.defaultInvoiceDueDays ?? 30;

    const invoiceNumber = await generateDocumentNumber(proforma.officeId, 'invoice');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          number: invoiceNumber,
          officeId: proforma.officeId,
          type: 'standard',
          clientId: proforma.clientId,
          createdById: userId,
          proformaId: proforma.id,
          issueDate: new Date(),
          dueDate,
          subject: proforma.subject,
          notes: proforma.notes,
          paymentConditions: proforma.paymentConditions,
          currency: proforma.currency,
          subtotalHt: proforma.subtotalHt,
          globalDiscountType: proforma.globalDiscountType,
          globalDiscountValue: proforma.globalDiscountValue,
          globalDiscountAmount: proforma.globalDiscountAmount,
          totalHt: proforma.totalHt,
          totalTax: proforma.totalTax,
          totalTtc: proforma.totalTtc,
          amountDue: proforma.totalTtc,
          balanceDue: proforma.totalTtc,
          lines: {
            create: proforma.lines.map(l => ({
              productId: l.productId,
              sortOrder: l.sortOrder,
              designation: l.designation,
              description: l.description,
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

      // Marque la proforma comme acceptée (si ce n'est pas déjà le cas)
      await tx.proforma.update({
        where: { id },
        data: {
          status: 'accepted',
          statusHistory: proforma.status !== 'accepted'
            ? { create: { changedById: userId, previousStatus: proforma.status, newStatus: 'accepted' } }
            : undefined,
        },
      });

      return inv;
    });

    return invoice;
  }

  async generatePdfResponse(id: string) {
    const proforma = await this.findById(id);
    const company = await prisma.companySettings.findFirst();

    const html = buildDocumentHtml({
      type: 'Proforma',
      number: proforma.number,
      issueDate: new Date(proforma.issueDate).toLocaleDateString('fr-FR'),
      validUntil: new Date(proforma.validUntil).toLocaleDateString('fr-FR'),
      companyName: company?.companyName ?? 'Bridge Technologies Solutions',
      companyAddress: company?.address ?? 'Douala, Cameroun',
      companyPhone: company?.phone ?? '',
      companyEmail: company?.email ?? '',
      companyTaxNumber: company?.taxNumber ?? undefined,
      clientName: proforma.client.name,
      clientAddress: proforma.client.address ?? undefined,
      clientEmail: proforma.client.email ?? undefined,
      clientTaxNumber: proforma.client.taxNumber ?? undefined,
      subject: proforma.subject ?? undefined,
      currency: proforma.currency,
      lines: proforma.lines.map(l => ({
        designation: l.designation,
        quantity: Number(l.quantity),
        unit: l.unit,
        unitPriceHt: Number(l.unitPriceHt),
        taxRate: Number(l.taxRate),
        totalTtc: Number(l.totalTtc),
      })),
      subtotalHt: Number(proforma.totalHt),
      totalTax: Number(proforma.totalTax),
      totalTtc: Number(proforma.totalTtc),
      notes: proforma.notes ?? undefined,
      paymentConditions: proforma.paymentConditions ?? undefined,
    });

    const pdfBuffer = await generatePdf(html);

    await prisma.proforma.update({
      where: { id },
      data: { pdfGeneratedAt: new Date() },
    });

    return { buffer: pdfBuffer, filename: `${proforma.number.replace(/\//g, '-')}.pdf` };
  }

  async softDelete(id: string): Promise<void> {
    const proforma = await this.findById(id);
    if (proforma.status !== 'draft') {
      throw AppError.badRequest('Seules les proformas en brouillon peuvent être supprimées');
    }
    await prisma.proforma.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}

export const proformasService = new ProformasService();
