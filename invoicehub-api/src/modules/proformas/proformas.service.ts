import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { generateDocumentNumber, getDefaultOfficeId } from '../../lib/documentNumber';
import { generatePdf, buildDocumentHtml, resolveDocumentAssets } from '../../lib/pdf';
import { computeLine, computeTotals } from '../../lib/document-math';
import type { NotificationJobData, EmailJobData } from '../../jobs/job-types';
import type { CreateProformaInput, UpdateProformaInput, ListProformasInput, ConvertProformaInput } from './proformas.schema';

@Injectable()
export class ProformasService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notification') private readonly notificationQueue: Queue<NotificationJobData>,
    @InjectQueue('email') private readonly emailQueue: Queue<EmailJobData>,
  ) {}

  private async _notifyProforma(
    type: string,
    title: string,
    message: string,
    data: Record<string, unknown>,
    excludeUserId: string,
    extraUserId?: string | null,
  ): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: { is: { name: 'admin' } }, status: 'active', deletedAt: null } as any,
      select: { id: true },
    });
    const targets = new Set<string>(admins.map(a => a.id));
    if (extraUserId) targets.add(extraUserId);
    targets.delete(excludeUserId);
    for (const userId of targets) {
      void this.notificationQueue.add('notification', { userId, type: type as any, title, message, data });
    }
  }


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
      this.prisma.proforma.count({ where }),
      this.prisma.proforma.findMany({
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

  async counts() {
    const byStatus = await this.prisma.proforma.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const data: Record<string, number> = {};
    for (const r of byStatus) data[r.status] = r._count._all;
    return data;
  }

  async findById(id: string) {
    const proforma = await this.prisma.proforma.findFirst({
      where: { id, deletedAt: null },
      include: {
        client: true,
        office: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        bankAccount: { select: { id: true, name: true, bankName: true, accountNumber: true, iban: true, swiftBic: true } },
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
    const officeId = input.officeId ?? await getDefaultOfficeId(this.prisma);
    const number = await generateDocumentNumber(this.prisma, officeId, 'proforma');

    let bankAccountId = input.bankAccountId ?? null;
    if (!bankAccountId) {
      const defaultBank = await this.prisma.bankAccount.findFirst({
        where: { isDefault: true, isActive: true, deletedAt: null },
        select: { id: true },
      });
      bankAccountId = defaultBank?.id ?? null;
    }

    const computedLines = input.lines.map(l => ({ ...l, ...computeLine(l) }));
    const totals = computeTotals(computedLines, input.globalDiscountType ?? 'none', input.globalDiscountValue ?? 0);

    const created = await this.prisma.proforma.create({
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
        bankAccountId: bankAccountId ?? undefined,
        lines: {
          create: computedLines.map(l => ({
            ...(l.productId ? { product: { connect: { id: l.productId } } } : {}),
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
            hideDetails: l.hideDetails ?? false,
          })),
        },
        statusHistory: {
          create: { changedById: createdById, newStatus: 'draft' },
        },
      },
      include: { lines: true, client: true },
    });

    void this._notifyProforma(
      'system',
      `Nouvelle proforma : ${created.number}`,
      `La proforma ${created.number} a été créée pour ${created.client.name}.`,
      { proformaId: created.id, proformaNumber: created.number, documentLink: `/proformas/${created.id}` },
      createdById,
    );

    return created;
  }

  async update(id: string, input: UpdateProformaInput, userId: string) {
    const proforma = await this.findById(id);
    if (proforma.status !== 'draft') {
      throw AppError.badRequest('Seules les proformas en brouillon peuvent être modifiées');
    }

    const updateData: Prisma.ProformaUncheckedUpdateInput = {
      ...(input.clientId      !== undefined && { clientId:      input.clientId }),
      ...(input.issueDate     !== undefined && { issueDate:     input.issueDate }),
      ...(input.currency      !== undefined && { currency:      input.currency }),
      ...(input.bankAccountId !== undefined && { bankAccountId: input.bankAccountId }),
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
        globalDiscountType:   input.globalDiscountType  ?? proforma.globalDiscountType,
        globalDiscountValue:  input.globalDiscountValue ?? proforma.globalDiscountValue,
        globalDiscountAmount: totals.globalDiscountAmount,
        totalHt: totals.totalHt,
        totalTax: totals.totalTax,
        totalTtc: totals.totalTtc,
        lines: {
          deleteMany: {},
          create: computedLines.map(l => ({
            ...(l.productId ? { product: { connect: { id: l.productId } } } : {}),
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
            hideDetails: l.hideDetails ?? false,
          })),
        },
      });
    }

    return this.prisma.proforma.update({
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

    // Check for pending approval
    const pendingRequest = await this.prisma.approvalRequest.findFirst({
      where: { documentId: id, documentType: 'proforma', status: 'pending' },
    });
    if (pendingRequest) {
      throw AppError.forbidden(`Cette proforma est en attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps})`);
    }

    const updated = await this.prisma.proforma.update({
      where: { id },
      data: {
        status: 'sent',
        lastSentAt: new Date(),
        draftReminderLevel: 0,
        statusHistory: {
          create: {
            changedById: userId,
            previousStatus: proforma.status,
            newStatus: 'sent',
          },
        },
      },
    });

    void this._notifyProforma(
      'proforma_sent',
      `Proforma envoyée : ${proforma.number}`,
      `La proforma ${proforma.number} pour ${proforma.client.name} a été envoyée au client.`,
      { proformaId: proforma.id, proformaNumber: proforma.number, documentLink: `/proformas/${proforma.id}` },
      userId,
      proforma.createdById !== userId ? proforma.createdById : undefined,
    );

    return updated;
  }

  async accept(id: string, userId: string) {
    const proforma = await this.findById(id);
    if (proforma.status !== 'sent') {
      throw AppError.badRequest('La proforma doit être envoyée pour être acceptée');
    }

    const updated = await this.prisma.proforma.update({
      where: { id },
      data: {
        status: 'accepted',
        statusHistory: {
          create: { changedById: userId, previousStatus: 'sent', newStatus: 'accepted' },
        },
      },
    });

    void this._notifyProforma(
      'proforma_accepted',
      `Proforma acceptée : ${proforma.number}`,
      `La proforma ${proforma.number} pour ${proforma.client.name} a été acceptée.`,
      { proformaId: proforma.id, proformaNumber: proforma.number, documentLink: `/proformas/${proforma.id}` },
      userId,
      proforma.createdById !== userId ? proforma.createdById : undefined,
    );

    return updated;
  }

  async reject(id: string, userId: string, reason?: string) {
    const proforma = await this.findById(id);
    if (proforma.status !== 'sent') {
      throw AppError.badRequest('La proforma doit être envoyée pour être rejetée');
    }

    const updated = await this.prisma.proforma.update({
      where: { id },
      data: {
        status: 'rejected',
        statusHistory: {
          create: { changedById: userId, previousStatus: 'sent', newStatus: 'rejected', reason },
        },
      },
    });

    void this._notifyProforma(
      'proforma_rejected',
      `Proforma rejetée : ${proforma.number}`,
      `La proforma ${proforma.number} pour ${proforma.client.name} a été rejetée.${reason ? ` Motif : ${reason}` : ''}`,
      { proformaId: proforma.id, proformaNumber: proforma.number, reason, documentLink: `/proformas/${proforma.id}` },
      userId,
      proforma.createdById !== userId ? proforma.createdById : undefined,
    );

    return updated;
  }

  async convertToInvoice(id: string, userId: string, options: ConvertProformaInput = { invoiceType: 'standard' }) {
    const proforma = await this.findById(id);
    if (!['accepted', 'sent'].includes(proforma.status)) {
      throw AppError.badRequest('La proforma doit être envoyée ou acceptée pour être convertie');
    }

    const company = await this.prisma.companySettings.findFirst();
    const dueDays = company?.defaultInvoiceDueDays ?? 30;

    const invoiceNumber = await generateDocumentNumber(this.prisma, proforma.officeId, 'invoice');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);

    const isAcompte = options.invoiceType === 'acompte';
    const pct = isAcompte ? options.acomptePercentage! / 100 : 1;

    const acompteHt  = Number((Number(proforma.totalHt)  * pct).toFixed(2));
    const acompteTax = Number((Number(proforma.totalTax) * pct).toFixed(2));
    const acompteTtc = Number((Number(proforma.totalTtc) * pct).toFixed(2));

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          number: invoiceNumber,
          officeId: proforma.officeId,
          type: options.invoiceType,
          clientId: proforma.clientId,
          createdById: userId,
          proformaId: proforma.id,
          issueDate: new Date(),
          dueDate,
          subject: proforma.subject,
          notes: proforma.notes,
          paymentConditions: proforma.paymentConditions,
          currency: proforma.currency,
          subtotalHt:           proforma.subtotalHt,
          globalDiscountType:   proforma.globalDiscountType,
          globalDiscountValue:  proforma.globalDiscountValue,
          globalDiscountAmount: proforma.globalDiscountAmount,
          totalHt:              proforma.totalHt,
          totalTax:             proforma.totalTax,
          totalTtc:             isAcompte ? acompteTtc : proforma.totalTtc,
          amountDue:            isAcompte ? acompteTtc : proforma.totalTtc,
          balanceDue:           isAcompte ? acompteTtc : proforma.totalTtc,
          ...(isAcompte && { acomptePercentage: options.acomptePercentage }),
          lines: {
            create: proforma.lines.map(l => ({
              ...(l.productId ? { product: { connect: { id: l.productId } } } : {}),
              sortOrder:     l.sortOrder,
              designation:   l.designation,
              description:   l.description,
              unit:          l.unit,
              quantity:      l.quantity,
              unitPriceHt:   l.unitPriceHt,
              discountType:  l.discountType,
              discountValue: l.discountValue,
              discountAmount:l.discountAmount,
              taxRate:       l.taxRate,
              subtotalHt:    l.subtotalHt,
              netHt:         l.netHt,
              taxAmount:     l.taxAmount,
              totalTtc:      l.totalTtc,
            })),
          },
          statusHistory: {
            create: { changedById: userId, newStatus: 'draft' },
          },
        },
        include: { lines: true },
      });

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
    const [proforma, settings] = await Promise.all([
      this.findById(id),
      this.prisma.companySettings.findFirst({ select: { headerImagePath: true, footerImagePath: true, stampPath: true, footerSafeZonePx: true, email: true } }),
    ]);

    const { headerImageB64, footerImageB64, sealImageB64 } = resolveDocumentAssets(settings ?? null);

    const html = buildDocumentHtml({
      type:       'Proforma',
      number:     proforma.number,
      issueDate:  new Date(proforma.issueDate).toLocaleDateString('fr-FR'),
      validUntil: new Date(proforma.validUntil).toLocaleDateString('fr-FR'),
      clientName: proforma.client.name,
      subject:    proforma.subject ?? undefined,
      currency:   proforma.currency,
      lines: proforma.lines.map(l => {
        const discountAmt = Number(l.discountAmount);
        return {
          designation: l.designation,
          description: l.description ?? undefined,
          quantity:    Number(l.quantity),
          unit:        l.unit,
          unitPriceHt: Number(l.unitPriceHt),
          netHt:       Number(l.netHt),
          taxRate:     Number(l.taxRate),
          hideDetails: l.hideDetails ?? false,
          discountLabel: discountAmt > 0
            ? l.discountType === 'percentage'
              ? `${Number(l.discountValue).toFixed(2)}%`
              : new Intl.NumberFormat('fr-FR').format(Math.round(discountAmt)) + ' XAF'
            : undefined,
        };
      }),
      subtotalHt: Number(proforma.totalHt),
      totalTax:   Number(proforma.totalTax),
      totalTtc:   Number(proforma.totalTtc),
      subtotalBeforeDiscountHt: Number(proforma.subtotalHt),
      globalDiscountAmount: Number(proforma.globalDiscountAmount) || undefined,
      globalDiscountLabel: Number(proforma.globalDiscountAmount) > 0
        ? proforma.globalDiscountType === 'percentage'
          ? `REMISE ${Number(proforma.globalDiscountValue).toFixed(2)}%`
          : 'REMISE'
        : undefined,
      btsBankName:    proforma.bankAccount?.bankName      ?? undefined,
      btsBankAccount: proforma.bankAccount?.accountNumber  ?? undefined,
      btsBankIban:    proforma.bankAccount?.iban            ?? undefined,
      btsBankSwift:   proforma.bankAccount?.swiftBic        ?? undefined,
      contactPerson:  settings?.email                       ?? undefined,
      deliveryDelay:     proforma.deliveryDelay     ?? undefined,
      warranty:          proforma.warranty          ?? undefined,
      paymentConditions: proforma.paymentConditions ?? undefined,
      notes:             proforma.notes             ?? undefined,
      headerImageB64,
      footerImageB64,
      sealImageB64,
    });

    const footerSafeZonePx = settings?.footerSafeZonePx || undefined;
    const pdfBuffer = await generatePdf(html, footerSafeZonePx);

    await this.prisma.proforma.update({
      where: { id },
      data: { pdfGeneratedAt: new Date() },
    });

    return { buffer: pdfBuffer, filename: `${proforma.number.replace(/\//g, '-')}.pdf` };
  }

  async duplicate(id: string, userId: string) {
    const original = await this.findById(id);
    const company = await this.prisma.companySettings.findFirst();
    const validityDays = company?.defaultProformaValidityDays ?? 30;

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validityDays);

    const number = await generateDocumentNumber(this.prisma, original.officeId, 'proforma');

    return this.prisma.proforma.create({
      data: {
        number,
        officeId: original.officeId,
        clientId: original.clientId,
        createdById: userId,
        issueDate: new Date(),
        validUntil,
        subject: original.subject,
        notes: original.notes,
        paymentConditions: original.paymentConditions,
        deliveryDelay: original.deliveryDelay,
        warranty: original.warranty,
        currency: original.currency,
        globalDiscountType: original.globalDiscountType,
        globalDiscountValue: original.globalDiscountValue,
        globalDiscountAmount: original.globalDiscountAmount,
        subtotalHt: original.subtotalHt,
        totalHt: original.totalHt,
        totalTax: original.totalTax,
        totalTtc: original.totalTtc,
        lines: {
          create: original.lines.map(l => ({
            sortOrder: l.sortOrder,
            ...(l.productId ? { product: { connect: { id: l.productId } } } : {}),
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
            hideDetails: (l as any).hideDetails ?? false,
          })),
        },
        statusHistory: {
          create: { changedById: userId, newStatus: 'draft' },
        },
      },
      include: { lines: true, client: true },
    });
  }

  async softDelete(id: string): Promise<void> {
    const proforma = await this.findById(id);
    if (proforma.status !== 'draft') {
      throw AppError.badRequest('Seules les proformas en brouillon peuvent être supprimées');
    }
    await this.prisma.proforma.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
