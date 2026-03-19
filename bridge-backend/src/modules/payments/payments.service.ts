/**
 * @module modules/payments/payments.service
 * Enregistrement et gestion des paiements de factures.
 *
 * À chaque paiement créé ou supprimé, le solde de la facture associée
 * est recalculé et son statut mis à jour automatiquement :
 *  - `issued`          → `partially_paid`  (premier paiement partiel)
 *  - `partially_paid`  → `paid`            (solde atteint zéro)
 *  - `paid`            → `partially_paid`  (paiement supprimé)
 *  - `partially_paid`  → `issued`          (tous les paiements supprimés)
 *
 * Les paiements ne sont jamais supprimés physiquement (soft-delete sur `deleted_at`)
 * pour la conformité comptable SYSCOHADA.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { notificationQueue } from '../../jobs/queues';
import { broadcastNotification } from '../../lib/broadcast';
import { DashboardService } from '../dashboard/dashboard.service';
import { generatePdf, buildReceiptHtml, imgToBase64 } from '../../lib/pdf';
import type { CreatePaymentInput, ListPaymentsInput } from './payments.schema';

export class PaymentsService {
  /**
   * Liste les paiements avec filtres et pagination.
   *
   * @param input - Filtres (facture, méthode, dates) et pagination
   * @returns Page de résultats enrichie avec numéro de facture et nom du client
   */
  async list(input: ListPaymentsInput) {
    const { page, limit, invoiceId, method, dateFrom, dateTo } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {
      deletedAt: null,
      ...(invoiceId && { invoiceId }),
      ...(method   && { method }),
      ...(dateFrom && { paymentDate: { gte: dateFrom } }),
      ...(dateTo   && { paymentDate: { lte: dateTo } }),
    };

    const [total, data] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        include: {
          invoice: { select: { id: true, number: true, client: { select: { name: true } } } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { paymentDate: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Enregistre un paiement sur une facture et met à jour son solde.
   *
   * Validations métier :
   * - La facture doit être dans un état payable (`issued`, `partially_paid`, `overdue`)
   * - Le montant ne peut pas dépasser le solde restant dû (`balance_due`)
   *
   * Toutes les mises à jour (paiement + facture) sont effectuées dans une
   * **transaction atomique** pour éviter toute incohérence en cas d'erreur.
   *
   * Transitions de statut automatiques :
   * - `balanceDue == 0` → statut `paid`
   * - `balanceDue > 0`  → statut `partially_paid` (si premier paiement) ou inchangé
   *
   * @param invoiceId   - UUID de la facture à régler
   * @param input       - Montant, méthode, date et référence du paiement
   * @param createdById - UUID de l'utilisateur enregistrant le paiement
   * @returns Le paiement créé
   * @throws `404` - Facture introuvable
   * @throws `400` - Facture dans un statut non payable ou montant > solde dû
   */
  async create(invoiceId: string, input: CreatePaymentInput, createdById: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
    });

    if (!invoice) throw AppError.notFound('Facture introuvable');

    if (!['issued', 'partially_paid', 'overdue'].includes(invoice.status)) {
      throw AppError.badRequest('Impossible d\'enregistrer un paiement sur cette facture');
    }

    const balanceDue = Number(invoice.balanceDue);
    if (input.amount > balanceDue) {
      throw AppError.badRequest(
        `Le paiement (${input.amount}) dépasse le solde dû (${balanceDue})`,
      );
    }

    return prisma.$transaction(async (tx) => {
      // 1. Créer le paiement
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          paymentDate: input.paymentDate,
          amount: input.amount,
          method: input.method,
          reference: input.reference,
          notes: input.notes,
          createdById,
        },
      });

      // 2. Recalculer le solde de la facture
      const newAmountPaid = Number(invoice.amountPaid) + input.amount;
      const newBalanceDue = Number(invoice.amountDue) - newAmountPaid;
      const isPaid        = newBalanceDue <= 0;

      // Détermine le nouveau statut selon l'état du paiement
      // Une facture overdue reste overdue tant qu'elle n'est pas soldée
      const newStatus = isPaid
        ? 'paid'
        : invoice.status === 'overdue'
        ? 'overdue'         // Paiement partiel sur une facture en retard → reste overdue
        : 'partially_paid'; // issued ou partially_paid → partially_paid

      // 3. Mettre à jour la facture (et son historique de statut si changement)
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: Math.max(0, newBalanceDue),
          status: newStatus,
          // Réinitialise l'escalade si la facture est entièrement payée
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

      return payment;
    }).then(async (payment) => {
      // Recalcul pour la notification (invoice capturé depuis la portée externe)
      const paidSoFar = Number(invoice.amountPaid) + input.amount;
      const remaining = Number(invoice.amountDue) - paidSoFar;
      const fullyPaid = remaining <= 0;

      await broadcastNotification({
        type: fullyPaid ? 'invoice_paid' : 'payment_registered',
        title: fullyPaid ? `Facture payée : ${invoice.number}` : `Paiement reçu : ${invoice.number}`,
        message: fullyPaid
          ? `La facture ${invoice.number} est entièrement réglée.`
          : `Un paiement de ${input.amount.toLocaleString('fr-FR')} XAF a été enregistré sur la facture ${invoice.number}.`,
        data: { invoiceId: invoice.id, invoiceNumber: invoice.number, amount: input.amount },
      }, { excludeUserId: createdById });

      await DashboardService.invalidateCache();
      return payment;
    });
  }

  /**
   * Soft-delete d'un paiement et recalcul du solde de la facture associée.
   *
   * Après suppression logique, le solde de la facture est recalculé à partir
   * des paiements restants actifs. Le statut est ajusté en conséquence.
   *
   * @param id - UUID du paiement à supprimer
   * @throws `404` - Paiement introuvable ou déjà supprimé
   */
  async softDelete(id: string): Promise<void> {
    const payment = await prisma.payment.findFirst({
      where: { id, deletedAt: null },
      include: { invoice: true },
    });

    if (!payment) throw AppError.notFound('Paiement introuvable');

    await prisma.$transaction(async (tx) => {
      // 1. Marquer le paiement comme supprimé
      await tx.payment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // 2. Recalculer le solde en agrégeant les paiements restants actifs
      const remainingPayments = await tx.payment.aggregate({
        where: { invoiceId: payment.invoiceId, deletedAt: null },
        _sum: { amount: true },
      });

      const newAmountPaid = Number(remainingPayments._sum.amount ?? 0);
      const newBalanceDue = Number(payment.invoice.amountDue) - newAmountPaid;

      // Détermine le statut cible selon les paiements restants
      let newStatus = payment.invoice.status;
      if (newAmountPaid === 0)      newStatus = 'issued';           // Plus aucun paiement
      else if (newBalanceDue > 0)   newStatus = 'partially_paid';   // Toujours un reliquat

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: Math.max(0, newBalanceDue),
          status: newStatus,
        },
      });
    });

    await DashboardService.invalidateCache();
  }

  /**
   * Génère le PDF du reçu de paiement et retourne le buffer binaire avec le nom de fichier.
   *
   * @param id - UUID du paiement
   * @returns Buffer PDF et nom de fichier suggéré pour le téléchargement
   * @throws `404` - Paiement introuvable ou supprimé
   */
  async generateReceipt(id: string) {
    const payment = await prisma.payment.findFirst({
      where: { id, deletedAt: null },
      include: {
        invoice: {
          include: { client: true },
        },
      },
    });

    if (!payment) throw AppError.notFound('Paiement introuvable');

    const settings = await prisma.companySettings.findFirst({
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

export const paymentsService = new PaymentsService();
