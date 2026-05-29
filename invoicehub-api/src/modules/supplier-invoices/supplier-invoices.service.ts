import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AppError } from '../../common/errors/app-error';
import { generatePdf, buildDocumentHtml, imgToBase64 } from '../../lib/pdf';
import type { DocumentLine } from '../../lib/pdf';
import * as accountingEngine from '../../lib/accountingEngine';
import {
  CreateSupplierInvoiceInput, UpdateSupplierInvoiceInput, PaySupplierInvoiceInput,
} from './supplier-invoices.schema';

const PAY_METHOD_MAP: Record<string, string> = {
  bank_transfer: 'virement', cash: 'especes', check: 'cheque',
  mobile_money: 'mobile_money', other: 'autre',
};

interface LineInput {
  purchaseOrderLineId?: string | null;
  productId?: string | null;
  designation: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  unit?: string | null;
}

function computeLines(lines: LineInput[]) {
  let subtotalHt = 0, totalTax = 0;
  const computed = lines.map((l) => {
    const gross          = l.quantity * l.unitPrice;
    const discountAmount = gross * (l.discountPercent / 100);
    const netHt          = gross - discountAmount;
    const tax            = netHt * (l.taxRate / 100);
    subtotalHt += netHt;
    totalTax   += tax;
    return {
      designation: l.designation, description: l.description ?? undefined,
      purchaseOrderLineId: l.purchaseOrderLineId ?? undefined,
      productId:   l.productId ?? undefined, unit: l.unit as any ?? undefined,
      quantity: l.quantity, unitPriceHt: l.unitPrice,
      discountValue: l.discountPercent, discountAmount,
      taxRate: l.taxRate, subtotalHt: gross, netHt, taxAmount: tax, totalTtc: netHt + tax,
    };
  });
  return { lines: computed, subtotalHt, totalTax, totalTtc: subtotalHt + totalTax };
}

@Injectable()
export class SupplierInvoicesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private approvalsService: ApprovalsService,
  ) {}

  private async recordHistory(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    supplierInvoiceId: string, newStatus: string, userId: string, reason?: string | null,
  ) {
    await tx.supplierInvoiceStatusHistory.create({
      data: { supplierInvoiceId, newStatus: newStatus as any, changedById: userId, reason: reason ?? undefined },
    });
  }

  async list(params: {
    page: number; limit: number;
    status?: string; supplierId?: string; dateFrom?: string; dateTo?: string; search?: string;
  }) {
    const { page, limit, status, supplierId, dateFrom, dateTo, search } = params;
    const where: Record<string, unknown> = { deletedAt: null };
    if (status)     where['status']     = status;
    if (supplierId) where['supplierId'] = supplierId;
    if (search) where['OR'] = [
      { number:                { contains: search, mode: 'insensitive' } },
      { supplierInvoiceNumber: { contains: search, mode: 'insensitive' } },
      { supplier: { name:      { contains: search, mode: 'insensitive' } } },
    ];
    if (dateFrom || dateTo) {
      where['invoiceDate'] = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
        include: { supplier: { select: { id: true, name: true, supplierCode: true } } },
      }),
      this.prisma.supplierInvoice.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier:      true,
        lines:         { orderBy: { sortOrder: 'asc' } },
        payments:      { orderBy: { paymentDate: 'asc' } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
      },
    });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    return inv;
  }

  async create(data: CreateSupplierInvoiceInput, userId: string) {
    const { lines, supplierId, purchaseOrderId, officeId, ...rest } = data;
    const { lines: computed, subtotalHt, totalTax, totalTtc } = computeLines(lines as any);

    const officeIdResolved = officeId ?? (
      await this.prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } })
    )?.id;
    if (!officeIdResolved) throw AppError.badRequest('Aucun bureau disponible');

    const [result] = await this.prisma.$queryRaw<[{ fn_next_document_number: string }]>`
      SELECT fn_next_document_number('supplier_invoice', ${officeIdResolved}::uuid)
    `;

    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.supplierInvoice.create({
        data: {
          ...(rest as any), supplierId,
          purchaseOrderId: purchaseOrderId ?? undefined,
          officeId:        officeIdResolved,
          number:          result.fn_next_document_number,
          supplierInvoiceNumber: (rest as any).supplierInvoiceRef ?? '',
          status: 'received' as any,
          subtotalHt, totalHt: subtotalHt, totalTax, totalTtc,
          amountPaid: 0, balanceDue: totalTtc,
          createdById: userId,
          lines: { create: computed.map((l, i) => ({ ...l, sortOrder: i + 1 })) },
        },
        include: { lines: true },
      });
      await this.recordHistory(tx, inv.id, 'received', userId);
      return inv;
    });
  }

  async update(id: string, data: UpdateSupplierInvoiceInput, userId: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!['received', 'draft'].includes(String(inv.status))) {
      throw AppError.badRequest('Seules les factures reçues/brouillon peuvent être modifiées');
    }

    const { lines, supplierInvoiceRef, dueDate, ...rest } = data;
    return this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.supplierInvoiceLine.deleteMany({ where: { supplierInvoiceId: id } });
        const { lines: computed, subtotalHt, totalTax, totalTtc } = computeLines(lines as any);
        await tx.supplierInvoiceLine.createMany({
          data: computed.map((l, i) => ({ ...l, supplierInvoiceId: id, sortOrder: i + 1 })),
        });
        return tx.supplierInvoice.update({
          where: { id },
          data: {
            ...(rest as any),
            ...(supplierInvoiceRef !== undefined ? { supplierInvoiceNumber: supplierInvoiceRef ?? undefined } : {}),
            ...(dueDate != null ? { dueDate } : {}),
            subtotalHt, totalHt: subtotalHt, totalTax, totalTtc,
            balanceDue: totalTtc - Number(inv.amountPaid),
          },
          include: { lines: true },
        });
      }
      return tx.supplierInvoice.update({
        where: { id },
        data: {
          ...(rest as any),
          ...(supplierInvoiceRef !== undefined ? { supplierInvoiceNumber: supplierInvoiceRef ?? undefined } : {}),
          ...(dueDate != null ? { dueDate } : {}),
        },
      });
    });
  }

  async remove(id: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!['draft', 'received'].includes(String(inv.status))) {
      throw AppError.badRequest('Seules les factures reçues/brouillon peuvent être supprimées');
    }
    await this.prisma.supplierInvoice.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async validate(id: string, userId: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (inv.status !== 'received') throw AppError.badRequest('Seules les factures reçues peuvent être validées');

    const pendingRequest = await this.approvalsService.getDocumentPendingRequest('supplier_invoice', id);
    if (pendingRequest) {
      throw AppError.forbidden(`En attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps})`);
    }
    const approvedRequest = await this.prisma.approvalRequest.findFirst({
      where: { documentId: id, documentType: 'supplier_invoice', status: 'approved' },
    });
    if (!approvedRequest) {
      const request = await this.approvalsService.requestApproval({
        documentType:   'supplier_invoice',
        documentId:     id,
        documentNumber: String(inv.number ?? `FSR-${id.slice(0, 8)}`),
        document:       inv as unknown as Record<string, unknown>,
        requestedById:  userId,
      });
      if (request) {
        await this.prisma.supplierInvoice.update({ where: { id }, data: { requiresApproval: true } });
        throw AppError.badRequest('Facture soumise pour approbation. Elle sera validée après approbation.');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.supplierInvoice.update({ where: { id }, data: { status: 'validated' as any } });
      await this.recordHistory(tx, id, 'validated', userId);
      return u;
    });
    void this.prisma.$transaction((tx: any) => accountingEngine.onSupplierInvoiceValidated(id, tx));
    this.eventEmitter.emit('supplier_invoice.validated', { supplierInvoiceId: id, supplierId: inv.supplierId });
    return updated;
  }

  async dispute(id: string, userId: string, reason: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!['received', 'validated'].includes(String(inv.status))) {
      throw AppError.badRequest('Statut invalide pour contestation');
    }
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.supplierInvoice.update({ where: { id }, data: { status: 'disputed' as any } });
      await this.recordHistory(tx, id, 'disputed', userId, reason);
      return u;
    });
  }

  async pay(id: string, data: PaySupplierInvoiceInput, userId: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!['validated', 'partially_paid'].includes(String(inv.status))) {
      throw AppError.badRequest('La facture doit être validée avant paiement');
    }

    const newAmountPaid = Number(inv.amountPaid) + data.amount;
    const newBalanceDue = Number(inv.totalTtc) - newAmountPaid;
    const newStatus     = newBalanceDue <= 0 ? 'paid' : 'partially_paid';

    const { updated, paymentId } = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: {
          supplierInvoiceId: id, supplierId: inv.supplierId,
          amount: data.amount, paymentDate: data.paymentDate,
          method:        (PAY_METHOD_MAP[data.method] ?? 'virement') as any,
          reference:     data.reference    ?? undefined,
          bankAccountId: data.bankAccountId ?? undefined,
          notes:         data.notes         ?? undefined,
          createdById:   userId,
        },
      });
      const u = await tx.supplierInvoice.update({
        where: { id },
        data: { amountPaid: newAmountPaid, balanceDue: Math.max(0, newBalanceDue), status: newStatus as any },
      });
      await this.recordHistory(tx, id, newStatus, userId);
      return { updated: u, paymentId: payment.id };
    });

    void this.prisma.$transaction((tx: any) => accountingEngine.onSupplierPaymentMade(paymentId, tx));
    this.eventEmitter.emit('supplier_invoice.paid', { supplierInvoiceId: id, amount: data.amount });
    return updated;
  }

  async listPayments(invoiceId: string) {
    return this.prisma.supplierPayment.findMany({
      where:   { supplierInvoiceId: invoiceId },
      orderBy: { paymentDate: 'asc' },
    });
  }

  async generatePdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const inv = await this.prisma.supplierInvoice.findFirst({
      where:   { id, deletedAt: null },
      include: { supplier: true, lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');

    const settings       = await this.prisma.companySettings.findFirst();
    const headerImageB64 = settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined;
    const footerImageB64 = settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined;

    const lines: DocumentLine[] = inv.lines.map(l => ({
      designation: l.designation, description: l.description ?? undefined,
      quantity:    Number(l.quantity), unit: String(l.unit ?? 'pcs'),
      unitPriceHt: Number(l.unitPriceHt), netHt: Number(l.netHt),
      taxRate:     Number(l.taxRate),
      discountLabel: Number(l.discountValue) > 0 ? `${l.discountValue}%` : undefined,
    }));

    const html = buildDocumentHtml({
      type: 'Facture', number: inv.number,
      issueDate: new Date(inv.invoiceDate).toLocaleDateString('fr-FR'),
      dueDate:   new Date(inv.dueDate).toLocaleDateString('fr-FR'),
      clientName: inv.supplier.name, clientStreet: inv.supplier.address ?? undefined,
      clientBP: inv.supplier.city ?? undefined, clientPhone: inv.supplier.phone ?? undefined,
      clientEmail: inv.supplier.email ?? undefined, clientTaxNumber: inv.supplier.taxNumber ?? undefined,
      subject: `Facture Fournisseur — Réf. ${inv.supplierInvoiceNumber}`,
      lines, subtotalHt: Number(inv.totalHt), totalTax: Number(inv.totalTax), totalTtc: Number(inv.totalTtc),
      currency: (inv as any).currency ?? 'XAF', notes: inv.notes ?? undefined,
      headerImageB64, footerImageB64,
    });

    const buffer = await generatePdf(html);
    return { buffer, filename: `${inv.number.replace(/\//g, '-')}.pdf` };
  }
}
