import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { StockService } from '../stock/stock.service';
import { AppError } from '../../common/errors/app-error';
import { generatePdf, buildDocumentHtml, imgToBase64 } from '../../lib/pdf';
import type { DocumentLine } from '../../lib/pdf';
import { CreatePurchaseOrderInput, UpdatePurchaseOrderInput, ReceiveInput } from './purchase-orders.schema';

interface LineInput {
  productId?: string | null;
  designation: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRate?: number;
  unit?: string | null;
  notes?: string | null;
}

function computeLines(lines: LineInput[]) {
  let totalSubtotalHt = 0, totalTax = 0;
  const computed = lines.map((l) => {
    const subtotalHt     = l.quantity * l.unitPrice;
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
      quantityOrdered: l.quantity, unitPriceHt: l.unitPrice,
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
    return po;
  }

  async create(data: CreatePurchaseOrderInput, userId: string) {
    const { lines, supplierId, officeId, ...rest } = data;
    const { lines: computed, subtotalHt, totalHt, totalTax, totalTtc } = computeLines(lines);

    const officeIdResolved: string | undefined = officeId ?? (
      await this.prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } })
    )?.id ?? undefined;

    const [orderNumber] = await this.prisma.$queryRaw<[{ fn_next_document_number: string }]>`
      SELECT fn_next_document_number('purchase_order', ${officeIdResolved ?? null}::uuid)
    `;

    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          ...(rest as any), supplierId, officeId: officeIdResolved!,
          number: orderNumber.fn_next_document_number,
          status: 'draft' as any,
          subtotalHt, totalHt, totalTax, totalTtc, createdById: userId,
          lines: { create: computed.map((l, i) => ({ ...l, sortOrder: i + 1 })) },
        },
        include: { lines: true },
      });
      await this.recordHistory(tx, po.id, 'draft', userId);
      return po;
    });
  }

  async update(id: string, data: UpdatePurchaseOrderInput, userId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    if (po.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être modifiés');

    const { lines, ...rest } = data;
    return this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
        const { lines: computed, subtotalHt, totalHt, totalTax, totalTtc } = computeLines(lines);
        return tx.purchaseOrder.update({
          where: { id },
          data: { ...(rest as any), subtotalHt, totalHt, totalTax, totalTtc, lines: { create: computed.map((l, i) => ({ ...l, sortOrder: i + 1 })) } },
          include: { lines: true },
        });
      }
      return tx.purchaseOrder.update({ where: { id }, data: rest as any });
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
      throw AppError.forbidden(`En attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps})`);
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
        throw AppError.badRequest('Bon de commande soumis pour approbation. Il sera envoyé après validation.');
      }
    }

    const result = await this.transition(id, 'draft', 'sent', userId);
    if (po) this.eventEmitter.emit('purchase_order.sent', { purchaseOrderId: id, supplierId: po.supplierId });
    return result;
  }

  async confirm(id: string, userId: string) {
    const result = await this.transition(id, 'sent', 'confirmed', userId);
    this.eventEmitter.emit('purchase_order.confirmed', { purchaseOrderId: id });
    return result;
  }

  async cancel(id: string, userId: string, comment?: string) {
    return this.transition(id, ['draft', 'sent', 'confirmed'], 'cancelled', userId, comment);
  }

  async receive(id: string, input: ReceiveInput, userId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null }, include: { lines: true },
    });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    if (!['confirmed', 'partially_received'].includes(String(po.status))) {
      throw AppError.badRequest('Le bon de commande doit être confirmé pour enregistrer une réception');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const recv of input.lines) {
        await tx.purchaseOrderLine.update({
          where: { id: recv.lineId },
          data:  { quantityReceived: { increment: recv.quantityReceived } },
        });

        const line = po.lines.find(l => l.id === recv.lineId);
        if (line?.productId) {
          await this.stockService.createStockMovement({
            productId:   line.productId,
            quantity:    recv.quantityReceived,
            type:        'purchase_receipt',
            unitCostHt:  Number(line.unitPriceHt),
            sourceType:  'purchase_order',
            sourceId:    id,
            sourceLabel: `BC ${po.number}`,
            notes:       input.notes ?? null,
            createdById: userId,
          }, tx as any);
        }
      }

      const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
      const allReceived  = updatedLines.every(l => Number(l.quantityReceived) >= Number(l.quantityOrdered));
      const anyReceived  = updatedLines.some(l => Number(l.quantityReceived) > 0);
      const newStatus    = allReceived ? 'received' : anyReceived ? 'partially_received' : String(po.status);

      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: newStatus as any } });
      await this.recordHistory(tx, id, newStatus, userId, input.notes);

      if (newStatus === 'received') {
        this.eventEmitter.emit('purchase_order.received', { purchaseOrderId: id });
      }
      return updated;
    });
  }

  async generatePdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: { supplier: true, lines: { orderBy: { sortOrder: 'asc' } }, office: true },
    });
    if (!po) throw AppError.notFound('Bon de commande introuvable');

    const settings       = await this.prisma.companySettings.findFirst();
    const headerImageB64 = settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined;
    const footerImageB64 = settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined;
    const sealImageB64   = settings?.stampPath       ? imgToBase64(settings.stampPath)       : undefined;

    const lines: DocumentLine[] = po.lines.map(l => ({
      designation: l.designation, description: l.description ?? undefined,
      quantity:    Number(l.quantityOrdered), unit: String(l.unit ?? 'pcs'),
      unitPriceHt: Number(l.unitPriceHt), netHt: Number(l.netHt),
      taxRate:     Number(l.taxRate),
      discountLabel: Number(l.discountValue) > 0 ? `${l.discountValue}%` : undefined,
    }));

    const html = buildDocumentHtml({
      type: 'Proforma', number: po.number,
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
