import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { generateDocumentNumber, getDefaultOfficeId } from '../../lib/documentNumber';
import { emailQueue, notificationQueue } from '../../jobs/queues';
import { broadcastNotification } from '../../lib/broadcast';
import { generatePdf, buildDocumentHtml, imgToBase64 } from '../../lib/pdf';
import { DashboardService } from '../dashboard/dashboard.service';
import { computeLine, computeTotals } from '../../lib/document-math';
import type { CreateProformaInput, UpdateProformaInput, ListProformasInput, LineInput, ConvertProformaInput } from './proformas.schema';

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

    const created = await prisma.proforma.create({
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
    await DashboardService.invalidateCache();
    return created;
  }

  async update(id: string, input: UpdateProformaInput, userId: string) {
    const proforma = await this.findById(id);
    if (proforma.status !== 'draft') {
      throw AppError.badRequest('Seules les proformas en brouillon peuvent être modifiées');
    }

    const updateData: Prisma.ProformaUncheckedUpdateInput = {
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

    // Notification in-app à tous les utilisateurs actifs
    await broadcastNotification({
      type: 'proforma_sent',
      title: `Proforma envoyée : ${proforma.number}`,
      message: `La proforma ${proforma.number} pour ${proforma.client.name} a été envoyée au client.`,
      data: { proformaId: proforma.id, proformaNumber: proforma.number },
    });

    // Email au client — désactivé (envoi manuel hors application)
    // if (proforma.client.email) {
    //   await emailQueue.add('email', {
    //     to: proforma.client.email,
    //     subject: `Devis ${proforma.number} — Bridge Technologies Solutions`,
    //     html: `
    //       <p>Bonjour ${proforma.client.name},</p>
    //       <p>Veuillez trouver ci-joint votre devis N° <strong>${proforma.number}</strong>.</p>
    //       <p>Ce devis est valable jusqu'au ${new Date(proforma.validUntil).toLocaleDateString('fr-FR')}.</p>
    //       <p>Cordialement,<br>Bridge Technologies Solutions</p>
    //     `,
    //   });
    // }

    await DashboardService.invalidateCache();
    return updated;
  }

  async accept(id: string, userId: string) {
    const proforma = await this.findById(id);
    if (proforma.status !== 'sent') {
      throw AppError.badRequest('La proforma doit être envoyée pour être acceptée');
    }

    const updated = await prisma.proforma.update({
      where: { id },
      data: {
        status: 'accepted',
        statusHistory: {
          create: { changedById: userId, previousStatus: 'sent', newStatus: 'accepted' },
        },
      },
    });

    await broadcastNotification({
      type: 'proforma_accepted',
      title: `Proforma acceptée : ${proforma.number}`,
      message: `La proforma ${proforma.number} pour ${proforma.client.name} a été acceptée.`,
      data: { proformaId: proforma.id, proformaNumber: proforma.number },
    });

    await DashboardService.invalidateCache();
    return updated;
  }

  async reject(id: string, userId: string, reason?: string) {
    const proforma = await this.findById(id);
    if (proforma.status !== 'sent') {
      throw AppError.badRequest('La proforma doit être envoyée pour être rejetée');
    }

    const updated = await prisma.proforma.update({
      where: { id },
      data: {
        status: 'rejected',
        statusHistory: {
          create: { changedById: userId, previousStatus: 'sent', newStatus: 'rejected', reason },
        },
      },
    });

    await broadcastNotification({
      type: 'proforma_rejected',
      title: `Proforma rejetée : ${proforma.number}`,
      message: `La proforma ${proforma.number} pour ${proforma.client.name} a été rejetée.${reason ? ` Motif : ${reason}` : ''}`,
      data: { proformaId: proforma.id, proformaNumber: proforma.number, reason },
    });

    await DashboardService.invalidateCache();
    return updated;
  }

  /**
   * Convertit une proforma acceptée (ou envoyée) en facture.
   *
   * Deux types de conversion sont possibles :
   *
   * - **`standard`** (défaut) : La facture reprend l'intégralité des lignes et des montants
   *   de la proforma. C'est le cas le plus courant.
   *
   * - **`acompte`** : La facture couvre un pourcentage du total TTC de la proforma.
   *   Une ligne récapitulative unique est créée (`Acompte X% sur devis N°…`). Les montants
   *   HT, TVA et TTC sont calculés proportionnellement. La proforma reste référencée via
   *   `proformaId` ; une future facture de solde pointera vers cette facture d'acompte
   *   via `parentInvoiceId`.
   *
   * Dans les deux cas, la proforma est marquée `accepted` si elle ne l'était pas déjà,
   * et toutes les opérations sont exécutées dans une **transaction atomique**.
   *
   * @param id      - UUID de la proforma à convertir
   * @param userId  - UUID de l'utilisateur effectuant la conversion
   * @param options - `invoiceType` ('standard' | 'acompte') et `acomptePercentage` (si acompte)
   * @returns La facture créée (avec ses lignes)
   * @throws `400` - Proforma dans un statut non convertible
   */
  async convertToInvoice(
    id: string,
    userId: string,
    options: ConvertProformaInput = { invoiceType: 'standard' },
  ) {
    const proforma = await this.findById(id);
    if (!['accepted', 'sent'].includes(proforma.status)) {
      throw AppError.badRequest('La proforma doit être envoyée ou acceptée pour être convertie');
    }

    const company = await prisma.companySettings.findFirst();
    const dueDays = company?.defaultInvoiceDueDays ?? 30;

    const invoiceNumber = await generateDocumentNumber(proforma.officeId, 'invoice');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);

    const isAcompte = options.invoiceType === 'acompte';
    const pct = isAcompte ? options.acomptePercentage! / 100 : 1;

    // Pour un acompte, on calcule les montants proportionnellement (ratio appliqué sur HT, TVA et TTC)
    const acompteHt  = Number((Number(proforma.totalHt)  * pct).toFixed(2));
    const acompteTax = Number((Number(proforma.totalTax) * pct).toFixed(2));
    const acompteTtc = Number((Number(proforma.totalTtc) * pct).toFixed(2));

    const invoice = await prisma.$transaction(async (tx) => {
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

          // Les totaux HT/TVA représentent TOUJOURS le projet complet.
          // Pour un acompte, seul totalTtc / amountDue / balanceDue sont réduits.
          // Cela est cohérent avec invoices.service.create() et permet au template
          // PDF d'afficher "TOTAL HT = projet complet" + "ACOMPTE HT X% = ..."
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

          // Copie intégrale des lignes de la proforma dans les deux cas.
          // Pour l'acompte, le template PDF calcule le montant de l'acompte
          // depuis acomptePercentage × totalHt et l'affiche dans les totaux.
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

      // Marque la proforma comme acceptée si ce n'était pas encore le cas
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

    await DashboardService.invalidateCache();
    return invoice;
  }

  async generatePdfResponse(id: string) {
    const [proforma, settings] = await Promise.all([
      this.findById(id),
      prisma.companySettings.findFirst({ select: { headerImagePath: true, footerImagePath: true, stampPath: true, footerSafeZonePx: true } }),
    ]);

    const headerImageB64 = settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined;
    const footerImageB64 = settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined;
    const sealImageB64   = settings?.stampPath       ? imgToBase64(settings.stampPath)       : undefined;

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
          // Remise ligne — affiché dans la colonne Remise si > 0
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

      // Remise globale — affiché entre TOTAL HT et TVA si > 0
      subtotalBeforeDiscountHt: Number(proforma.subtotalHt),
      globalDiscountAmount: Number(proforma.globalDiscountAmount) || undefined,
      globalDiscountLabel: Number(proforma.globalDiscountAmount) > 0
        ? proforma.globalDiscountType === 'percentage'
          ? `REMISE ${Number(proforma.globalDiscountValue).toFixed(2)}%`
          : 'REMISE'
        : undefined,

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

    await prisma.proforma.update({
      where: { id },
      data: { pdfGeneratedAt: new Date() },
    });

    return { buffer: pdfBuffer, filename: `${proforma.number.replace(/\//g, '-')}.pdf` };
  }

  async duplicate(id: string, userId: string) {
    const original = await this.findById(id);
    const company = await prisma.companySettings.findFirst();
    const validityDays = company?.defaultProformaValidityDays ?? 30;

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validityDays);

    const number = await generateDocumentNumber(original.officeId, 'proforma');

    return prisma.proforma.create({
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
    await prisma.proforma.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}

export const proformasService = new ProformasService();
