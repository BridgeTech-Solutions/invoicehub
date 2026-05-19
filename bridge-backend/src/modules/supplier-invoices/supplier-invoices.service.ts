import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import {
  CreateSupplierInvoiceInput, UpdateSupplierInvoiceInput,
  PaySupplierInvoiceInput,
} from './supplier-invoices.schema';
import { generatePdf, buildDocumentHtml, imgToBase64 } from '../../lib/pdf';
import type { DocumentLine } from '../../lib/pdf';
import { eventBus } from '../../lib/eventBus';
import * as accountingEngine from '../../lib/accountingEngine';
import { approvalsService } from '../approvals/approvals.service';

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
  let subtotalHt = 0;
  let totalTax = 0;
  const computed = lines.map((l) => {
    const gross = l.quantity * l.unitPrice;
    const discountAmount = gross * (l.discountPercent / 100);
    const netHt = gross - discountAmount;
    const tax = netHt * (l.taxRate / 100);
    subtotalHt += netHt;
    totalTax += tax;
    return {
      designation: l.designation,
      description: l.description ?? undefined,
      purchaseOrderLineId: l.purchaseOrderLineId ?? undefined,
      productId: l.productId ?? undefined,
      unit: l.unit as any ?? undefined,
      quantity: l.quantity,
      unitPriceHt: l.unitPrice,
      discountValue: l.discountPercent,
      discountAmount,
      taxRate: l.taxRate,
      subtotalHt: gross,
      netHt,
      taxAmount: tax,
      totalTtc: netHt + tax,
    };
  });
  return { lines: computed, subtotalHt, totalTax, totalTtc: subtotalHt + totalTax };
}

async function recordHistory(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  supplierInvoiceId: string,
  newStatus: string,
  userId: string,
  reason?: string | null,
) {
  await tx.supplierInvoiceStatusHistory.create({
    data: { supplierInvoiceId, newStatus: newStatus as any, changedById: userId, reason: reason ?? undefined },
  });
}

export async function listSupplierInvoices(params: {
  page: number; limit: number;
  status?: string; supplierId?: string;
  dateFrom?: string; dateTo?: string; search?: string;
}) {
  const { page, limit, status, supplierId, dateFrom, dateTo, search } = params;
  const where: Record<string, unknown> = { deletedAt: null };
  if (status) where['status'] = status;
  if (supplierId) where['supplierId'] = supplierId;
  if (search) where['OR'] = [
    { number: { contains: search, mode: 'insensitive' } },
    { supplierInvoiceNumber: { contains: search, mode: 'insensitive' } },
    { supplier: { name: { contains: search, mode: 'insensitive' } } },
  ];
  if (dateFrom || dateTo) {
    where['invoiceDate'] = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  const [data, total] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: { select: { id: true, name: true, supplierCode: true } },
      },
    }),
    prisma.supplierInvoice.count({ where }),
  ]);
  return { data, total };
}

export async function getSupplierInvoiceById(id: string) {
  const inv = await prisma.supplierInvoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      supplier: true,
      lines: { orderBy: { sortOrder: 'asc' } },
      payments: { orderBy: { paymentDate: 'asc' } },
      statusHistory: { orderBy: { changedAt: 'asc' } },
    },
  });
  if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
  return inv;
}

export async function createSupplierInvoice(data: CreateSupplierInvoiceInput, userId: string) {
  const { lines, supplierId, purchaseOrderId, officeId, ...rest } = data;
  const { lines: computed, subtotalHt, totalTax, totalTtc } = computeLines(lines as any);

  const officeIdResolved = officeId ?? (
    await prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } })
  )?.id;
  if (!officeIdResolved) throw AppError.badRequest('Aucun bureau disponible');

  const [result] = await prisma.$queryRaw<[{ fn_next_document_number: string }]>`
    SELECT fn_next_document_number('supplier_invoice', ${officeIdResolved}::uuid)
  `;

  return prisma.$transaction(async (tx) => {
    const inv = await tx.supplierInvoice.create({
      data: {
        ...rest as any,
        supplierId,
        purchaseOrderId: purchaseOrderId ?? undefined,
        officeId: officeIdResolved,
        number: result.fn_next_document_number,
        supplierInvoiceNumber: (rest as any).supplierInvoiceRef ?? '',
        status: 'received' as any,
        subtotalHt,
        totalHt: subtotalHt,
        totalTax,
        totalTtc,
        amountPaid: 0,
        balanceDue: totalTtc,
        createdById: userId,
        lines: {
          create: computed.map((l, i) => ({ ...l, sortOrder: i + 1 })),
        },
      },
      include: { lines: true },
    });
    await recordHistory(tx, inv.id, 'received', userId);
    return inv;
  });
}

export async function updateSupplierInvoice(id: string, data: UpdateSupplierInvoiceInput, _userId: string) {
  const inv = await prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
  if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
  if (!['received', 'draft'].includes(String(inv.status))) {
    throw AppError.badRequest('Seules les factures reçues/brouillon peuvent être modifiées');
  }

  const { lines, supplierInvoiceRef, dueDate, ...rest } = data;

  return prisma.$transaction(async (tx) => {
    if (lines) {
      await tx.supplierInvoiceLine.deleteMany({ where: { supplierInvoiceId: id } });
      const { lines: computed, subtotalHt, totalTax, totalTtc } = computeLines(lines as any);
      await tx.supplierInvoiceLine.createMany({
        data: computed.map((l, i) => ({ ...l, supplierInvoiceId: id, sortOrder: i + 1 })),
      });
      return tx.supplierInvoice.update({
        where: { id },
        data: {
          ...rest as any,
          ...(supplierInvoiceRef !== undefined ? { supplierInvoiceNumber: supplierInvoiceRef ?? undefined } : {}),
          ...(dueDate !== undefined && dueDate !== null ? { dueDate } : {}),
          subtotalHt,
          totalHt: subtotalHt,
          totalTax,
          totalTtc,
          balanceDue: totalTtc - Number(inv.amountPaid),
        },
        include: { lines: true },
      });
    }
    return tx.supplierInvoice.update({
      where: { id },
      data: {
        ...rest as any,
        ...(supplierInvoiceRef !== undefined ? { supplierInvoiceNumber: supplierInvoiceRef ?? undefined } : {}),
        ...(dueDate !== undefined && dueDate !== null ? { dueDate } : {}),
      },
    });
  });
}

export async function deleteSupplierInvoice(id: string) {
  const inv = await prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
  if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
  if (inv.status !== 'draft' && inv.status !== 'received') {
    throw AppError.badRequest('Seules les factures reçues/brouillon peuvent être supprimées');
  }
  await prisma.supplierInvoice.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function validateSupplierInvoice(id: string, userId: string) {
  const inv = await prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
  if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
  if (inv.status !== 'received') throw AppError.badRequest('Seules les factures reçues peuvent être validées');

  // ── Vérification workflow d'approbation ───────────────────────
  const pendingRequest = await approvalsService.getDocumentPendingRequest('supplier_invoice', id);
  if (pendingRequest) {
    throw AppError.forbidden(`Cette facture fournisseur est en attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps})`);
  }
  const approvedRequest = await prisma.approvalRequest.findFirst({ where: { documentId: id, documentType: 'supplier_invoice', status: 'approved' } });
  if (!approvedRequest) {
    const request = await approvalsService.requestApproval({
      documentType:   'supplier_invoice',
      documentId:     id,
      documentNumber: String(inv.number ?? `FSR-${id.slice(0, 8)}`),
      document:       inv as unknown as Record<string, unknown>,
      requestedById:  userId,
    });
    if (request) {
      await prisma.supplierInvoice.update({ where: { id }, data: { requiresApproval: true } });
      throw AppError.badRequest('Cette facture fournisseur a été soumise pour approbation. Elle sera validée après approbation.');
    }
  }
  // ─────────────────────────────────────────────────────────────

  return prisma.$transaction(async (tx) => {
    const updated = await tx.supplierInvoice.update({ where: { id }, data: { status: 'validated' as any } });
    await recordHistory(tx, id, 'validated', userId);
    return updated;
  }).then((updated) => {
    void prisma.$transaction((tx) => accountingEngine.onSupplierInvoiceValidated(id, tx));
    void eventBus.emit('supplier_invoice.validated', { supplierInvoiceId: id, supplierId: inv.supplierId });
    return updated;
  });
}

export async function disputeSupplierInvoice(id: string, userId: string, reason: string) {
  const inv = await prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
  if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
  if (!['received', 'validated'].includes(String(inv.status))) {
    throw AppError.badRequest('Statut invalide pour contestation');
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.supplierInvoice.update({ where: { id }, data: { status: 'disputed' as any } });
    await recordHistory(tx, id, 'disputed', userId, reason);
    return updated;
  });
}

const payMethodMap: Record<string, string> = {
  bank_transfer: 'virement',
  cash: 'especes',
  check: 'cheque',
  mobile_money: 'mobile_money',
  other: 'autre',
};

export async function paySupplierInvoice(id: string, data: PaySupplierInvoiceInput, userId: string) {
  const inv = await prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
  if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
  if (!['validated', 'partially_paid'].includes(String(inv.status))) {
    throw AppError.badRequest('La facture doit être validée avant paiement');
  }

  const newAmountPaid = Number(inv.amountPaid) + data.amount;
  const newBalanceDue = Number(inv.totalTtc) - newAmountPaid;
  const newStatus = newBalanceDue <= 0 ? 'paid' : 'partially_paid';

  return prisma.$transaction(async (tx) => {
    const payment = await tx.supplierPayment.create({
      data: {
        supplierInvoiceId: id,
        supplierId: inv.supplierId,
        amount: data.amount,
        paymentDate: data.paymentDate,
        method: (payMethodMap[data.method] ?? 'virement') as any,
        reference: data.reference ?? undefined,
        bankAccountId: data.bankAccountId ?? undefined,
        notes: data.notes ?? undefined,
        createdById: userId,
      },
    });
    const updated = await tx.supplierInvoice.update({
      where: { id },
      data: { amountPaid: newAmountPaid, balanceDue: Math.max(0, newBalanceDue), status: newStatus as any },
    });
    await recordHistory(tx, id, newStatus, userId);
    return { updated, paymentId: payment.id };
  }).then(({ updated, paymentId }) => {
    void prisma.$transaction((tx) => accountingEngine.onSupplierPaymentMade(paymentId, tx));
    void eventBus.emit('supplier_invoice.paid', { supplierInvoiceId: id, amount: data.amount });
    return updated;
  });
}

export async function listSupplierPayments(invoiceId: string) {
  return prisma.supplierPayment.findMany({
    where: { supplierInvoiceId: invoiceId },
    orderBy: { paymentDate: 'asc' },
  });
}

export async function generatePdfResponse(id: string) {
  const inv = await prisma.supplierInvoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      supplier: true,
      lines: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!inv) throw AppError.notFound('Facture fournisseur introuvable');

  const settings = await prisma.companySettings.findFirst();
  const headerImageB64 = settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined;
  const footerImageB64 = settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined;

  const lines: DocumentLine[] = inv.lines.map(l => ({
    reference:    undefined,
    designation:  l.designation,
    description:  l.description ?? undefined,
    quantity:     Number(l.quantity),
    unit:         String(l.unit ?? 'pcs'),
    unitPriceHt:  Number(l.unitPriceHt),
    netHt:        Number(l.netHt),
    taxRate:      Number(l.taxRate),
    discountLabel: Number(l.discountValue) > 0 ? `${l.discountValue}%` : undefined,
  }));

  const html = buildDocumentHtml({
    type: 'Facture',
    number: inv.number,
    issueDate: new Date(inv.invoiceDate).toLocaleDateString('fr-FR'),
    dueDate: new Date(inv.dueDate).toLocaleDateString('fr-FR'),
    clientName: inv.supplier.name,
    clientStreet: inv.supplier.address ?? undefined,
    clientBP: inv.supplier.city ?? undefined,
    clientPhone: inv.supplier.phone ?? undefined,
    clientEmail: inv.supplier.email ?? undefined,
    clientTaxNumber: inv.supplier.taxNumber ?? undefined,
    clientRccm: inv.supplier.rccm ?? undefined,
    subject: `Facture Fournisseur — Réf. ${inv.supplierInvoiceNumber}`,
    lines,
    subtotalHt: Number(inv.totalHt),
    totalTax: Number(inv.totalTax),
    totalTtc: Number(inv.totalTtc),
    globalDiscountAmount: Number((inv as any).globalDiscountAmount) > 0
      ? Number((inv as any).globalDiscountAmount) : undefined,
    currency: (inv as any).currency ?? 'XAF',
    notes: inv.notes ?? undefined,
    paymentConditions: (inv as any).paymentConditions ?? undefined,
    headerImageB64,
    footerImageB64,
  });

  const buffer = await generatePdf(html);
  return { buffer, filename: `${inv.number.replace(/\//g, '-')}.pdf` };
}
