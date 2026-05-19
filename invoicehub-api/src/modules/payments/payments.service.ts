import * as path from 'path';
import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { DashboardCacheService } from '../../common/services/dashboard-cache.service';
import { EventsGateway } from '../../gateway/events.gateway';
import { generatePdf, buildReceiptHtml, imgToBase64 } from '../../lib/pdf';
import * as accountingEngine from '../../lib/accountingEngine';
import type { NotificationJobData } from '../../jobs/job-types';
import type { CreatePaymentInput, ListPaymentsInput } from './payments.schema';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: DashboardCacheService,
    private readonly events: EventsGateway,
    private readonly emitter: EventEmitter2,
    @InjectQueue('notification') private readonly notifQueue: Queue<NotificationJobData>,
  ) {}

  async list(input: ListPaymentsInput) {
    const { page, limit, invoiceId, method, dateFrom, dateTo, reconciled } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {
      deletedAt: null,
      ...(invoiceId && { invoiceId }),
      ...(method    && { method }),
      ...(dateFrom  && { paymentDate: { gte: dateFrom } }),
      ...(dateTo    && { paymentDate: { lte: dateTo } }),
      ...(reconciled === 'true'  && { reconciledAt: { not: null } }),
      ...(reconciled === 'false' && { reconciledAt: null }),
    };

    const [total, data] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          invoice:      { select: { id: true, number: true, client: { select: { name: true } } } },
          createdBy:    { select: { id: true, firstName: true, lastName: true } },
          bankAccount:  { select: { id: true, name: true, accountingAccount: true } },
          reconciledBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { paymentDate: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(invoiceId: string, input: CreatePaymentInput, createdById: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      include: { client: { select: { accountingAccount: true, name: true } } },
    });

    if (!invoice) throw AppError.notFound('Facture introuvable');

    if (!['issued', 'partially_paid', 'overdue'].includes(invoice.status)) {
      throw AppError.badRequest('Impossible d\'enregistrer un paiement sur cette facture');
    }

    if (input.amount <= 0) {
      throw AppError.badRequest('Le montant du paiement doit être supérieur à zéro');
    }

    const balanceDue = Number(invoice.balanceDue);
    if (balanceDue <= 0) {
      throw AppError.badRequest('Cette facture est déjà entièrement réglée');
    }

    // ── Logique escompte de règlement ────────────────────────────────────────
    const paymentDate      = new Date(input.paymentDate);
    const escompteDeadline = (invoice as any).escompteDeadline ? new Date((invoice as any).escompteDeadline) : null;
    const escompteEligible =
      (invoice as any).escompteRate !== null &&
      (invoice as any).escompteDeadline !== null &&
      escompteDeadline !== null &&
      paymentDate <= escompteDeadline;

    let escompteApplied = false;
    let escompteAmount  = 0;

    if (escompteEligible && input.applyEscompte) {
      // Vérifier qu'aucun paiement précédent n'a déjà appliqué l'escompte
      const alreadyApplied = await this.prisma.payment.findFirst({
        where: { invoiceId, deletedAt: null, escompteApplied: true as any },
      });
      if (alreadyApplied) {
        throw AppError.badRequest('L\'escompte de règlement a déjà été appliqué sur un paiement précédent de cette facture');
      }
      escompteApplied = true;
      escompteAmount  = Number((invoice as any).escompteAmount);
    }

    // Avec escompte, le montant reçu peut être inférieur au solde dû
    // (le solde est couvert par paiement + escompte)
    const totalCovered = input.amount + escompteAmount;
    if (totalCovered > balanceDue + 0.01) {
      throw AppError.badRequest(
        `Le paiement (${input.amount.toLocaleString('fr-FR')} XAF) dépasse le solde dû (${balanceDue.toLocaleString('fr-FR')} XAF)`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          paymentDate:     input.paymentDate,
          amount:          input.amount,
          method:          input.method,
          reference:       input.reference,
          notes:           input.notes,
          bankAccountId:   input.bankAccountId,
          attachmentPath:  input.attachmentPath,
          escompteApplied: escompteApplied as any,
          escompteAmount:  escompteAmount as any,
          createdById,
        },
      } as any);

      // amountPaid = paiements précédents + montant reçu + escompte accordé
      const newAmountPaid = Number(invoice.amountPaid) + input.amount + escompteAmount;
      const newBalanceDue = Number(invoice.amountDue) - newAmountPaid;
      const isPaid        = newBalanceDue <= 0.01;

      const newStatus = isPaid
        ? 'paid'
        : invoice.status === 'overdue'
        ? 'overdue'
        : 'partially_paid';

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: Math.max(0, newBalanceDue),
          status: newStatus,
          ...(newStatus === 'paid' && { reminderEscalationLevel: 0 }),
          ...(newStatus !== invoice.status && {
            statusHistory: {
              create: {
                changedById: createdById,
                previousStatus: invoice.status,
                newStatus,
              },
            },
          }),
        },
      });

      // Écriture comptable escompte accordé (Dr 673 / Cr 411)
      if (escompteApplied && escompteAmount > 0) {
        const clientAccount = (invoice.client as any)?.accountingAccount ?? '411000';
        await accountingEngine.onEscompteAccorde({
          paymentId:      payment.id,
          invoiceId,
          clientAccount,
          escompteAmount,
          invoiceNumber:  invoice.number,
          clientName:     (invoice.client as any)?.name ?? '',
          paymentDate,
        }, tx);
      }

      return payment;
    }).then(async (payment) => {
      const paidSoFar = Number(invoice.amountPaid) + input.amount + escompteAmount;
      const remaining = Number(invoice.amountDue) - paidSoFar;
      const fullyPaid = remaining <= 0.01;

      const escompteMsg = escompteApplied
        ? ` (escompte de ${escompteAmount.toLocaleString('fr-FR')} XAF accordé)`
        : '';

      this.events.server.emit('notification', {
        type: fullyPaid ? 'invoice_paid' : 'payment_registered',
        title: fullyPaid ? `Facture payée : ${invoice.number}` : `Paiement reçu : ${invoice.number}`,
        message: fullyPaid
          ? `La facture ${invoice.number} est entièrement réglée${escompteMsg}.`
          : `Un paiement de ${input.amount.toLocaleString('fr-FR')} XAF a été enregistré sur la facture ${invoice.number}${escompteMsg}.`,
        data: { invoiceId: invoice.id, invoiceNumber: invoice.number, amount: input.amount },
      });

      void this.prisma.$transaction((tx) => accountingEngine.onPaymentReceived(payment.id, tx));
      if (fullyPaid) {
        void this.emitter.emit('invoice.paid', { invoiceId: invoice.id, paymentId: payment.id });
      }
      await this.cache.invalidate();
      return payment;
    });
  }

  async softDelete(id: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
      include: { invoice: true },
    });

    if (!payment) throw AppError.notFound('Paiement introuvable');

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      const remainingPayments = await tx.payment.aggregate({
        where: { invoiceId: payment.invoiceId, deletedAt: null },
        _sum: { amount: true },
      });

      const newAmountPaid = Number(remainingPayments._sum.amount ?? 0);
      const newBalanceDue = Number(payment.invoice.amountDue) - newAmountPaid;

      let newStatus = payment.invoice.status;
      if (newAmountPaid === 0)    newStatus = 'issued';
      else if (newBalanceDue > 0) newStatus = 'partially_paid';

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: Math.max(0, newBalanceDue),
          status: newStatus,
        },
      });

      await accountingEngine.onPaymentDeleted(id, tx);
    });

    await this.cache.invalidate();
  }

  async uploadAttachment(id: string, filePath: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
      select: { attachmentPath: true },
    });
    if (!payment) throw AppError.notFound('Paiement introuvable');

    if (payment.attachmentPath && fs.existsSync(payment.attachmentPath)) {
      fs.unlinkSync(payment.attachmentPath);
    }

    await this.prisma.payment.update({ where: { id }, data: { attachmentPath: filePath } });
  }

  async getAttachment(id: string): Promise<{ filePath: string; filename: string }> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
      select: { attachmentPath: true, reference: true },
    });
    if (!payment) throw AppError.notFound('Paiement introuvable');
    if (!payment.attachmentPath) throw AppError.notFound('Aucun justificatif attaché à ce paiement');
    if (!fs.existsSync(payment.attachmentPath)) throw AppError.notFound('Fichier introuvable sur le serveur');

    const ext = path.extname(payment.attachmentPath);
    const ref = payment.reference ?? id.slice(0, 8).toUpperCase();
    return { filePath: payment.attachmentPath, filename: `justificatif-${ref}${ext}` };
  }

  async deleteAttachment(id: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
      select: { attachmentPath: true },
    });
    if (!payment) throw AppError.notFound('Paiement introuvable');
    if (!payment.attachmentPath) throw AppError.notFound('Aucun justificatif à supprimer');

    if (fs.existsSync(payment.attachmentPath)) {
      fs.unlinkSync(payment.attachmentPath);
    }
    await this.prisma.payment.update({ where: { id }, data: { attachmentPath: null } });
  }

  async generateReceipt(id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
      include: {
        invoice: {
          include: { client: true },
        },
      },
    });

    if (!payment) throw AppError.notFound('Paiement introuvable');

    const settings = await this.prisma.companySettings.findFirst({
      select: { headerImagePath: true, footerImagePath: true, stampPath: true },
    });

    const receiptRef = payment.reference ?? `REC-${payment.id.slice(0, 8).toUpperCase()}`;

    const receiptParams = {
      receiptRef,
      paymentDate: new Date(payment.paymentDate).toLocaleDateString('fr-FR'),
      amount: Number(payment.amount),
      method: payment.method,
      reference: payment.reference ?? undefined,
      invoiceNumber: payment.invoice.number,
      invoiceTotalTtc: Number(payment.invoice.totalTtc),
      amountPaid: Number(payment.invoice.amountPaid),
      balanceDue: Number(payment.invoice.balanceDue),
      clientName: payment.invoice.client.name,
      clientPhone: payment.invoice.client.phone ?? undefined,
      clientEmail: payment.invoice.client.email ?? undefined,
      currency: payment.invoice.currency,
      notes: payment.notes ?? undefined,
      headerImageB64: settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined,
      footerImageB64: settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined,
      sealImageB64:   settings?.stampPath       ? imgToBase64(settings.stampPath)       : undefined,
    };

    const html = buildReceiptHtml(receiptParams);
    const buffer = await generatePdf(html);

    return { buffer, filename: `recu-${receiptRef}.pdf` };
  }
}
