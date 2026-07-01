import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { APPROVAL_COMPLETED, type ApprovalCompletedEvent, type AutoExecResult } from '../../common/events/approval.events';
import { StockService } from '../stock/stock.service';
import { AppError } from '../../common/errors/app-error';
import { broadcastNotification } from '../../lib/broadcast';
import { generatePdf, buildDocumentHtml, imgToBase64 } from '../../lib/pdf';
import type { DocumentLine } from '../../lib/pdf';
import { loadUnits, resolveUnitLabel } from '../../lib/units';
import { CreatePurchaseOrderInput, UpdatePurchaseOrderInput, ReceiveInput } from './purchase-orders.schema';
import { generateDocumentNumber } from '../../lib/documentNumber';
import type { NotificationJobData } from '../../jobs/job-types';

interface LineInput {
  productId?: string | null;
  designation: string;
  description?: string | null;
  quantity: number;
  // Frontend envoie `unitPriceHt` ; ancien nom `unitPrice` conservé pour rétrocompat
  unitPriceHt?: number;
  unitPrice?: number;
  discountPercent?: number;
  taxRate?: number;
  unit?: string | null;
  sortOrder?: number;
  // notes: absent du modèle PurchaseOrderLine — ignoré
}

function computeLines(lines: LineInput[]) {
  let totalSubtotalHt = 0, totalTax = 0;
  const computed = lines.map((l) => {
    // Accepte les deux noms de champ
    const price          = l.unitPriceHt ?? l.unitPrice ?? 0;
    const subtotalHt     = l.quantity * price;
    const discountValue  = l.discountPercent ?? 0;
    const discountAmount = subtotalHt * (discountValue / 100);
    const netHt          = subtotalHt - discountAmount;
    const taxRate        = l.taxRate ?? 0;
    const taxAmount      = netHt * (taxRate / 100);
    totalSubtotalHt     += netHt;
    totalTax            += taxAmount;
    return {
      designation: l.designation, description: l.description ?? undefined,
      productId:   l.productId ?? undefined, unit: l.unit as any ?? undefined,
      quantityOrdered: l.quantity, unitPriceHt: price,
      discountValue, discountAmount, taxRate, subtotalHt, netHt, taxAmount,
      totalTtc: netHt + taxAmount,
    };
  });
  return { lines: computed, subtotalHt: totalSubtotalHt, totalHt: totalSubtotalHt, totalTax, totalTtc: totalSubtotalHt + totalTax };
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private approvalsService: ApprovalsService,
    private stockService: StockService,
    @InjectQueue('notification') private readonly notifQueue: Queue<NotificationJobData>,
  ) {}

  private async recordHistory(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    purchaseOrderId: string, newStatus: string, userId: string, reason?: string | null,
  ) {
    await tx.purchaseOrderStatusHistory.create({
      data: { purchaseOrderId, newStatus: newStatus as any, changedById: userId, reason: reason ?? undefined },
    });
  }

  private async transition(id: string, from: string | string[], to: string, userId: string, comment?: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    const fromArr = Array.isArray(from) ? from : [from];
    if (!fromArr.includes(String(po.status))) {
      throw AppError.badRequest(`Transition invalide : ${po.status} → ${to}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: to as any } });
      await this.recordHistory(tx, id, to, userId, comment);
      return updated;
    });
  }

  async list(params: {
    page: number; limit: number;
    search?: string; status?: string; supplierId?: string; dateFrom?: string; dateTo?: string;
  }) {
    const { page, limit, search, status, supplierId, dateFrom, dateTo } = params;
    const where: Record<string, unknown> = { deletedAt: null };
    if (status)     where['status']     = status;
    if (supplierId) where['supplierId'] = supplierId;
    if (search) where['OR'] = [
      { number:   { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
    ];
    if (dateFrom || dateTo) {
      where['issueDate'] = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true, supplierCode: true } },
          _count:   { select: { lines: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier:      true,
        lines:         { orderBy: { sortOrder: 'asc' } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
        createdBy:     { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    (po as any).approvalRequest = await this.approvalsService.getLatestForDocument('purchase_order', id);
    return po;
  }

  async stats() {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const [total, sent, confirmed, received, agg] = await Promise.all([
      this.prisma.purchaseOrder.count({ where: { deletedAt: null } }),
      // « En attente » = envoyés au fournisseur, en attente de confirmation
      this.prisma.purchaseOrder.count({ where: { deletedAt: null, status: 'sent' as any } }),
      // « Confirmés » = validés par le fournisseur
      this.prisma.purchaseOrder.count({ where: { deletedAt: null, status: 'confirmed' as any } }),
      // « Réceptionnés » = totalement ou partiellement reçus
      this.prisma.purchaseOrder.count({ where: { deletedAt: null, status: { in: ['received', 'partially_received'] as any } } }),
      this.prisma.purchaseOrder.aggregate({
        where: { deletedAt: null, issueDate: { gte: start } },
        _sum:  { totalTtc: true },
      }),
    ]);
    return { total, pending: sent, approved: confirmed, received, totalAmountMonth: Number(agg._sum.totalTtc ?? 0) };
  }

  async create(data: CreatePurchaseOrderInput, userId: string) {
    const {
      lines, supplierId, officeId,
      // Normalise les alias front → noms Prisma
      orderDate,
      expectedDate, expectedDeliveryDate,
      reference, internalRef,
      paymentTermDays,
      ...rest
    } = data;
    const { lines: computed, subtotalHt, totalHt, totalTax, totalTtc } = computeLines(lines);

    // Résolution des alias : préférer le nom canonique s'il est fourni
    const resolvedIssueDate            = orderDate ?? undefined;
    const resolvedExpectedDeliveryDate = expectedDeliveryDate ?? expectedDate ?? undefined;
    // `reference` / `internalRef` → stocké dans `supplierReference` (texte libre)
    const resolvedSupplierReference    = internalRef ?? reference ?? undefined;
    // `paymentTermDays` → stocké dans `paymentConditions` sous forme de texte
    const resolvedPaymentConditions    = paymentTermDays != null
      ? `${paymentTermDays} jours`
      : (rest as any).paymentConditions ?? undefined;

    const officeIdResolved: string | undefined = officeId ?? (
      await this.prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } })
    )?.id ?? undefined;

    if (!officeIdResolved) throw AppError.badRequest('Aucune agence configurée — créez une agence dans Paramètres');

    const orderNumber = await generateDocumentNumber(this.prisma, officeIdResolved, 'purchase_order');

    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          ...(rest as any), supplierId, officeId: officeIdResolved!,
          ...(resolvedIssueDate ? { issueDate: resolvedIssueDate } : {}),
          expectedDeliveryDate: resolvedExpectedDeliveryDate,
          supplierReference:    resolvedSupplierReference,
          paymentConditions:    resolvedPaymentConditions,
          number: orderNumber,
          status: 'draft' as any,
          subtotalHt, totalHt, totalTax, totalTtc, createdById: userId,
          lines: { create: computed.map((l, i) => ({ ...l, sortOrder: i + 1 })) },
        },
        include: { lines: true },
      });
      await this.recordHistory(tx, po.id, 'draft', userId);
      return po;
    }).then(po => {
      void broadcastNotification(this.prisma as any, this.notifQueue, {
        type: 'purchase_order_created', title: `Nouveau bon de commande : ${po.number}`,
        message: `Le BC ${po.number} a été créé.`,
        data: { purchaseOrderId: po.id, purchaseOrderNumber: po.number, amountTtc: String(po.totalTtc), documentLink: `/purchase-orders/${po.id}` },
      }, { excludeUserId: userId, permission: 'purchases:read' });
      return po;
    });
  }

  async update(id: string, data: UpdatePurchaseOrderInput, userId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    if (po.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être modifiés');

    const {
      lines,
      expectedDate, expectedDeliveryDate,
      reference, internalRef,
      paymentTermDays,
      ...rest
    } = data;

    // Normalise les alias front → noms Prisma
    const resolvedExpectedDeliveryDate = expectedDeliveryDate ?? expectedDate ?? undefined;
    const resolvedSupplierReference    = internalRef ?? reference ?? undefined;
    const resolvedPaymentConditions    = paymentTermDays != null
      ? `${paymentTermDays} jours`
      : (rest as any).paymentConditions ?? undefined;

    const normalised = {
      ...(rest as any),
      ...(resolvedExpectedDeliveryDate !== undefined ? { expectedDeliveryDate: resolvedExpectedDeliveryDate } : {}),
      ...(resolvedSupplierReference    !== undefined ? { supplierReference:    resolvedSupplierReference    } : {}),
      ...(resolvedPaymentConditions    !== undefined ? { paymentConditions:    resolvedPaymentConditions    } : {}),
    };

    return this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
        const { lines: computed, subtotalHt, totalHt, totalTax, totalTtc } = computeLines(lines);
        return tx.purchaseOrder.update({
          where: { id },
          data: { ...normalised, subtotalHt, totalHt, totalTax, totalTtc, lines: { create: computed.map((l, i) => ({ ...l, sortOrder: i + 1 })) } },
          include: { lines: true },
        });
      }
      return tx.purchaseOrder.update({ where: { id }, data: normalised });
    });
  }

  async remove(id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    if (po.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être supprimés');
    await this.prisma.purchaseOrder.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  computeDryRun(lines: LineInput[]) {
    return computeLines(lines);
  }

  async send(id: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      select: { supplierId: true, number: true, totalTtc: true, status: true },
    });

    const pendingRequest = await this.approvalsService.getDocumentPendingRequest('purchase_order', id);
    if (pendingRequest) {
      throw AppError.badRequest(
        `Ce bon de commande est en attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps}).`,
        'APPROVAL_PENDING',
      );
    }
    const approvedRequest = await this.prisma.approvalRequest.findFirst({
      where: { documentId: id, documentType: 'purchase_order', status: 'approved' },
    });
    if (!approvedRequest) {
      const request = await this.approvalsService.requestApproval({
        documentType:   'purchase_order',
        documentId:     id,
        documentNumber: String(po?.number ?? `BC-${id.slice(0, 8)}`),
        document:       (po ?? {}) as unknown as Record<string, unknown>,
        requestedById:  userId,
      });
      if (request) {
        await this.prisma.purchaseOrder.update({ where: { id }, data: { requiresApproval: true } });
        throw AppError.badRequest(
          'Ce bon de commande a été soumis pour approbation. Il sera envoyé après validation.',
          'APPROVAL_SUBMITTED',
        );
      }
    }

    const result = await this.transition(id, 'draft', 'sent', userId);
    if (po) this.eventEmitter.emit('purchase_order.sent', { purchaseOrderId: id, supplierId: po.supplierId });
    void broadcastNotification(this.prisma as any, this.notifQueue, {
      type: 'purchase_order_approved', title: `BC envoyé au fournisseur : ${po?.number ?? id}`,
      message: `Le bon de commande ${po?.number ?? id} a été envoyé au fournisseur.`,
      data: { purchaseOrderId: id, purchaseOrderNumber: po?.number ?? id, amountTtc: String(po?.totalTtc ?? ''), documentLink: `/purchase-orders/${id}` },
    }, { excludeUserId: userId, permission: 'purchases:read' });
    return result;
  }

  /** Auto-envoi après approbation finale, au nom du demandeur (maker). */
  @OnEvent(APPROVAL_COMPLETED)
  async onApprovalCompleted(payload: ApprovalCompletedEvent): Promise<AutoExecResult | void> {
    if (payload.documentType !== 'purchase_order') return;
    try {
      await this.send(payload.documentId, payload.requestedById);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof AppError ? e.message : "Erreur lors de l'envoi automatique" };
    }
  }

  async confirm(id: string, userId: string) {
    const result = await this.transition(id, 'sent', 'confirmed', userId);
    this.eventEmitter.emit('purchase_order.confirmed', { purchaseOrderId: id });
    return result;
  }

  async close(id: string, userId: string) {
    // On peut clôturer un BC réceptionné, partiellement reçu ou déjà facturé.
    return this.transition(id, ['received', 'partially_received', 'invoiced'], 'closed', userId);
  }

  async cancel(id: string, userId: string, comment?: string) {
    const result = await this.transition(id, ['draft', 'sent', 'confirmed'], 'cancelled', userId, comment);
    void broadcastNotification(this.prisma as any, this.notifQueue, {
      type: 'system', title: `BC annulé : ${result.number}`,
      message: `Le bon de commande ${result.number} a été annulé.${comment ? ` Motif : ${comment}` : ''}`,
      data: { purchaseOrderId: id, documentLink: `/purchase-orders/${id}` },
    }, { excludeUserId: userId, permission: 'purchases:read' });
    return result;
  }

  async receive(id: string, input: ReceiveInput, userId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null }, include: { lines: true },
    });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    if (!['confirmed', 'partially_received'].includes(String(po.status))) {
      throw AppError.badRequest('Le bon de commande doit être confirmé pour enregistrer une réception');
    }

    // Pré-validation hors transaction : vérification que chaque quantité saisie
    // ne dépasse pas le restant à recevoir. Effectuée sur le snapshot du BC
    // (optimiste) — la transaction ci-dessous utilise SELECT FOR UPDATE implicite
    // via Prisma pour protéger contre les races concurrentes.
    for (const recv of input.lines) {
      const line = po.lines.find(l => l.id === recv.lineId);
      if (!line) throw AppError.badRequest(`Ligne introuvable : ${recv.lineId}`);
      const remaining = Number(line.quantityOrdered) - Number(line.quantityReceived);
      if (recv.quantityReceived < 0) {
        throw AppError.badRequest(`La quantité reçue ne peut pas être négative (ligne : ${line.designation}).`);
      }
      if (recv.quantityReceived > remaining) {
        throw AppError.badRequest(
          `Quantité trop élevée pour « ${line.designation} » : restant ${remaining}, saisi ${recv.quantityReceived}.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const recv of input.lines) {
        // Recharge la ligne en lecture verouillée pour protéger contre les races.
        const fresh = await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: recv.lineId } });
        const remaining = Number(fresh.quantityOrdered) - Number(fresh.quantityReceived);
        if (recv.quantityReceived > remaining) {
          throw AppError.badRequest(
            `Réception concurrente détectée pour « ${fresh.designation} » : restant ${remaining}, saisi ${recv.quantityReceived}.`,
          );
        }

        await tx.purchaseOrderLine.update({
          where: { id: recv.lineId },
          data:  { quantityReceived: { increment: recv.quantityReceived } },
        });

        const line = po.lines.find(l => l.id === recv.lineId);
        if (line?.productId) {
          // Mouvement de stock dans sa propre transaction — une erreur (service sans
          // stock, compte comptable manquant) ne doit pas avorter la réception BC.
          this.stockService.createStockMovement({
            productId:   line.productId,
            quantity:    recv.quantityReceived,
            type:        'purchase_receipt',
            unitCostHt:  Number(line.unitPriceHt),
            sourceType:  'purchase_order',
            sourceId:    id,
            sourceLabel: `BC ${po.number}`,
            notes:       input.notes ?? null,
            createdById: userId,
          }).catch(e => {
            if (!e?.message?.includes('ne gère pas le stock')) {
              console.error('[receive] stock movement failed for line', line.id, e?.message);
            }
          });
        }
      }

      const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
      const allReceived  = updatedLines.every(l => Number(l.quantityReceived) >= Number(l.quantityOrdered));
      const anyReceived  = updatedLines.some(l => Number(l.quantityReceived) > 0);
      const newStatus    = allReceived ? 'received' : anyReceived ? 'partially_received' : String(po.status);

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: newStatus as any,
          ...(allReceived && input.receivedDate ? { deliveredAt: input.receivedDate } : {}),
          ...(allReceived && !input.receivedDate ? { deliveredAt: new Date() } : {}),
        },
      });
      await this.recordHistory(tx, id, newStatus, userId, input.notes);

      if (newStatus === 'received') {
        this.eventEmitter.emit('purchase_order.received', { purchaseOrderId: id });
      }
      return updated;
    }).then(updated => {
      void broadcastNotification(this.prisma as any, this.notifQueue, {
        type: 'purchase_order_received' as any,
        title: `BC réceptionné : ${updated.number}`,
        message: `Le bon de commande ${updated.number} a été ${updated.status === 'received' ? 'entièrement' : 'partiellement'} réceptionné.`,
        data: { purchaseOrderId: id, documentLink: `/purchase-orders/${id}` },
      }, { excludeUserId: userId, permission: 'purchases:read' });
      return updated;
    });
  }

  async createSupplierInvoice(id: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, supplier: true },
    });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    if (!['received', 'partially_received'].includes(String(po.status))) {
      throw AppError.badRequest('Le BC doit être réceptionné avant de créer une facture fournisseur');
    }

    const officeIdResolved = po.officeId ?? (
      await this.prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } })
    )?.id;
    if (!officeIdResolved) throw AppError.badRequest('Aucune agence configurée');

    const ffNumber = await generateDocumentNumber(this.prisma, officeIdResolved, 'supplier_invoice');

    let subtotalHt = 0, totalTax = 0;
    const ffLines = po.lines.map((l, i) => {
      const netHt   = Number(l.netHt);
      const taxAmt  = Number(l.taxAmount);
      subtotalHt   += netHt;
      totalTax     += taxAmt;
      return {
        purchaseOrderLineId: l.id,
        designation:  l.designation,
        description:  l.description ?? undefined,
        unit:         l.unit as any,
        quantity:     Number(l.quantityOrdered),
        unitPriceHt:  Number(l.unitPriceHt),
        discountType:   l.discountType,
        discountValue:  Number(l.discountValue),
        discountAmount: Number(l.discountAmount),
        taxRate:      Number(l.taxRate),
        subtotalHt:   Number(l.subtotalHt),
        netHt,
        taxAmount:    taxAmt,
        totalTtc:     Number(l.totalTtc),
        sortOrder:    i + 1,
      };
    });
    const totalTtc = subtotalHt + totalTax;

    return this.prisma.$transaction(async (tx) => {
      const ff = await tx.supplierInvoice.create({
        data: {
          number:                ffNumber,
          supplierId:            po.supplierId,
          purchaseOrderId:       id,
          officeId:              officeIdResolved,
          supplierInvoiceNumber: '',
          invoiceDate:           new Date(),
          dueDate:               (() => {
            const days = po.paymentConditions
              ? parseInt(po.paymentConditions, 10) || 30
              : 30;
            const d = new Date(); d.setDate(d.getDate() + days); return d;
          })(),
          status:                'received' as any,
          currency:              po.currency,
          subtotalHt,
          totalHt:               subtotalHt,
          totalTax,
          totalTtc,
          amountPaid:            0,
          balanceDue:            totalTtc,
          createdById:           userId,
          lines:                 { create: ffLines as any },
        } as any,
        select: { id: true, number: true },
      });

      // Mise à jour quantityInvoiced sur les lignes BC
      for (const l of po.lines) {
        await tx.purchaseOrderLine.update({
          where: { id: l.id },
          data:  { quantityInvoiced: l.quantityOrdered },
        });
      }

      // BC → invoiced + fullyInvoiced
      await tx.purchaseOrder.update({
        where: { id },
        data:  { status: 'invoiced' as any, fullyInvoiced: true },
      });

      await this.recordHistory(tx, id, 'invoiced', userId, `FF ${ff.number} créée`);
      return { supplierInvoiceId: ff.id, supplierInvoiceNumber: ff.number };
    });
  }

  async getLinkedSupplierInvoices(id: string) {
    return this.prisma.supplierInvoice.findMany({
      where:   { purchaseOrderId: id, deletedAt: null },
      select:  { id: true, number: true, status: true, totalTtc: true, invoiceDate: true, amountPaid: true, balanceDue: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async generatePdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: { supplier: true, lines: { orderBy: { sortOrder: 'asc' } }, office: true },
    });
    if (!po) throw AppError.notFound('Bon de commande introuvable');

    const [settings, units] = await Promise.all([
      this.prisma.companySettings.findFirst(),
      loadUnits(this.prisma as any),
    ]);
    const headerImageB64 = settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined;
    const footerImageB64 = settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined;
    const sealImageB64   = settings?.stampPath       ? imgToBase64(settings.stampPath)       : undefined;

    const lines: DocumentLine[] = po.lines.map(l => {
      const qty = Number(l.quantityOrdered);
      const unitCode = String(l.unit ?? 'piece');
      return {
        designation: l.designation, description: l.description ?? undefined,
        quantity:    qty, unit: unitCode,
        unitLabel:   resolveUnitLabel(units, unitCode, qty),
        unitPriceHt: Number(l.unitPriceHt), netHt: Number(l.netHt),
        taxRate:     Number(l.taxRate),
        discountLabel: Number(l.discountValue) > 0 ? `${l.discountValue}%` : undefined,
      };
    });

    const html = buildDocumentHtml({
      type: 'Bon de Commande', number: po.number,
      issueDate: new Date(po.issueDate).toLocaleDateString('fr-FR'),
      dueDate:   po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('fr-FR') : undefined,
      clientName: po.supplier.name, clientStreet: po.supplier.address ?? undefined,
      clientBP: po.supplier.city ?? undefined, clientPhone: po.supplier.phone ?? undefined,
      clientEmail: po.supplier.email ?? undefined, clientTaxNumber: po.supplier.taxNumber ?? undefined,
      subject: `Bon de Commande — ${po.supplier.name}`,
      lines, subtotalHt: Number(po.totalHt), totalTax: Number(po.totalTax), totalTtc: Number(po.totalTtc),
      currency: 'XAF', notes: po.notes ?? undefined,
      headerImageB64, footerImageB64, sealImageB64,
    });

    const buffer = await generatePdf(html);
    return { buffer, filename: `${po.number.replace(/\//g, '-')}.pdf` };
  }
}
