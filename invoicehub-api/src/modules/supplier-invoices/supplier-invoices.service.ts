import * as path from 'path';
import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AppError } from '../../common/errors/app-error';
import { APPROVAL_COMPLETED, type ApprovalCompletedEvent, type AutoExecResult } from '../../common/events/approval.events';
import * as accountingEngine from '../../lib/accountingEngine';
import { generateDocumentNumber } from '../../lib/documentNumber';
import { toRelativeUpload, resolveUpload } from '../../lib/uploads';
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
        statusHistory: {
          orderBy: { changedAt: 'asc' },
          include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
        },
        createdBy:     { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    return inv;
  }

  async create(data: CreateSupplierInvoiceInput, userId: string) {
    const { lines, supplierId, purchaseOrderId, officeId, supplierInvoiceRef, dueDate, ...rest } = data;
    const { lines: computed, subtotalHt, totalTax, totalTtc } = computeLines(lines as any);

    const officeIdResolved = officeId ?? (
      await this.prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } })
    )?.id;
    if (!officeIdResolved) throw AppError.badRequest('Aucun bureau disponible');

    // `dueDate` est NOT NULL en base : si l'appelant ne le fournit pas, on calcule
    // une échéance par défaut = invoiceDate + délai de paiement du fournisseur
    // (Supplier.defaultDueDays, 30 jours par défaut).
    let resolvedDueDate = dueDate ?? undefined;
    if (!resolvedDueDate) {
      const supplier = await this.prisma.supplier.findUnique({
        where:  { id: supplierId },
        select: { defaultDueDays: true },
      });
      const days = supplier?.defaultDueDays ?? 30;
      const base = new Date((rest as any).invoiceDate);
      base.setDate(base.getDate() + days);
      resolvedDueDate = base;
    }

    const invoiceNumber = await generateDocumentNumber(this.prisma, officeIdResolved, 'supplier_invoice');

    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.supplierInvoice.create({
        data: {
          ...(rest as any), supplierId,
          dueDate:         resolvedDueDate,
          purchaseOrderId: purchaseOrderId ?? undefined,
          officeId:        officeIdResolved,
          number:          invoiceNumber,
          supplierInvoiceNumber: supplierInvoiceRef ?? '',
          status: 'received' as any,
          subtotalHt, totalHt: subtotalHt, totalTax, totalTtc,
          amountPaid: 0, balanceDue: totalTtc,
          createdById: userId,
          lines: { create: computed.map((l, i) => ({ ...l, sortOrder: i + 1 })) },
        },
        include: { lines: true },
      });
      await this.recordHistory(tx, inv.id, 'received', userId);

      // Three-way matching : met à jour quantityInvoiced sur les lignes BC
      if (purchaseOrderId) {
        const linesToUpdate = computed.filter(l => l.purchaseOrderLineId);
        for (const fl of linesToUpdate) {
          await tx.purchaseOrderLine.update({
            where: { id: fl.purchaseOrderLineId! },
            data:  { quantityInvoiced: { increment: Number(fl.quantity) } },
          });
        }
        const bcLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId } });
        const allInvoiced = bcLines.every(l => Number(l.quantityInvoiced) >= Number(l.quantityOrdered));
        if (allInvoiced) {
          await tx.purchaseOrder.update({
            where: { id: purchaseOrderId },
            data:  { fullyInvoiced: true, status: 'invoiced' as any },
          });
        }
      }

      return inv;
    });
  }

  async update(id: string, data: UpdateSupplierInvoiceInput, userId: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({
      where:   { id, deletedAt: null },
      include: { lines: true },
    });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!['received', 'draft'].includes(String(inv.status))) {
      throw AppError.badRequest('Seules les factures reçues/brouillon peuvent être modifiées');
    }

    const { lines, supplierInvoiceRef, dueDate, ...rest } = data;
    return this.prisma.$transaction(async (tx) => {
      if (lines) {
        // Rollback three-way matching : on supprime/recrée les lignes, donc on
        // décrémente d'abord les anciennes quantités imputées au BC, puis on
        // ré-incrémente avec les nouvelles, et on recalcule fullyInvoiced/statut.
        if (inv.purchaseOrderId) {
          for (const oldLine of inv.lines) {
            if (oldLine.purchaseOrderLineId) {
              await tx.purchaseOrderLine.update({
                where: { id: oldLine.purchaseOrderLineId },
                data:  { quantityInvoiced: { decrement: Number(oldLine.quantity) } },
              });
            }
          }
        }

        await tx.supplierInvoiceLine.deleteMany({ where: { supplierInvoiceId: id } });
        const { lines: computed, subtotalHt, totalTax, totalTtc } = computeLines(lines as any);
        await tx.supplierInvoiceLine.createMany({
          data: computed.map((l, i) => ({ ...l, supplierInvoiceId: id, sortOrder: i + 1 })),
        });

        if (inv.purchaseOrderId) {
          for (const newLine of computed) {
            if (newLine.purchaseOrderLineId) {
              await tx.purchaseOrderLine.update({
                where: { id: newLine.purchaseOrderLineId },
                data:  { quantityInvoiced: { increment: Number(newLine.quantity) } },
              });
            }
          }
          await this.recomputePurchaseOrderInvoicing(tx, inv.purchaseOrderId);
        }

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
    const inv = await this.prisma.supplierInvoice.findFirst({
      where:   { id, deletedAt: null },
      include: { lines: true },
    });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!['draft', 'received'].includes(String(inv.status))) {
      throw AppError.badRequest('Seules les factures reçues/brouillon peuvent être supprimées');
    }

    // remove() n'autorise que draft/received → aucune écriture comptable à extourner.
    await this.prisma.$transaction(async (tx) => {
      await tx.supplierInvoice.update({ where: { id }, data: { deletedAt: new Date() } });

      // Rollback three-way matching : on décrémente quantityInvoiced des lignes BC
      // imputées à la création, puis on recalcule fullyInvoiced / statut du BC.
      if (inv.purchaseOrderId) {
        for (const line of inv.lines) {
          if (line.purchaseOrderLineId) {
            await tx.purchaseOrderLine.update({
              where: { id: line.purchaseOrderLineId },
              data:  { quantityInvoiced: { decrement: Number(line.quantity) } },
            });
          }
        }
        await this.recomputePurchaseOrderInvoicing(tx, inv.purchaseOrderId);
      }
    });
  }

  /**
   * Recalcule l'état de facturation d'un BC après modification du three-way matching.
   * - fullyInvoiced = true uniquement si toutes les lignes sont entièrement facturées.
   * - Si le BC était passé en 'invoiced' mais ne l'est plus, on le ramène à un statut
   *   cohérent avec sa réception ('received' / 'partially_received') sans écraser un
   *   statut terminal ('closed', 'cancelled').
   */
  private async recomputePurchaseOrderInvoicing(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    purchaseOrderId: string,
  ) {
    const po = await tx.purchaseOrder.findUnique({
      where:  { id: purchaseOrderId },
      include: { lines: true },
    });
    if (!po) return;

    const allInvoiced = po.lines.every(l => Number(l.quantityInvoiced) >= Number(l.quantityOrdered));
    const fullyInvoiced = po.lines.length > 0 && allInvoiced;

    const data: Record<string, unknown> = { fullyInvoiced };

    if (fullyInvoiced && String(po.status) !== 'invoiced' && String(po.status) !== 'closed') {
      // Devient entièrement facturé (cas incrément via update) → passe à 'invoiced'.
      data['status'] = 'invoiced' as any;
    } else if (!fullyInvoiced && String(po.status) === 'invoiced') {
      // N'est plus entièrement facturé (cas décrément) → on ramène à un statut
      // cohérent avec la réception, sans écraser un statut terminal.
      const allReceived = po.lines.every(l => Number(l.quantityReceived) >= Number(l.quantityOrdered));
      const anyReceived = po.lines.some(l => Number(l.quantityReceived) > 0);
      data['status'] = (allReceived ? 'received' : anyReceived ? 'partially_received' : 'confirmed') as any;
    }

    await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data });
  }

  async validate(id: string, userId: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (inv.status !== 'received') throw AppError.badRequest('Seules les factures reçues peuvent être validées');

    // Conformité avant comptabilisation : une FF validée doit porter la référence
    // d'origine du fournisseur ET son document scanné (piste d'audit OHADA). Le
    // numéro interne BTS (inv.number) ne remplace pas le numéro du fournisseur.
    if (!inv.supplierInvoiceNumber || inv.supplierInvoiceNumber.trim() === '') {
      throw AppError.badRequest('Renseignez le numéro de facture du fournisseur avant validation.');
    }
    if (!inv.attachmentPath) {
      throw AppError.badRequest('Joignez le document original du fournisseur (PDF/image) avant validation.');
    }

    const pendingRequest = await this.approvalsService.getDocumentPendingRequest('supplier_invoice', id);
    if (pendingRequest) {
      throw AppError.badRequest(
        `Cette facture est en attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps}).`,
        'APPROVAL_PENDING',
      );
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
        throw AppError.badRequest(
          'Cette facture a été soumise pour approbation. Elle sera validée après approbation.',
          'APPROVAL_SUBMITTED',
        );
      }
    }

    // L'écriture comptable est générée DANS la même transaction que la validation :
    // si la comptabilisation échoue (compte/journal/période manquant), la validation
    // entière est annulée. On n'autorise pas une FF validée sans écriture (cf. #7).
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.supplierInvoice.update({ where: { id }, data: { status: 'validated' as any } });
      await this.recordHistory(tx, id, 'validated', userId);
      await accountingEngine.onSupplierInvoiceValidated(id, tx as any);
      return u;
    });
    this.eventEmitter.emit('supplier_invoice.validated', { supplierInvoiceId: id, supplierId: inv.supplierId });
    return updated;
  }

  /** Auto-validation après approbation finale, au nom du demandeur (maker). */
  @OnEvent(APPROVAL_COMPLETED)
  async onApprovalCompleted(payload: ApprovalCompletedEvent): Promise<AutoExecResult | void> {
    if (payload.documentType !== 'supplier_invoice') return;
    try {
      await this.validate(payload.documentId, payload.requestedById);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof AppError ? e.message : 'Erreur lors de la validation automatique' };
    }
  }

  async dispute(id: string, userId: string, reason: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!['received', 'validated'].includes(String(inv.status))) {
      throw AppError.badRequest('Statut invalide pour contestation');
    }
    const wasValidated = String(inv.status) === 'validated';
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.supplierInvoice.update({ where: { id }, data: { status: 'disputed' as any } });
      await this.recordHistory(tx, id, 'disputed', userId, reason);
      // Si la FF était validée (donc comptabilisée), on contre-passe l'écriture
      // pour ne pas laisser la dette fournisseur 401 inscrite (cf. #8).
      if (wasValidated) {
        await accountingEngine.onSupplierInvoiceDisputed(id, tx as any);
      }
      return u;
    });
  }

  async pay(id: string, data: PaySupplierInvoiceInput, userId: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!['validated', 'partially_paid'].includes(String(inv.status))) {
      throw AppError.badRequest('La facture doit être validée avant paiement');
    }

    // Blocage du surpaiement (tolérance d'arrondi 0,01 sur le solde dû).
    if (data.amount > Number(inv.balanceDue) + 0.01) {
      throw AppError.badRequest('Le montant dépasse le solde dû');
    }

    const newAmountPaid = Number(inv.amountPaid) + data.amount;
    const newBalanceDue = Number(inv.totalTtc) - newAmountPaid;
    const newStatus     = newBalanceDue <= 0 ? 'paid' : 'partially_paid';

    // Le décaissement comptable est écrit DANS la même transaction que le paiement :
    // un échec de comptabilisation annule l'ensemble (pas de paiement sans écriture).
    const { updated } = await this.prisma.$transaction(async (tx) => {
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
      await accountingEngine.onSupplierPaymentMade(payment.id, tx as any);
      return { updated: u, paymentId: payment.id };
    });

    this.eventEmitter.emit('supplier_invoice.paid', { supplierInvoiceId: id, amount: data.amount });
    return updated;
  }

  async listPayments(invoiceId: string) {
    return this.prisma.supplierPayment.findMany({
      where:   { supplierInvoiceId: invoiceId },
      orderBy: { paymentDate: 'asc' },
    });
  }

  // ─── Pièce jointe : document original reçu du fournisseur ────────────────────
  // Une FF n'est pas un document émis par BTS : on ne génère pas de PDF, on stocke
  // le justificatif original (scan/PDF envoyé par le fournisseur).

  async uploadAttachment(id: string, filePath: string): Promise<void> {
    const inv = await this.prisma.supplierInvoice.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, attachmentPath: true },
    });
    if (!inv) {
      // Nettoie le fichier déjà écrit sur le disque par multer si la FF n'existe pas
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw AppError.notFound('Facture fournisseur introuvable');
    }
    // Remplace l'ancien document s'il existait (résout relatif récent ou absolu hérité)
    if (inv.attachmentPath) {
      const oldAbs = resolveUpload(inv.attachmentPath);
      if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
    }
    // Stocke un chemin RELATIF (portable), pas le chemin absolu de multer
    await this.prisma.supplierInvoice.update({
      where: { id }, data: { attachmentPath: toRelativeUpload(filePath) },
    });
  }

  async getAttachment(id: string): Promise<{ filePath: string; filename: string }> {
    const inv = await this.prisma.supplierInvoice.findFirst({
      where: { id, deletedAt: null },
      select: { attachmentPath: true, number: true, supplierInvoiceNumber: true },
    });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!inv.attachmentPath) throw AppError.notFound('Aucun document attaché à cette facture');
    const absPath = resolveUpload(inv.attachmentPath);
    if (!fs.existsSync(absPath)) throw AppError.notFound('Fichier introuvable sur le serveur');

    const ext = path.extname(absPath);
    const ref = (inv.supplierInvoiceNumber || inv.number).replace(/\//g, '-');
    return { filePath: absPath, filename: `document-fournisseur-${ref}${ext}` };
  }

  async deleteAttachment(id: string): Promise<void> {
    const inv = await this.prisma.supplierInvoice.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, attachmentPath: true },
    });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!inv.attachmentPath) throw AppError.notFound('Aucun document à supprimer');
    const absPath = resolveUpload(inv.attachmentPath);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    await this.prisma.supplierInvoice.update({ where: { id }, data: { attachmentPath: null } });
  }
}
