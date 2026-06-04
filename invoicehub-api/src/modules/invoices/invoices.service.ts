import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { APPROVAL_COMPLETED, type ApprovalCompletedEvent, type AutoExecResult } from '../../common/events/approval.events';
import { generateDocumentNumber, getDefaultOfficeId } from '../../lib/documentNumber';
import { generatePdf, buildDocumentHtml, imgToBase64, resolveDocumentAssets } from '../../lib/pdf';
import { DashboardCacheService } from '../../common/services/dashboard-cache.service';
import { computeLine, computeTotals } from '../../lib/document-math';
import { PaymentsService } from '../payments/payments.service';
import { ApprovalsService } from '../approvals/approvals.service';
import * as accountingEngine from '../../lib/accountingEngine';
import { broadcastNotification } from '../../lib/broadcast';
import { StockService } from '../stock/stock.service';
import type { EmailJobData, NotificationJobData } from '../../jobs/job-types';
import type { CreateInvoiceInput, UpdateInvoiceInput, ListInvoicesInput, CreateAvoirInput, ComputeInvoiceInput } from './invoices.schema';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: DashboardCacheService,
    private readonly emitter: EventEmitter2,
    private readonly payments: PaymentsService,
    private readonly approvals: ApprovalsService,
    private readonly stockSvc: StockService,
    @InjectQueue('email') private readonly emailQueue: Queue<EmailJobData>,
    @InjectQueue('notification') private readonly notifQueue: Queue<NotificationJobData>,
  ) {}

  async list(input: ListInvoicesInput) {
    const { page, limit, clientId, type, status, search, dateFrom, dateTo, overdue } = input;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: Prisma.InvoiceWhereInput = {
      deletedAt: null,
      ...(clientId && { clientId }),
      ...(type     && { type }),
      ...(dateFrom && { issueDate: { gte: dateFrom } }),
      ...(dateTo   && { issueDate: { lte: dateTo } }),
      ...(overdue
        ? { status: { in: ['issued', 'partially_paid'] as const }, dueDate: { lt: now } }
        : status
          ? { status }
          : {}),
      ...(search && {
        OR: [
          { number: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
          { client: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
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
    const now = new Date();
    const [byStatus, overdueTab] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.invoice.count({
        where: {
          deletedAt: null,
          status: { in: ['issued', 'partially_paid'] },
          dueDate: { lt: now },
        },
      }),
    ]);
    const data: Record<string, number> = {};
    for (const r of byStatus) data[r.status] = r._count._all;
    data['overdue_tab'] = overdueTab;
    return data;
  }

  async findById(id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        client: true,
        office: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        bankAccount: { select: { id: true, name: true, bankName: true, accountNumber: true, iban: true, swiftBic: true } },
        lines: {
          include: { product: { select: { reference: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        payments: { where: { deletedAt: null }, orderBy: { paymentDate: 'desc' } },
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!invoice) throw AppError.notFound('Facture introuvable');
    return invoice;
  }

  async create(input: CreateInvoiceInput, createdById: string) {
    const officeId = input.officeId ?? await getDefaultOfficeId(this.prisma);
    const number   = await generateDocumentNumber(this.prisma, officeId, 'invoice');

    if (input.parentInvoiceId) {
      const parentInvoice = await this.prisma.invoice.findFirst({
        where: { id: input.parentInvoiceId, deletedAt: null },
        select: { id: true, number: true, status: true },
      });
      if (!parentInvoice) {
        throw AppError.notFound(`La facture parente introuvable (id: ${input.parentInvoiceId})`);
      }
      if (parentInvoice.status === 'draft') {
        throw AppError.badRequest(`La facture parente ${parentInvoice.number} est en brouillon. Elle doit être émise avant de créer un acompte ou un solde.`);
      }
      if (parentInvoice.status === 'cancelled') {
        throw AppError.badRequest(`La facture parente ${parentInvoice.number} est annulée. Impossible de créer un acompte ou un solde sur une facture annulée.`);
      }
    }

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

    let acompteAmount = totals.totalTtc;
    if (input.type === 'acompte' && input.acomptePercentage) {
      acompteAmount = Number((totals.totalTtc * input.acomptePercentage / 100).toFixed(2));
    }

    let acompteAlreadyEngaged = 0;
    if (input.type === 'acompte' && input.parentInvoiceId) {
      const parentInvoice = await this.prisma.invoice.findFirst({
        where: { id: input.parentInvoiceId, type: 'acompte', deletedAt: null, status: { notIn: ['cancelled'] } },
        select: { amountDue: true },
      });
      const parentAmount = Number(parentInvoice?.amountDue ?? 0);

      const siblingAgg = await this.prisma.invoice.aggregate({
        where: {
          parentInvoiceId: input.parentInvoiceId,
          type: 'acompte',
          deletedAt: null,
          status: { notIn: ['cancelled'] },
        },
        _sum: { amountDue: true },
      });
      const siblingTotal = Number(siblingAgg._sum.amountDue ?? 0);
      acompteAlreadyEngaged = parentAmount + siblingTotal;

      if (acompteAlreadyEngaged + acompteAmount > totals.totalTtc) {
        throw AppError.badRequest(
          `Le montant cumulé des acomptes (${(acompteAlreadyEngaged + acompteAmount).toLocaleString('fr-FR')} XAF) dépasse le total du projet (${totals.totalTtc.toLocaleString('fr-FR')} XAF). Déjà engagé : ${acompteAlreadyEngaged.toLocaleString('fr-FR')} XAF.`,
        );
      }
    }

    let totalAcomptesDeducted = 0;
    if (input.type === 'solde' && input.parentInvoiceId) {
      const existingSolde = await this.prisma.invoice.findFirst({
        where: { parentInvoiceId: input.parentInvoiceId, type: 'solde', deletedAt: null, status: { notIn: ['cancelled'] } },
        select: { id: true, number: true },
      });
      if (existingSolde) {
        throw AppError.badRequest(`Une facture de solde existe déjà pour cet acompte : ${existingSolde.number}`);
      }

      const acomptesAgg = await this.prisma.payment.aggregate({
        where: {
          deletedAt: null,
          OR: [
            { invoiceId: input.parentInvoiceId },
            { invoice: { parentInvoiceId: input.parentInvoiceId, type: 'acompte', deletedAt: null } },
          ],
        },
        _sum: { amount: true },
      });
      totalAcomptesDeducted = Number(acomptesAgg._sum.amount ?? 0);
    }

    const amountDue = input.type === 'acompte'
      ? acompteAmount
      : Number((totals.totalTtc - totalAcomptesDeducted).toFixed(2));

    const created = await this.prisma.invoice.create({
      data: {
        number,
        officeId,
        type: input.type,
        clientId: input.clientId,
        createdById,
        assignedToId: input.assignedToId,
        proformaId: input.proformaId,
        parentInvoiceId: input.parentInvoiceId,
        creditedInvoiceId: input.creditedInvoiceId,
        issueDate: input.issueDate ?? new Date(),
        dueDate: input.dueDate,
        subject: input.subject,
        clientReference: input.clientReference,
        notes: input.notes,
        paymentConditions: input.paymentConditions,
        currency: input.currency,
        subtotalHt: totals.subtotalHt,
        globalDiscountType: input.globalDiscountType,
        globalDiscountValue: input.globalDiscountValue,
        globalDiscountAmount: totals.globalDiscountAmount,
        totalHt: totals.totalHt,
        totalTax: totals.totalTax,
        totalTtc: input.type === 'acompte' ? acompteAmount : totals.totalTtc,
        acomptePercentage: input.acomptePercentage,
        totalAcomptesDeducted: input.type === 'acompte' ? acompteAlreadyEngaged : totalAcomptesDeducted,
        amountDue,
        balanceDue: amountDue,
        bankAccountId: bankAccountId ?? undefined,
        escompteRate:     input.escompteRate     ?? null,
        escompteDeadline: input.escompteDeadline ?? null,
        escompteAmount: input.escompteRate
          ? Number(((input.type === 'acompte' ? acompteAmount : totals.totalTtc) * input.escompteRate / 100).toFixed(2))
          : 0,
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
      include: { lines: true, client: { select: { id: true, name: true, email: true, phone: true } } },
    });

    return created;
  }

  async update(id: string, input: UpdateInvoiceInput, userId: string) {
    const invoice = await this.findById(id);
    if (invoice.status !== 'draft') {
      throw AppError.badRequest('Seules les factures en brouillon peuvent être modifiées');
    }

    const updateData: Prisma.InvoiceUncheckedUpdateInput = {
      assignedToId: input.assignedToId,
      dueDate: input.dueDate,
      subject: input.subject,
      clientReference: input.clientReference,
      notes: input.notes,
      paymentConditions: input.paymentConditions,
      ...(input.bankAccountId !== undefined && { bankAccountId: input.bankAccountId }),
      ...(input.escompteRate !== undefined && (() => {
        // Recalcule escompteAmount immédiatement quand le taux change sans
        // modification de lignes (sinon escompteAmount reste à 0 et le bandeau
        // n'apparaît pas sur le PDF).
        const rate = input.escompteRate ?? 0;
        const base = Number((invoice as any).totalTtc ?? 0);
        const amount = rate > 0 ? Number((base * rate / 100).toFixed(2)) : 0;
        return {
          escompteRate:     input.escompteRate ?? null,
          escompteDeadline: input.escompteDeadline ?? null,
          escompteAmount:   amount,
        };
      })()),
    };

    if (input.lines) {
      const computedLines = input.lines.map(l => ({ ...l, ...computeLine(l) }));
      const totals = computeTotals(
        computedLines,
        input.globalDiscountType ?? invoice.globalDiscountType,
        Number(input.globalDiscountValue ?? invoice.globalDiscountValue),
      );
      const acomptePct = Number(invoice.acomptePercentage ?? 0);
      const finalTtc = (invoice.type === 'acompte' && acomptePct > 0)
        ? Number((totals.totalTtc * acomptePct / 100).toFixed(2))
        : totals.totalTtc;

      let finalAmountDue = finalTtc;
      if (invoice.type === 'solde' && invoice.parentInvoiceId) {
        const acomptesAgg = await this.prisma.payment.aggregate({
          where: {
            deletedAt: null,
            OR: [
              { invoiceId: invoice.parentInvoiceId },
              { invoice: { parentInvoiceId: invoice.parentInvoiceId, type: 'acompte', deletedAt: null } },
            ],
          },
          _sum: { amount: true },
        });
        const deducted = Number(acomptesAgg._sum.amount ?? 0);
        finalAmountDue = Number((totals.totalTtc - deducted).toFixed(2));
      }

      const escompteRate = Number(input.escompteRate ?? (invoice as any).escompteRate ?? 0);
      const newEscompteAmount = escompteRate > 0
        ? Number((finalTtc * escompteRate / 100).toFixed(2))
        : 0;

      Object.assign(updateData, {
        subtotalHt: totals.subtotalHt,
        globalDiscountType:   input.globalDiscountType  ?? invoice.globalDiscountType,
        globalDiscountValue:  input.globalDiscountValue ?? invoice.globalDiscountValue,
        globalDiscountAmount: totals.globalDiscountAmount,
        totalHt: totals.totalHt,
        totalTax: totals.totalTax,
        totalTtc: finalTtc,
        amountDue: finalAmountDue,
        balanceDue: finalAmountDue,
        escompteAmount: newEscompteAmount,
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

    return this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: { lines: true },
    });
  }

  async issue(id: string, userId: string) {
    const invoice = await this.findById(id);
    if (invoice.status !== 'draft') {
      throw AppError.badRequest('Seules les factures en brouillon peuvent être émises');
    }

    const pendingRequest = await this.approvals.getDocumentPendingRequest('invoice', id);
    if (pendingRequest) {
      // Ce n'est pas un refus d'accès (403) : la facture suit son workflow normal.
      // Code dédié → le frontend l'affiche comme une info, pas une erreur rouge.
      throw AppError.badRequest(
        `Cette facture est en attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps}).`,
        'APPROVAL_PENDING',
      );
    }
    const approvedRequest = await this.prisma.approvalRequest.findFirst({
      where: { documentId: id, documentType: 'invoice', status: 'approved' },
    });
    if (!approvedRequest) {
      const request = await this.approvals.requestApproval({
        documentType:   'invoice',
        documentId:     id,
        documentNumber: String(invoice.number ?? `FAC-${id.slice(0, 8)}`),
        document:       invoice as unknown as Record<string, unknown>,
        requestedById:  userId,
      });
      if (request) {
        await this.prisma.invoice.update({ where: { id }, data: { requiresApproval: true } });
        throw AppError.badRequest(
          'Cette facture a été soumise pour approbation. Elle sera émise après validation.',
          'APPROVAL_SUBMITTED',
        );
      }
    }

    const invoiceWithLines = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        lines: {
          include: { product: { select: { id: true, trackStock: true, stockQuantity: true, stockMinLevel: true } } },
        },
      },
    });

    // ── Sortie de stock : lignes suivies ───────────────────────────────────────
    // Pré-contrôle de disponibilité AVANT d'émettre (règle métier : on ne vend
    // pas ce qu'on n'a pas en stock), avec un message clair par ligne.
    const trackedLines = (invoiceWithLines?.lines ?? [])
      .filter((l) => l.product?.trackStock && l.productId);
    for (const line of trackedLines) {
      const available = Number(line.product?.stockQuantity ?? 0);
      if (available < Number(line.quantity)) {
        throw AppError.badRequest(
          `Stock insuffisant pour « ${line.designation} » : disponible ${available}, demandé ${Number(line.quantity)}`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.invoice.update({
        where: { id },
        data: {
          status: 'issued',
          lastSentAt: new Date(),
          draftReminderLevel: 0,
          statusHistory: {
            create: { changedById: userId, previousStatus: 'draft', newStatus: 'issued' },
          },
        },
      });
    });

    // Mouvements de stock dans leur PROPRE transaction : une erreur (compte
    // comptable manquant, etc.) ne doit pas annuler l'émission de la facture.
    // Exécutés hors transaction → l'alerte « stock bas » se déclenche aussi.
    for (const line of trackedLines) {
      this.stockSvc.createStockMovement({
        productId:   line.productId!,
        quantity:    Number(line.quantity),
        type:        'sale',
        sourceType:  'invoice',
        sourceId:    id,
        sourceLabel: `FAC ${invoice.number}`,
        createdById: userId,
      }).catch((e) => console.error('[invoice.issue] mouvement stock échoué, ligne', line.id, e?.message));
    }

    void broadcastNotification(this.prisma as any, this.notifQueue, {
      type:    'invoice_issued',
      title:   `Facture émise : ${invoice.number}`,
      message: `La facture ${invoice.number} pour ${(invoice as any).client?.name} — ${Number(invoice.totalTtc).toLocaleString('fr-FR')} XAF — a été émise. Échéance : ${new Date(invoice.dueDate).toLocaleDateString('fr-FR')}.`,
      data:    {
        invoiceId:     invoice.id,
        invoiceNumber: invoice.number,
        clientName:    (invoice as any).client?.name ?? '',
        totalTtc:      Number(invoice.totalTtc).toLocaleString('fr-FR'),
        dueDate:       new Date(invoice.dueDate).toLocaleDateString('fr-FR'),
        invoiceLink:   `${process.env.APP_URL ?? 'http://localhost:3001'}/invoices/${invoice.id}`,
        issuedBy:      userId,
      },
    }, { excludeUserId: userId });

    void this.prisma.$transaction((tx) => accountingEngine.onInvoiceIssued(id, tx));
    void this.emitter.emit('invoice.issued', { invoiceId: id, amount: Number(invoice.totalTtc), clientId: invoice.clientId, userId });
    await this.cache.invalidate();
    return updated;
  }

  /**
   * Auto-émission après approbation finale. On appelle `issue()` avec le
   * `requestedById` (le maker) → l'émission, l'historique de statut, le stock et
   * l'écriture comptable lui sont imputés (séparation des tâches). `issue()`
   * trouve l'approbation déjà accordée et déroule normalement.
   */
  @OnEvent(APPROVAL_COMPLETED)
  async onApprovalCompleted(payload: ApprovalCompletedEvent): Promise<AutoExecResult | void> {
    if (payload.documentType !== 'invoice') return;
    try {
      await this.issue(payload.documentId, payload.requestedById);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof AppError ? e.message : "Erreur lors de l'émission automatique" };
    }
  }

  async cancel(id: string, userId: string, reason?: string) {
    const invoice = await this.findById(id);
    if (!['issued', 'partially_paid', 'overdue'].includes(invoice.status)) {
      throw AppError.badRequest('Seules les factures émises peuvent être annulées');
    }

    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.invoice.update({
        where: { id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledById: userId,
          cancelReason: reason,
          statusHistory: {
            create: { changedById: userId, previousStatus: invoice.status, newStatus: 'cancelled', reason },
          },
        },
      });

      const avoirNumber = await generateDocumentNumber(tx as any, invoice.officeId, 'invoice');

      const avoirCreated = await tx.invoice.create({
        data: {
          number: avoirNumber,
          officeId: invoice.officeId,
          type: 'avoir',
          clientId: invoice.clientId,
          createdById: userId,
          creditedInvoiceId: invoice.id,
          issueDate: new Date(),
          dueDate: new Date(),
          subject: `Avoir sur facture ${invoice.number}`,
          notes: reason,
          currency: invoice.currency,
          subtotalHt: invoice.subtotalHt,
          globalDiscountType: invoice.globalDiscountType,
          globalDiscountValue: invoice.globalDiscountValue,
          globalDiscountAmount: invoice.globalDiscountAmount,
          totalHt: invoice.totalHt,
          totalTax: invoice.totalTax,
          totalTtc: invoice.totalTtc,
          amountDue: 0,
          balanceDue: 0,
          status: 'issued',
          lines: {
            create: invoice.lines.map(l => ({
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
              hideDetails: (l as any).hideDetails ?? false,
            })),
          },
          statusHistory: {
            create: { changedById: userId, newStatus: 'issued' },
          },
        },
      });

      return { cancelled, avoirId: avoirCreated.id, avoirNumber: avoirCreated.number };
    }).then(async ({ cancelled, avoirId, avoirNumber }) => {
      void broadcastNotification(this.prisma as any, this.notifQueue, {
        type:    'system',
        title:   `Facture annulée : ${invoice.number}`,
        message: `La facture ${invoice.number} pour ${(invoice as any).client?.name} a été annulée. Avoir ${avoirNumber} généré automatiquement.`,
        data:    { invoiceId: invoice.id, invoiceNumber: invoice.number, avoirId, avoirNumber, documentLink: `/invoices/${invoice.id}` },
      }, { excludeUserId: userId });
      void this.emitter.emit('invoice.cancelled', { invoiceId: invoice.id, userId });
      this.prisma.$transaction((tx) => accountingEngine.onInvoiceCancelled(id, tx)).catch(e =>
        console.error('[accounting] onInvoiceCancelled invoice', id, e)
      );
      await this.cache.invalidate();
      return { ...cancelled, avoirId, avoirNumber };
    });
  }

  async createAvoir(id: string, input: CreateAvoirInput, userId: string) {
    const invoice = await this.findById(id);

    if (!['standard', 'solde', 'acompte'].includes(invoice.type)) {
      throw AppError.badRequest('Un avoir ne peut être créé que depuis une facture de type standard, acompte ou solde');
    }

    if (!['issued', 'partially_paid', 'paid', 'overdue'].includes(invoice.status)) {
      throw AppError.badRequest('Un avoir ne peut être créé que sur une facture émise, partiellement payée, payée ou en retard');
    }

    const avoir = await this.prisma.$transaction(async (tx) => {
      const avoirNumber = await generateDocumentNumber(tx as any, invoice.officeId, 'invoice');

      let avoirLines: Array<{
        product?: { connect: { id: string } };
        sortOrder: number;
        designation: string;
        description?: string | null;
        unit: string;
        quantity: number;
        unitPriceHt: number;
        discountType: string;
        discountValue: number;
        discountAmount: number;
        taxRate: number;
        subtotalHt: number;
        netHt: number;
        taxAmount: number;
        totalTtc: number;
      }>;

      if (input.lines && input.lines.length > 0) {
        const computedLines = input.lines.map(l => ({ ...l, ...computeLine(l) }));
        avoirLines = computedLines.map(l => ({
          ...(l.productId ? { product: { connect: { id: l.productId } } } : {}),
          sortOrder: l.sortOrder,
          designation: l.designation,
          description: l.description ?? null,
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
        }));
      } else {
        avoirLines = invoice.lines.map(l => ({
          ...(l.productId ? { product: { connect: { id: l.productId } } } : {}),
          sortOrder: l.sortOrder,
          designation: l.designation,
          description: l.description,
          unit: l.unit,
          quantity: Number(l.quantity),
          unitPriceHt: Number(l.unitPriceHt),
          discountType: l.discountType,
          discountValue: Number(l.discountValue),
          discountAmount: Number(l.discountAmount),
          taxRate: Number(l.taxRate),
          subtotalHt: Number(l.subtotalHt),
          netHt: Number(l.netHt),
          taxAmount: Number(l.taxAmount),
          totalTtc: Number(l.totalTtc),
        }));
      }

      const avoirSubtotalHt = Number(avoirLines.reduce((s, l) => s + l.subtotalHt, 0).toFixed(2));
      const totalTax        = Number(avoirLines.reduce((s, l) => s + l.taxAmount,  0).toFixed(2));
      const totalTtc        = Number(avoirLines.reduce((s, l) => s + l.totalTtc,   0).toFixed(2));

      const created = await tx.invoice.create({
        data: {
          number: avoirNumber,
          officeId: invoice.officeId,
          type: 'avoir',
          clientId: invoice.clientId,
          createdById: userId,
          creditedInvoiceId: invoice.id,
          issueDate: new Date(),
          dueDate: input.dueDate ?? new Date(),
          subject: `Avoir sur facture ${invoice.number}`,
          notes: input.notes ?? input.reason,
          currency: invoice.currency,
          subtotalHt: avoirSubtotalHt,
          globalDiscountType: 'none',
          globalDiscountValue: 0,
          globalDiscountAmount: 0,
          totalHt: avoirSubtotalHt,
          totalTax,
          totalTtc,
          amountDue: 0,
          balanceDue: 0,
          status: 'issued',
          lines: {
            create: avoirLines as Parameters<typeof this.prisma.invoiceLine.create>[0]['data'][],
          },
          statusHistory: {
            create: { changedById: userId, newStatus: 'issued' },
          },
        },
        include: { lines: true, client: true },
      });

      const newBalanceDue = Math.max(0, Number(invoice.balanceDue) - totalTtc);
      const newStatus = newBalanceDue <= 0 && invoice.status !== 'paid'
        ? 'paid'
        : invoice.status;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          balanceDue: newBalanceDue,
          ...(newStatus !== invoice.status && {
            status: newStatus,
            statusHistory: {
              create: { changedById: userId, previousStatus: invoice.status, newStatus },
            },
          }),
        },
      });

      // Retour stock pour les lignes produit tracées (silencieux — ne bloque pas l'avoir)
      const productIds = created.lines.map(l => l.productId).filter((pid): pid is string => !!pid);
      if (productIds.length > 0) {
        const trackedProducts = await tx.product.findMany({
          where:  { id: { in: productIds }, trackStock: true, deletedAt: null },
          select: { id: true },
        });
        const trackedSet = new Set(trackedProducts.map(p => p.id));
        for (const line of created.lines) {
          if (!line.productId || !trackedSet.has(line.productId)) continue;
          try {
            await this.stockSvc.createStockMovement({
              productId:   line.productId,
              quantity:    Number(line.quantity),
              type:        'return_customer',
              sourceType:  'invoice',
              sourceId:    created.id,
              sourceLabel: `AVOIR ${avoirNumber}`,
              createdById: userId,
            }, tx as any);
          } catch {
            // Silencieux
          }
        }
      }

      return created;
    });

    void broadcastNotification(this.prisma as any, this.notifQueue, {
      type:    'system',
      title:   `Avoir créé : ${avoir.number}`,
      message: `Un avoir ${avoir.number} a été créé sur la facture ${invoice.number} pour ${(invoice as any).client?.name}. Motif : ${input.reason}`,
      data:    { invoiceId: invoice.id, avoirId: avoir.id, avoirNumber: avoir.number, documentLink: `/invoices/${avoir.id}` },
    });

    this.prisma.$transaction((tx) => accountingEngine.onInvoiceCancelled(avoir.id, tx)).catch(e =>
      console.error('[accounting] onInvoiceCancelled avoir', avoir.id, e)
    );
    await this.cache.invalidate();
    return avoir;
  }

  async generatePdfResponse(id: string) {
    const [invoice, settings] = await Promise.all([
      this.findById(id),
      this.prisma.companySettings.findFirst({ select: { headerImagePath: true, footerImagePath: true, stampPath: true, footerSafeZonePx: true, email: true } }),
    ]);

    const isAcompte = invoice.type === 'acompte';
    const isSolde   = invoice.type === 'solde';

    const totalHt  = Number(invoice.totalHt);
    const totalTax = Number(invoice.totalTax);
    const totalTtc = Number(invoice.totalTtc);
    const pct      = isAcompte ? Number(invoice.acomptePercentage ?? 0) : 0;

    const acompteHt  = isAcompte ? Number((totalHt  * pct / 100).toFixed(2)) : undefined;
    const acompteTax = isAcompte ? Number((totalTax * pct / 100).toFixed(2)) : undefined;

    const soldeTtc = isSolde ? Number(invoice.amountDue) : undefined;
    const soldeHt  = (isSolde && soldeTtc !== undefined && totalTtc > 0)
      ? Number((soldeTtc * totalHt / totalTtc).toFixed(2))
      : undefined;
    const soldeTax = (isSolde && soldeTtc !== undefined && soldeHt !== undefined)
      ? Number((soldeTtc - soldeHt).toFixed(2))
      : undefined;

    const displayTtc = isSolde ? (soldeTtc ?? totalTtc) : totalTtc;

    const clientBP = invoice.client.postalBox
      ? `${invoice.client.postalBox}${invoice.client.city ? ` ${invoice.client.city}-${invoice.client.country}` : ''}`
      : (invoice.client.city ? `${invoice.client.city}-${invoice.client.country}` : undefined);

    const docType =
      invoice.type === 'avoir'   ? 'Avoir'           :
      invoice.type === 'acompte' ? 'Facture Acompte' :
      invoice.type === 'solde'   ? 'Facture Solde'   : 'Facture';

    const { headerImageB64, footerImageB64, sealImageB64 } = resolveDocumentAssets(settings ?? null);

    const html = buildDocumentHtml({
      type: docType,
      number:    invoice.number,
      issueDate: new Date(invoice.issueDate).toLocaleDateString('fr-FR'),
      dueDate:   new Date(invoice.dueDate).toLocaleDateString('fr-FR'),

      clientName:        invoice.client.name,
      clientStreet:      invoice.client.address  ?? undefined,
      clientBP,
      clientPhone:       invoice.client.phone     ?? undefined,
      clientEmail:       invoice.client.email     ?? undefined,
      clientTaxNumber:   invoice.client.taxNumber ?? undefined,
      clientRccm:        invoice.client.rccm      ?? undefined,
      btsBankName:    invoice.bankAccount?.bankName     ?? undefined,
      btsBankAccount: invoice.bankAccount?.accountNumber ?? undefined,
      btsBankIban:    invoice.bankAccount?.iban          ?? undefined,
      btsBankSwift:   invoice.bankAccount?.swiftBic      ?? undefined,
      contactPerson:     settings?.email ?? undefined,
      escompteRate:     (invoice as any).escompteRate     != null ? Number((invoice as any).escompteRate)     : undefined,
      escompteDeadline: (invoice as any).escompteDeadline != null ? new Date((invoice as any).escompteDeadline).toLocaleDateString('fr-FR') : undefined,
      escompteAmount:   (invoice as any).escompteAmount   != null ? Number((invoice as any).escompteAmount)   : undefined,

      subject:  invoice.subject  ?? undefined,
      currency: invoice.currency,

      lines: invoice.lines.map(l => {
        const discountAmt = Number(l.discountAmount);
        return {
          reference:   l.product?.reference ?? undefined,
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

      subtotalHt: totalHt,
      totalTax,
      totalTtc: displayTtc,

      subtotalBeforeDiscountHt: Number(invoice.subtotalHt),
      globalDiscountAmount: Number(invoice.globalDiscountAmount) || undefined,
      globalDiscountLabel: Number(invoice.globalDiscountAmount) > 0
        ? invoice.globalDiscountType === 'percentage'
          ? `REMISE ${Number(invoice.globalDiscountValue).toFixed(2)}%`
          : 'REMISE'
        : undefined,

      acomptePercentage: isAcompte ? pct        : undefined,
      acompteHt,
      acompteTax,
      soldeHt,
      soldeTax,

      paymentConditions: invoice.paymentConditions ?? undefined,
      notes:             invoice.notes             ?? undefined,
      headerImageB64,
      footerImageB64,
      sealImageB64,
    });

    const footerSafeZonePx = settings?.footerSafeZonePx || undefined;
    const pdfBuffer = await generatePdf(html, footerSafeZonePx, settings);

    await this.prisma.invoice.update({ where: { id }, data: { pdfGeneratedAt: new Date() } });

    return { buffer: pdfBuffer, filename: `${invoice.number.replace(/\//g, '-')}.pdf` };
  }

  async compute(input: ComputeInvoiceInput) {
    const { clientId, lines, globalDiscountType, globalDiscountValue, clientReference } = input;

    const computedLines = lines.map(l => ({ ...l, ...computeLine(l as any) }));
    const totals = computeTotals(computedLines, globalDiscountType, globalDiscountValue);

    const [unpaidAgg, avgAgg, similarInvoice, duplicateRef] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          clientId, deletedAt: null,
          status: { in: ['issued', 'partially_paid', 'overdue'] as any[] },
        },
        _sum: { balanceDue: true },
        _count: true,
      }),

      this.prisma.invoice.aggregate({
        where: {
          clientId, deletedAt: null,
          status: { notIn: ['cancelled', 'draft'] as any[] },
          createdAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
        },
        _avg: { totalTtc: true },
      }),

      this.prisma.invoice.findFirst({
        where: {
          clientId, deletedAt: null,
          status: { notIn: ['cancelled'] as any[] },
          createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
          totalTtc: {
            gte: totals.totalTtc * 0.85,
            lte: totals.totalTtc * 1.15,
          },
        },
        select: { id: true, number: true, totalTtc: true, createdAt: true },
      }),

      clientReference
        ? this.prisma.invoice.findFirst({
            where: { clientId, deletedAt: null, clientReference },
            select: { id: true, number: true },
          })
        : Promise.resolve(null),
    ]);

    const warnings: Array<{ code: string; severity: 'info' | 'warning' | 'error'; message: string; data?: unknown }> = [];

    const unpaidBalance = Number(unpaidAgg._sum.balanceDue ?? 0);
    if (unpaidBalance > 0) {
      warnings.push({
        code: 'CLIENT_UNPAID_BALANCE',
        severity: unpaidBalance > totals.totalTtc ? 'error' : 'warning',
        message: `Ce client a ${unpaidAgg._count} facture(s) impayée(s) pour un solde de ${unpaidBalance.toLocaleString('fr-FR')} XAF`,
        data: { balance: unpaidBalance, count: unpaidAgg._count },
      });
    }

    const avgTtc = Number(avgAgg._avg.totalTtc ?? 0);
    if (avgTtc > 0 && totals.totalTtc > avgTtc * 3) {
      warnings.push({
        code: 'UNUSUAL_AMOUNT',
        severity: 'warning',
        message: `Montant ${Math.round(totals.totalTtc / avgTtc)}× supérieur à la moyenne de ce client (${Math.round(avgTtc).toLocaleString('fr-FR')} XAF)`,
        data: { average: Math.round(avgTtc), current: totals.totalTtc },
      });
    }

    if (similarInvoice) {
      warnings.push({
        code: 'DUPLICATE_RISK',
        severity: 'warning',
        message: `Facture similaire déjà existante : ${similarInvoice.number} — ${Number(similarInvoice.totalTtc).toLocaleString('fr-FR')} XAF (créée il y a moins de 14 jours)`,
        data: { invoiceId: similarInvoice.id, invoiceNumber: similarInvoice.number },
      });
    }

    if (duplicateRef) {
      warnings.push({
        code: 'DUPLICATE_CLIENT_REFERENCE',
        severity: 'error',
        message: `Le numéro de bon de commande "${clientReference}" a déjà été utilisé sur la facture ${duplicateRef.number}`,
        data: { invoiceId: duplicateRef.id, invoiceNumber: duplicateRef.number },
      });
    }

    return {
      totals: {
        subtotalHt:           totals.subtotalHt,
        globalDiscountAmount: totals.globalDiscountAmount,
        totalHt:              totals.totalHt,
        totalTax:             totals.totalTax,
        totalTtc:             totals.totalTtc,
      },
      lines: computedLines.map(l => ({
        quantity: l.quantity, unitPriceHt: l.unitPriceHt,
        subtotalHt: l.subtotalHt, discountAmount: l.discountAmount,
        netHt: l.netHt, taxAmount: l.taxAmount, totalTtc: l.totalTtc,
      })),
      warnings,
      hasErrors:   warnings.some(w => w.severity === 'error'),
      hasWarnings: warnings.some(w => w.severity === 'warning'),
    };
  }

  async soldePrefill(acompteId: string) {
    const acompte = await this.prisma.invoice.findFirst({
      where: { id: acompteId, deletedAt: null },
      include: {
        client: true,
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!acompte) throw AppError.notFound('Facture introuvable');
    if (acompte.type !== 'acompte') throw AppError.badRequest('Cette facture n\'est pas une facture d\'acompte');

    const rootId = acompte.parentInvoiceId ?? acompte.id;

    const allAcomptes = await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        type: 'acompte',
        OR: [
          { id: rootId },
          { parentInvoiceId: rootId },
        ],
      },
      include: {
        payments: { where: { deletedAt: null }, select: { amount: true, paymentDate: true, method: true } },
      },
      orderBy: { issueDate: 'asc' },
    });

    const existingSolde = await this.prisma.invoice.findFirst({
      where: { parentInvoiceId: rootId, type: 'solde', deletedAt: null, status: { notIn: ['cancelled'] } },
      select: { id: true, number: true },
    });
    if (existingSolde) throw AppError.badRequest(`Une facture de solde existe déjà : ${existingSolde.number}`);

    const totalAcomptesEncaisses = allAcomptes.reduce((sum, a) => {
      return sum + a.payments.reduce((s, p) => s + Number(p.amount), 0);
    }, 0);

    const fullTtc   = Number(acompte.totalTtc);
    const soldeTtc  = Number((fullTtc - totalAcomptesEncaisses).toFixed(2));

    const lines = acompte.lines.map(l => ({
      sortOrder:    l.sortOrder,
      productId:    l.productId ?? undefined,
      designation:  l.designation,
      description:  l.description ?? undefined,
      unit:         l.unit,
      quantity:     Number(l.quantity),
      unitPriceHt:  Number(l.unitPriceHt),
      discountType: l.discountType,
      discountValue:Number(l.discountValue),
      taxRate:      Number(l.taxRate),
    }));

    return {
      prefill: {
        type:               'solde' as const,
        clientId:           acompte.clientId,
        parentInvoiceId:    rootId,
        subject:            acompte.subject,
        notes:              acompte.notes ?? undefined,
        paymentConditions:  acompte.paymentConditions ?? undefined,
        currency:           acompte.currency,
        globalDiscountType: acompte.globalDiscountType,
        globalDiscountValue:Number(acompte.globalDiscountValue),
        lines,
      },
      summary: {
        acomptes: allAcomptes.map(a => ({
          id:          a.id,
          number:      a.number,
          status:      a.status,
          totalTtc:    Number(a.totalTtc),
          amountPaid:  Number(a.amountPaid),
          balanceDue:  Number(a.balanceDue),
        })),
        totalAcomptesEncaisses: Number(totalAcomptesEncaisses.toFixed(2)),
        fullTtc,
        soldeTtc,
      },
    };
  }

  async duplicate(id: string, userId: string) {
    const original = await this.findById(id);
    const company = await this.prisma.companySettings.findFirst();
    const dueDays = company?.defaultInvoiceDueDays ?? 30;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);

    const number = await generateDocumentNumber(this.prisma, original.officeId, 'invoice');

    return this.prisma.invoice.create({
      data: {
        number,
        officeId: original.officeId,
        type: original.type === 'avoir' ? 'standard' : original.type,
        clientId: original.clientId,
        createdById: userId,
        issueDate: new Date(),
        dueDate,
        subject: original.subject,
        notes: original.notes,
        paymentConditions: original.paymentConditions,
        currency: original.currency,
        globalDiscountType: original.globalDiscountType,
        globalDiscountValue: original.globalDiscountValue,
        globalDiscountAmount: original.globalDiscountAmount,
        subtotalHt: original.subtotalHt,
        totalHt: original.totalHt,
        totalTax: original.totalTax,
        totalTtc: original.totalTtc,
        amountDue: original.type === 'solde' ? original.amountDue : original.totalTtc,
        balanceDue: original.type === 'solde' ? original.amountDue : original.totalTtc,
        acomptePercentage: original.acomptePercentage,
        totalAcomptesDeducted: original.type === 'solde' ? original.totalAcomptesDeducted : 0,
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
    const invoice = await this.findById(id);
    if (invoice.status !== 'draft') {
      throw AppError.badRequest('Seules les factures en brouillon peuvent être supprimées');
    }
    await this.prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async getHistory(id: string) {
    return this.prisma.auditLog.findMany({
      where: {
        entityId:   id,
        entityType: { in: ['invoice', 'payment'] },
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getPaymentPrediction(invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where:  { id: invoiceId, deletedAt: null },
      select: { id: true, number: true, dueDate: true, clientId: true, status: true, balanceDue: true },
    });
    if (!invoice) throw AppError.notFound('Facture introuvable');

    if (['paid', 'cancelled'].includes(invoice.status)) {
      return { predictedDate: null, basis: invoice.status, avgDaysLate: null, confidence: null };
    }

    type BehaviorRow = {
      avg_days_late: number | null;
      sample_count:  bigint;
    };

    const [behaviorRaw] = await this.prisma.$queryRaw<BehaviorRow[]>`
      SELECT
        AVG((pay.payment_date::date - inv.due_date::date)) AS avg_days_late,
        COUNT(*) AS sample_count
      FROM payments pay
      JOIN invoices inv ON inv.id = pay.invoice_id
      WHERE inv.client_id = ${invoice.clientId}::uuid
        AND inv.deleted_at IS NULL
        AND pay.deleted_at IS NULL
    `;

    const sampleCount = Number(behaviorRaw?.sample_count ?? 0);
    const avgDaysLate = behaviorRaw?.avg_days_late !== null && sampleCount > 0
      ? Math.round(Number(behaviorRaw.avg_days_late))
      : null;

    const dueDate = new Date(invoice.dueDate);

    if (avgDaysLate === null) {
      return {
        predictedDate: dueDate.toISOString().split('T')[0],
        basis: 'due-date',
        avgDaysLate: null,
        confidence: null,
        sampleCount: 0,
      };
    }

    const predicted = new Date(dueDate);
    predicted.setDate(predicted.getDate() + avgDaysLate);

    const confidence = sampleCount >= 20 ? 'high' : sampleCount >= 5 ? 'medium' : 'low';

    return {
      predictedDate: predicted.toISOString().split('T')[0],
      basis: 'historical',
      avgDaysLate,
      confidence,
      sampleCount,
      dueDate: dueDate.toISOString().split('T')[0],
    };
  }

  async quickConfirmPayment(invoiceId: string, userId: string) {
    const inv = await this.prisma.invoice.findFirst({
      where:  { id: invoiceId, deletedAt: null },
      select: { balanceDue: true, number: true },
    });
    if (!inv) throw AppError.notFound('Facture introuvable');
    const balanceDue = Number(inv.balanceDue);
    if (balanceDue <= 0) throw AppError.badRequest('Solde déjà nul');

    return this.payments.create(invoiceId, {
      amount:      balanceDue,
      method:      'virement',
      reference:   `Confirmé via notification — ${inv.number}`,
      paymentDate: new Date(),
    }, userId);
  }
}
