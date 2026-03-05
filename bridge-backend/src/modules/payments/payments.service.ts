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
      const newStatus = isPaid
        ? 'paid'
        : Number(invoice.amountPaid) === 0
        ? 'partially_paid'  // Pas de paiement précédent → premier règlement partiel
        : invoice.status;   // Déjà partiellement payée → statut inchangé

      // 3. Mettre à jour la facture (et son historique de statut si changement)
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: Math.max(0, newBalanceDue),
          status: newStatus,
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
  }
}

export const paymentsService = new PaymentsService();
