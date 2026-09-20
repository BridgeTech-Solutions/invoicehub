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
import { broadcastNotification } from '../../lib/broadcast';
import { generatePdf, buildReceiptHtml, imgToBase64 } from '../../lib/pdf';
import { toRelativeUpload, resolveUpload } from '../../lib/uploads';
import * as accountingEngine from '../../lib/accountingEngine';
import { recordAccountingEvent } from '../../lib/accounting-outbox';
import type { NotificationJobData } from '../../jobs/job-types';
import type { CreatePaymentInput, ListPaymentsInput } from './payments.schema';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: DashboardCacheService,
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
    if (input.amount <= 0) {
      throw AppError.badRequest('Le montant du paiement doit être supérieur à zéro');
    }
    const paymentDate = new Date(input.paymentDate);

    // Tout ce qui dépend du solde se fait SOUS VERROU de la facture, dans la
    // transaction : sinon deux paiements concurrents lisent le même solde et
    // dépassent le montant dû (amountPaid/balanceDue faux). On sérialise donc les
    // paiements d'une même facture via un SELECT ... FOR UPDATE, et on recalcule le
    // montant réglé par AGRÉGATION réelle des paiements (jamais par arithmétique sur
    // un snapshot périmé) — source de vérité unique, alignée sur softDelete().
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Verrou de ligne : bloque tout paiement concurrent sur cette facture.
      await tx.$executeRaw`SELECT id FROM invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;

      // 2. Relecture SOUS verrou = état de référence.
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
        include: { client: { select: { accountingAccount: true, name: true } } },
      });
      if (!invoice) throw AppError.notFound('Facture introuvable');
      if (!['issued', 'partially_paid', 'overdue'].includes(invoice.status)) {
        throw AppError.badRequest('Impossible d\'enregistrer un paiement sur cette facture');
      }
      const balanceDue = Number(invoice.balanceDue);
      if (balanceDue <= 0) {
        throw AppError.badRequest('Cette facture est déjà entièrement réglée');
      }

      // 3. Escompte de règlement (contrôle d'unicité sous verrou).
      const escompteDeadline = (invoice as any).escompteDeadline ? new Date((invoice as any).escompteDeadline) : null;
      const escompteEligible =
        (invoice as any).escompteRate !== null &&
        (invoice as any).escompteDeadline !== null &&
        escompteDeadline !== null &&
        paymentDate <= escompteDeadline;

      let escompteApplied = false;
      let escompteAmount  = 0;
      if (escompteEligible && input.applyEscompte) {
        const alreadyApplied = await tx.payment.findFirst({
          where: { invoiceId, deletedAt: null, escompteApplied: true as any },
        });
        if (alreadyApplied) {
          throw AppError.badRequest('L\'escompte de règlement a déjà été appliqué sur un paiement précédent de cette facture');
        }
        escompteApplied = true;
        escompteAmount  = Number((invoice as any).escompteAmount);
      }

      // 4. Retenue à la source subie (créance d'impôt, solde une part de la facture).
      const withholdingAmount = Math.max(0, Number(input.withholdingAmount ?? 0));
      const withholdingApplied = withholdingAmount > 0;

      // 5. Contrôle de dépassement sur données FRAÎCHES (sous verrou).
      const totalCovered = input.amount + escompteAmount + withholdingAmount;
      if (totalCovered > balanceDue + 0.01) {
        throw AppError.badRequest(
          `Le règlement (encaissé ${input.amount.toLocaleString('fr-FR')}` +
          `${withholdingAmount > 0 ? ` + retenue ${withholdingAmount.toLocaleString('fr-FR')}` : ''}` +
          `${escompteAmount > 0 ? ` + escompte ${escompteAmount.toLocaleString('fr-FR')}` : ''} XAF) ` +
          `dépasse le solde dû (${balanceDue.toLocaleString('fr-FR')} XAF)`,
        );
      }

      // 5b. Période comptable : refuser une date hors d'un exercice ouvert. Sinon le
      //     paiement serait enregistré mais son écriture (Dr 521 / Cr 411) échouerait
      //     silencieusement (getOpenPeriod), laissant un règlement sans comptabilité.
      //     Comparaison par date calendaire (endDate est @db.Date à minuit UTC).
      const day = new Date(Date.UTC(paymentDate.getUTCFullYear(), paymentDate.getUTCMonth(), paymentDate.getUTCDate()));
      const openPeriod = await tx.fiscalPeriod.findFirst({
        where:  { status: 'open', startDate: { lte: day }, endDate: { gte: day } },
        select: { id: true },
      });
      if (!openPeriod) {
        throw AppError.badRequest(
          `Aucune période comptable ouverte pour le ${paymentDate.toLocaleDateString('fr-FR')} : ` +
          `impossible d'enregistrer le paiement à cette date (période clôturée ou inexistante).`,
        );
      }

      // 6. Création du paiement + intention de comptabilisation (outbox).
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          paymentDate:     input.paymentDate,
          amount:          input.amount,
          method:          input.method,
          reference:       input.reference,
          notes:           input.notes,
          bankAccountId:   input.bankAccountId,
          // attachmentPath n'est JAMAIS pris du body (anti-spoof) : il n'est défini
          // que par l'endpoint d'upload dédié (uploadAttachment).
          escompteApplied: escompteApplied as any,
          escompteAmount:  escompteAmount as any,
          withholdingApplied: withholdingApplied as any,
          withholdingAmount:  withholdingAmount as any,
          createdById,
        },
      } as any);

      await recordAccountingEvent(tx as any, 'onPaymentReceived', 'payment', payment.id);

      // 7. Recalcul du réglé par AGRÉGATION réelle (inclut le paiement qu'on vient
      //    de créer) : encaissements + escomptes + retenues, tous non supprimés.
      const agg = await tx.payment.aggregate({
        where: { invoiceId, deletedAt: null },
        _sum:  { amount: true, escompteAmount: true, withholdingAmount: true },
      });
      const newAmountPaid = Number(agg._sum.amount ?? 0)
        + Number(agg._sum.escompteAmount ?? 0)
        + Number((agg._sum as any).withholdingAmount ?? 0);
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
        const clientAccount = (invoice.client as any)?.accountingAccount ?? null;
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

      // Écriture comptable retenue à la source subie (Dr 4492 / Cr 411)
      if (withholdingApplied && withholdingAmount > 0) {
        const clientAccount = (invoice.client as any)?.accountingAccount ?? null;
        await accountingEngine.onRetenueSource({
          paymentId:         payment.id,
          clientAccount,
          withholdingAmount,
          invoiceNumber:     invoice.number,
          clientName:        (invoice.client as any)?.name ?? '',
          paymentDate,
        }, tx);
      }

      return { payment, invoice, escompteApplied, escompteAmount, withholdingApplied, withholdingAmount, remaining: newBalanceDue, fullyPaid: isPaid };
    });

    return await (async () => {
      const { payment, invoice, escompteApplied, escompteAmount, withholdingApplied, withholdingAmount, remaining, fullyPaid } = result;

      const escompteMsg = escompteApplied
        ? ` (escompte de ${escompteAmount.toLocaleString('fr-FR')} XAF accordé)`
        : '';
      const withholdingMsg = withholdingApplied
        ? ` (retenue à la source de ${withholdingAmount.toLocaleString('fr-FR')} XAF)`
        : '';

      const appUrl = process.env.APP_URL ?? 'http://localhost:3001';
      void broadcastNotification(this.prisma as any, this.notifQueue, {
        type:    fullyPaid ? 'invoice_paid' : 'payment_registered',
        title:   fullyPaid ? `Facture payée : ${invoice.number}` : `Paiement reçu : ${invoice.number}`,
        message: fullyPaid
          ? `La facture ${invoice.number} est entièrement réglée${escompteMsg}${withholdingMsg}.`
          : `Un paiement de ${input.amount.toLocaleString('fr-FR')} XAF a été enregistré sur la facture ${invoice.number}${escompteMsg}${withholdingMsg}.`,
        // Variables des templates invoice_paid / payment_registered (superset).
        data:    {
          invoiceId:     invoice.id,
          invoiceNumber: invoice.number,
          clientName:    (invoice.client as any)?.name ?? '',
          totalTtc:      Number((invoice as any).totalTtc ?? invoice.amountDue).toLocaleString('fr-FR'),
          amountPaid:    input.amount.toLocaleString('fr-FR'),
          balanceDue:    Math.max(0, remaining).toLocaleString('fr-FR'),
          paymentDate:   new Date(paymentDate).toLocaleDateString('fr-FR'),
          invoiceLink:   `${appUrl}/invoices/${invoice.id}`,
        },
      }, { permission: 'invoices:read' });

      void this.prisma.$transaction((tx) => accountingEngine.onPaymentReceived(payment.id, tx));
      if (fullyPaid) {
        void this.emitter.emit('invoice.paid', { invoiceId: invoice.id, paymentId: payment.id });
      }
      await this.cache.invalidate();
      return payment;
    })();
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
      include: { invoice: true },
    });

    if (!payment) throw AppError.notFound('Paiement introuvable');

    // #6 — Un paiement rapproché d'une transaction bancaire ne peut pas être
    // supprimé tel quel : cela laisserait un rapprochement fantôme côté banque.
    // On exige un dé-rapprochement préalable (module Banque).
    if ((payment as any).reconciledAt || (payment as any).bankTransactionId) {
      throw AppError.badRequest(
        'Ce paiement est rapproché d\'une transaction bancaire. Dé-rapprochez-le d\'abord depuis le module Banque avant de le supprimer.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Verrou facture (cohérent avec create) → recalcul fiable du solde.
      await tx.$executeRaw`SELECT id FROM invoices WHERE id = ${payment.invoiceId}::uuid FOR UPDATE`;

      await tx.payment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // Recalcul par AGRÉGATION : encaissement + escompte accordé + retenue à la
      // source (composantes non-cash qui soldent aussi la facture).
      const agg = await tx.payment.aggregate({
        where: { invoiceId: payment.invoiceId, deletedAt: null },
        _sum: { amount: true, escompteAmount: true, withholdingAmount: true },
      });
      const newAmountPaid = Number(agg._sum.amount ?? 0)
        + Number(agg._sum.escompteAmount ?? 0)
        + Number((agg._sum as any).withholdingAmount ?? 0);
      const newBalanceDue = Number(payment.invoice.amountDue) - newAmountPaid;

      const prevStatus = payment.invoice.status;
      let newStatus = prevStatus;
      if (newAmountPaid <= 0.01) {
        // #9 — plus aucun règlement : impayé. On restaure 'overdue' si l'échéance
        // est dépassée, sinon 'issued' (au lieu de forcer 'issued' aveuglément).
        const due = payment.invoice.dueDate ? new Date(payment.invoice.dueDate) : null;
        newStatus = (due && due.getTime() < Date.now()) ? 'overdue' : 'issued';
      } else if (newBalanceDue > 0.01) {
        newStatus = 'partially_paid';
      } else {
        newStatus = 'paid';
      }

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: Math.max(0, newBalanceDue),
          status: newStatus,
          // #8 — tracer le changement de statut consécutif à la suppression.
          ...(newStatus !== prevStatus && {
            statusHistory: {
              create: { changedById: userId, previousStatus: prevStatus, newStatus },
            },
          }),
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

    // Remplace l'ancien justificatif (résout relatif récent ou absolu hérité)
    if (payment.attachmentPath) {
      const oldAbs = resolveUpload(payment.attachmentPath);
      if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
    }

    // Stocke un chemin RELATIF (portable), pas le chemin absolu de multer
    await this.prisma.payment.update({ where: { id }, data: { attachmentPath: toRelativeUpload(filePath) } });
  }

  async getAttachment(id: string): Promise<{ filePath: string; filename: string }> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
      select: { attachmentPath: true, reference: true },
    });
    if (!payment) throw AppError.notFound('Paiement introuvable');
    if (!payment.attachmentPath) throw AppError.notFound('Aucun justificatif attaché à ce paiement');
    const absPath = resolveUpload(payment.attachmentPath);
    if (!fs.existsSync(absPath)) throw AppError.notFound('Fichier introuvable sur le serveur');

    const ext = path.extname(absPath);
    const ref = payment.reference ?? id.slice(0, 8).toUpperCase();
    return { filePath: absPath, filename: `justificatif-${ref}${ext}` };
  }

  async deleteAttachment(id: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
      select: { attachmentPath: true },
    });
    if (!payment) throw AppError.notFound('Paiement introuvable');
    if (!payment.attachmentPath) throw AppError.notFound('Aucun justificatif à supprimer');

    const absPath = resolveUpload(payment.attachmentPath);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
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
      withholdingAmount: Number((payment as any).withholdingAmount ?? 0),
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
