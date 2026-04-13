/**
 * @module modules/invoices/invoices.service
 * Logique métier des factures — module le plus critique du système.
 *
 * Types de factures gérés (CDC §4.4) :
 *  - `standard`  : facture classique
 *  - `acompte`   : facture d'acompte (pourcentage du total)
 *  - `solde`     : facture de solde (déduit les acomptes versés)
 *  - `avoir`     : note de crédit (générée automatiquement à l'annulation)
 *  - `recurring` : facture issue d'un gabarit de facturation récurrente
 *
 * Règle SYSCOHADA : les numéros de facture sont générés via la fonction
 * PostgreSQL `fn_next_document_number()` pour garantir l'atomicité et l'absence
 * de trous dans la séquence — jamais calculés côté JavaScript.
 *
 * Snapshots : les prix et descriptions sont copiés depuis le catalogue
 * au moment de la création des lignes. Les modifications ultérieures
 * du catalogue n'affectent pas les documents existants.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { generateDocumentNumber, getDefaultOfficeId } from '../../lib/documentNumber';
import { generatePdf, buildDocumentHtml, imgToBase64 } from '../../lib/pdf';
import { emailQueue, notificationQueue } from '../../jobs/queues';
import { broadcastNotification } from '../../lib/broadcast';
import { DashboardService } from '../dashboard/dashboard.service';
import { computeLine, computeTotals } from '../../lib/document-math';
import { paymentsService } from '../payments/payments.service';
import type { CreateInvoiceInput, UpdateInvoiceInput, ListInvoicesInput, LineInput, CreateAvoirInput } from './invoices.schema';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class InvoicesService {
  /**
   * Liste les factures avec filtres, pagination et tri.
   *
   * @param input - Filtres (client, type, statut, dates, retard) et pagination
   * @returns Page de résultats avec métadonnées de pagination
   */
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
      // Filtre de statut — `overdue` et `status` sont mutuellement exclusifs :
      // si les deux arrivent (appel API direct), overdue prend la priorité.
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
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
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

  /**
   * Compteurs par statut pour les onglets de la liste.
   * Inclut `overdue_tab` : émises/partiellement payées avec échéance dépassée.
   */
  async counts() {
    const now = new Date();
    const [byStatus, overdueTab] = await Promise.all([
      prisma.invoice.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      prisma.invoice.count({
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

  /**
   * Récupère une facture complète avec ses lignes, paiements et historique de statut.
   *
   * @param id - UUID de la facture
   * @throws `404` - Facture introuvable ou supprimée
   */
  async findById(id: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        client: true,
        office: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
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

  /**
   * Crée une nouvelle facture avec ses lignes.
   *
   * Le numéro SYSCOHADA est généré atomiquement en base via `fn_next_document_number()`.
   * Les totaux sont calculés côté serveur — les valeurs transmises par le client
   * pour les montants sont ignorées (recalculées).
   *
   * Cas spéciaux :
   * - `acompte` : le `totalTtc` est recalculé à partir de `acomptePercentage`
   * - `solde`   : `totalAcomptesDeducted` est calculé en sommant les paiements
   *              reçus sur les factures d'acompte liées au `parentInvoiceId`
   *
   * @param input       - Données de la facture et de ses lignes
   * @param createdById - UUID de l'utilisateur créateur
   * @returns Facture créée avec ses lignes et le client associé
   */
  async create(input: CreateInvoiceInput, createdById: string) {
    const officeId = input.officeId ?? await getDefaultOfficeId();
    const number   = await generateDocumentNumber(officeId, 'invoice');

    // Validation parentInvoice : doit exister, ne pas être brouillon ni annulée
    if (input.parentInvoiceId) {
      const parentInvoice = await prisma.invoice.findFirst({
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

    const computedLines = input.lines.map(l => ({ ...l, ...computeLine(l) }));
    const totals = computeTotals(computedLines, input.globalDiscountType ?? 'none', input.globalDiscountValue ?? 0);

    // Facture d'acompte : le montant TTC est un pourcentage du total contractuel
    let acompteAmount = totals.totalTtc;
    if (input.type === 'acompte' && input.acomptePercentage) {
      acompteAmount = Number((totals.totalTtc * input.acomptePercentage / 100).toFixed(2));
    }

    // Facture d'acompte avec parent : vérifier que le cumul ne dépasse pas le total projet
    // et mémoriser le total déjà engagé pour l'affichage (stocké dans totalAcomptesDeducted)
    let acompteAlreadyEngaged = 0;
    if (input.type === 'acompte' && input.parentInvoiceId) {
      // Inclure le parent lui-même (amountDue de l'acompte racine)
      const parentInvoice = await prisma.invoice.findFirst({
        where: { id: input.parentInvoiceId, type: 'acompte', deletedAt: null, status: { notIn: ['cancelled'] } },
        select: { amountDue: true },
      });
      const parentAmount = Number(parentInvoice?.amountDue ?? 0);

      // Acomptes frères (autres acomptes avec le même parent)
      const siblingAgg = await prisma.invoice.aggregate({
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

    // Facture de solde : déduit la somme des acomptes déjà encaissés
    let totalAcomptesDeducted = 0;
    if (input.type === 'solde' && input.parentInvoiceId) {
      // Garde-fou : empêcher un double solde sur le même acompte
      const existingSolde = await prisma.invoice.findFirst({
        where: { parentInvoiceId: input.parentInvoiceId, type: 'solde', deletedAt: null, status: { notIn: ['cancelled'] } },
        select: { id: true, number: true },
      });
      if (existingSolde) {
        throw AppError.badRequest(`Une facture de solde existe déjà pour cet acompte : ${existingSolde.number}`);
      }

      // Paiements sur l'acompte direct (parentInvoiceId) ET sur tous les acomptes
      // liés à ce même parent (cas multi-acomptes : acompte B, C... avec parentInvoiceId = A.id)
      const acomptesAgg = await prisma.payment.aggregate({
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

    // Pour un acompte : amountDue = montant de l'acompte (pas le total projet complet)
    // Pour un solde   : amountDue = total projet − acomptes déjà versés
    // Sinon           : amountDue = total TTC
    const amountDue = input.type === 'acompte'
      ? acompteAmount
      : Number((totals.totalTtc - totalAcomptesDeducted).toFixed(2));

    return prisma.invoice.create({
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
        // Pour un acompte multi-versement : stocke la somme des acomptes précédents
        // pour que la page de détail affiche le bon "Solde restant TTC"
        totalAcomptesDeducted: input.type === 'acompte' ? acompteAlreadyEngaged : totalAcomptesDeducted,
        amountDue,
        balanceDue: amountDue,
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
      include: { lines: true, client: true },
    });
  }

  /**
   * Modifie une facture en brouillon (entête et/ou lignes).
   * Seules les factures au statut `draft` sont modifiables.
   *
   * Si des lignes sont fournies, elles remplacent intégralement les lignes
   * existantes (delete + recreate) et les totaux sont recalculés.
   *
   * @param id     - UUID de la facture
   * @param input  - Champs à modifier (tous optionnels)
   * @param userId - UUID de l'utilisateur effectuant la modification
   * @throws `400` - Facture non en brouillon
   * @throws `404` - Facture introuvable
   */
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
    };

    if (input.lines) {
      const computedLines = input.lines.map(l => ({ ...l, ...computeLine(l) }));
      const totals = computeTotals(
        computedLines,
        input.globalDiscountType ?? invoice.globalDiscountType,
        Number(input.globalDiscountValue ?? invoice.globalDiscountValue),
      );
      // Recalcule le totalTtc en tenant compte du pourcentage d'acompte si applicable
      const acomptePct = Number(invoice.acomptePercentage ?? 0);
      const finalTtc = (invoice.type === 'acompte' && acomptePct > 0)
        ? Number((totals.totalTtc * acomptePct / 100).toFixed(2))
        : totals.totalTtc;

      // Pour un solde, recalcule amountDue en déduisant les acomptes déjà versés
      let finalAmountDue = finalTtc;
      if (invoice.type === 'solde' && invoice.parentInvoiceId) {
        const acomptesAgg = await prisma.payment.aggregate({
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

    return prisma.invoice.update({
      where: { id },
      data: updateData,
      include: { lines: true },
    });
  }

  /**
   * Émet une facture (transition `draft → issued`) et notifie le client par email.
   * Une fois émise, la facture ne peut plus être modifiée — uniquement annulée.
   *
   * @param id     - UUID de la facture
   * @param userId - UUID de l'utilisateur effectuant l'émission
   * @throws `400` - Facture non en brouillon
   */
  async issue(id: string, userId: string) {
    const invoice = await this.findById(id);
    if (invoice.status !== 'draft') {
      throw AppError.badRequest('Seules les factures en brouillon peuvent être émises');
    }

    const updated = await prisma.invoice.update({
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

    // Notification in-app à tous les utilisateurs actifs
    await broadcastNotification({
      type: 'invoice_issued',
      title: `Facture émise : ${invoice.number}`,
      message: `La facture ${invoice.number} pour ${invoice.client.name} a été émise. Échéance : ${new Date(invoice.dueDate).toLocaleDateString('fr-FR')}.`,
      data: { invoiceId: invoice.id, invoiceNumber: invoice.number },
    });

    // Email au client — désactivé (envoi manuel hors application)
    // if (invoice.client.email) {
    //   await emailQueue.add('email', {
    //     to: invoice.client.email,
    //     subject: `Facture ${invoice.number} — Bridge Technologies Solutions`,
    //     html: `
    //       <p>Bonjour ${invoice.client.name},</p>
    //       <p>Veuillez trouver ci-joint votre facture N° <strong>${invoice.number}</strong>.</p>
    //       <p>Montant total : <strong>${Number(invoice.totalTtc).toLocaleString('fr-FR')} ${invoice.currency}</strong></p>
    //       <p>Date d'échéance : ${new Date(invoice.dueDate).toLocaleDateString('fr-FR')}</p>
    //       <p>Cordialement,<br>Bridge Technologies Solutions</p>
    //     `,
    //   });
    // }

    await DashboardService.invalidateCache();
    return updated;
  }

  /**
   * Annule une facture émise et génère automatiquement un avoir (CDC §4.4).
   *
   * L'avoir est créé dans la même transaction que l'annulation pour garantir
   * la cohérence : si l'une des deux opérations échoue, aucune n'est persistée.
   *
   * L'avoir reprend exactement les mêmes lignes que la facture annulée,
   * avec `credited_invoice_id` pointant vers la facture d'origine.
   *
   * @param id     - UUID de la facture à annuler
   * @param userId - UUID de l'utilisateur effectuant l'annulation
   * @param reason - Motif d'annulation (optionnel, loggé dans le statut et l'avoir)
   * @returns La facture annulée (l'avoir est créé implicitement)
   * @throws `400` - Seules les factures `issued`, `partially_paid` ou `overdue` peuvent être annulées
   */
  async cancel(id: string, userId: string, reason?: string) {
    const invoice = await this.findById(id);
    if (!['issued', 'partially_paid', 'overdue'].includes(invoice.status)) {
      throw AppError.badRequest('Seules les factures émises peuvent être annulées');
    }

    return prisma.$transaction(async (tx) => {
      // 1. Annuler la facture originale
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

      // 2. Créer automatiquement l'avoir (note de crédit) lié à la facture annulée
      const avoirNumber = await generateDocumentNumber(invoice.officeId, 'invoice');

      await tx.invoice.create({
        data: {
          number: avoirNumber,
          officeId: invoice.officeId,
          type: 'avoir',
          clientId: invoice.clientId,
          createdById: userId,
          creditedInvoiceId: invoice.id, // Lien obligatoire (contrainte DB)
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
          amountDue: 0,   // L'avoir solde la dette — montant dû = 0
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

      return cancelled;
    }).then(async (cancelled) => {
      await broadcastNotification({
        type: 'system',
        title: `Facture annulée : ${invoice.number}`,
        message: `La facture ${invoice.number} pour ${invoice.client.name} a été annulée. Un avoir a été généré automatiquement.`,
        data: { invoiceId: invoice.id, invoiceNumber: invoice.number, reason },
      });
      await DashboardService.invalidateCache();
      return cancelled;
    });
  }

  /**
   * Crée un avoir manuel sur une facture existante (CDC §4.4 — avoir hors annulation).
   *
   * Contrairement à l'avoir automatique généré par `cancel()`, cette méthode permet
   * de créer un avoir partiel (lignes et montants personnalisés) sur une facture
   * encore active (`issued`, `partially_paid`, `paid`, `overdue`).
   *
   * @param id    - UUID de la facture à créditer
   * @param input - Motif, notes, lignes optionnelles et date d'échéance
   * @param userId - UUID de l'utilisateur créant l'avoir
   * @returns L'avoir créé avec ses lignes et le client associé
   * @throws `400` - Type de facture non creditable (avoir d'un avoir interdit)
   * @throws `400` - Statut de la facture ne permet pas la création d'un avoir
   * @throws `404` - Facture introuvable
   */
  async createAvoir(id: string, input: CreateAvoirInput, userId: string) {
    const invoice = await this.findById(id);

    // Un avoir ne peut pas être créé depuis un autre avoir
    if (!['standard', 'solde', 'acompte'].includes(invoice.type)) {
      throw AppError.badRequest('Un avoir ne peut être créé que depuis une facture de type standard, acompte ou solde');
    }

    // La facture doit être dans un état émis (pas en brouillon ni annulée)
    if (!['issued', 'partially_paid', 'paid', 'overdue'].includes(invoice.status)) {
      throw AppError.badRequest('Un avoir ne peut être créé que sur une facture émise, partiellement payée, payée ou en retard');
    }

    const avoir = await prisma.$transaction(async (tx) => {
      const avoirNumber = await generateDocumentNumber(invoice.officeId, 'invoice');

      // Calcul des lignes : personnalisées ou copie des lignes originales
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
        // Lignes personnalisées : recalcul complet via computeLine
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
        // Copie exacte des lignes de la facture originale (même montants — snapshots)
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

      // Calcul des totaux de l'avoir à partir de ses lignes
      // subtotalHt = somme des HT bruts (avant remises ligne), totalHt = subtotalHt (pas de remise globale sur un avoir)
      const avoirSubtotalHt = Number(avoirLines.reduce((s, l) => s + l.subtotalHt, 0).toFixed(2));
      const totalTax        = Number(avoirLines.reduce((s, l) => s + l.taxAmount,  0).toFixed(2));
      const totalTtc        = Number(avoirLines.reduce((s, l) => s + l.totalTtc,   0).toFixed(2));

      return tx.invoice.create({
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
          totalHt: avoirSubtotalHt,  // pas de remise globale → totalHt = subtotalHt
          totalTax,
          totalTtc,
          amountDue: 0,    // Un avoir solde la créance — montant dû = 0
          balanceDue: 0,
          status: 'issued',
          lines: {
            create: avoirLines as Parameters<typeof prisma.invoiceLine.create>[0]['data'][],
          },
          statusHistory: {
            create: { changedById: userId, newStatus: 'issued' },
          },
        },
        include: { lines: true, client: true },
      });
    });

    // Notification in-app après la transaction
    await broadcastNotification({
      type: 'system',
      title: `Avoir créé : ${avoir.number}`,
      message: `Un avoir ${avoir.number} a été créé sur la facture ${invoice.number} pour ${invoice.client.name}. Motif : ${input.reason}`,
      data: { invoiceId: invoice.id, avoirId: avoir.id, avoirNumber: avoir.number },
    });

    await DashboardService.invalidateCache();
    return avoir;
  }

  /**
   * Génère le PDF d'une facture et retourne le buffer binaire avec le nom de fichier.
   * Met à jour `pdf_generated_at` en base après génération.
   *
   * @param id - UUID de la facture
   * @returns Buffer PDF et nom de fichier suggéré pour le téléchargement
   */
  async generatePdfResponse(id: string) {
    const [invoice, settings] = await Promise.all([
      this.findById(id),
      prisma.companySettings.findFirst({ select: { headerImagePath: true, footerImagePath: true, stampPath: true, footerSafeZonePx: true } }),
    ]);

    const isAcompte = invoice.type === 'acompte';
    const isSolde   = invoice.type === 'solde';

    const totalHt  = Number(invoice.totalHt);
    const totalTax = Number(invoice.totalTax);
    const totalTtc = Number(invoice.totalTtc);   // Full TTC (ou acompte TTC si type=acompte)
    const pct      = isAcompte ? Number(invoice.acomptePercentage ?? 0) : 0;

    // Montants spécifiques acompte (calculés depuis le HT complet stocké)
    const acompteHt  = isAcompte ? Number((totalHt  * pct / 100).toFixed(2)) : undefined;
    const acompteTax = isAcompte ? Number((totalTax * pct / 100).toFixed(2)) : undefined;

    // Montants spécifiques solde
    // amountDue = full TTC − acomptes déjà encaissés = solde TTC
    const soldeTtc = isSolde ? Number(invoice.amountDue) : undefined;
    const soldeHt  = (isSolde && soldeTtc !== undefined && totalTtc > 0)
      ? Number((soldeTtc * totalHt / totalTtc).toFixed(2))
      : undefined;
    const soldeTax = (isSolde && soldeTtc !== undefined && soldeHt !== undefined)
      ? Number((soldeTtc - soldeHt).toFixed(2))
      : undefined;

    // totalTtc passé au template = ce que le client doit payer sur ce document
    const displayTtc = isSolde ? (soldeTtc ?? totalTtc) : totalTtc;

    // Composition du B.P. + ville
    const clientBP = invoice.client.postalBox
      ? `${invoice.client.postalBox}${invoice.client.city ? ` ${invoice.client.city}-${invoice.client.country}` : ''}`
      : (invoice.client.city ? `${invoice.client.city}-${invoice.client.country}` : undefined);

    const docType =
      invoice.type === 'avoir'   ? 'Avoir'           :
      invoice.type === 'acompte' ? 'Facture Acompte' :
      invoice.type === 'solde'   ? 'Facture Solde'   : 'Facture';

    const headerImageB64 = settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined;
    const footerImageB64 = settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined;
    const sealImageB64   = settings?.stampPath       ? imgToBase64(settings.stampPath)       : undefined;

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
      clientBankAccount: invoice.client.bankAccount ?? undefined,
      contactPerson:     invoice.createdBy?.email ?? undefined,

      subject:  invoice.subject          ?? undefined,
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
          // Remise ligne — affiché dans la colonne Remise si > 0
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

      // Remise globale — affiché entre TOTAL HT et TVA si > 0
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
    const pdfBuffer = await generatePdf(html, footerSafeZonePx);

    await prisma.invoice.update({ where: { id }, data: { pdfGeneratedAt: new Date() } });

    // Les "/" du numéro sont remplacés par "-" pour un nom de fichier valide
    return { buffer: pdfBuffer, filename: `${invoice.number.replace(/\//g, '-')}.pdf` };
  }

  /**
   * Calcul à la volée (dry-run) — aucune donnée sauvegardée.
   *
   * Calcule les totaux financiers et détecte les anomalies potentielles :
   *  - Solde impayé du client (alerte si > 0)
   *  - Montant inhabituel (> 3× la moyenne historique de ce client)
   *  - Risque de doublon (facture similaire créée dans les 14 derniers jours)
   *  - Numéro de BC client déjà utilisé
   *
   * @param input - Lignes, clientId, remise globale et BC optionnel
   * @returns Totaux calculés + liste d'alertes (warnings)
   */
  async compute(input: import('./invoices.schema').ComputeInvoiceInput) {
    const { clientId, lines, globalDiscountType, globalDiscountValue, clientReference } = input;

    // ── Calcul financier ────────────────────────────────────────────────────
    const computedLines = lines.map(l => ({ ...l, ...computeLine(l as any) }));
    const totals = computeTotals(computedLines, globalDiscountType, globalDiscountValue);

    // ── Requêtes de détection en parallèle ─────────────────────────────────
    const [unpaidAgg, avgAgg, similarInvoice, duplicateRef] = await Promise.all([

      // 1. Solde impayé actuel du client
      prisma.invoice.aggregate({
        where: {
          clientId, deletedAt: null,
          status: { in: ['issued', 'partially_paid', 'overdue'] as any[] },
        },
        _sum: { balanceDue: true },
        _count: true,
      }),

      // 2. Montant moyen des factures de ce client (12 derniers mois)
      prisma.invoice.aggregate({
        where: {
          clientId, deletedAt: null,
          status: { notIn: ['cancelled', 'draft'] as any[] },
          createdAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
        },
        _avg: { totalTtc: true },
      }),

      // 3. Doublon probable : même client + montant similaire (±15%) + < 14 jours
      prisma.invoice.findFirst({
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

      // 4. Numéro de BC déjà utilisé
      clientReference
        ? prisma.invoice.findFirst({
            where: { clientId, deletedAt: null, clientReference },
            select: { id: true, number: true },
          })
        : Promise.resolve(null),
    ]);

    // ── Construction des alertes ────────────────────────────────────────────
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

  /**
   * Pré-remplit les données pour créer une facture de solde depuis un acompte.
   *
   * Retourne :
   *  - Les lignes de la facture acompte (copiées telles quelles)
   *  - Le total des acomptes déjà encaissés (acomptes multiples inclus)
   *  - La liste de tous les acomptes liés (pour info)
   *  - Le montant restant à facturer (solde TTC)
   *
   * Fonctionne pour acomptes multiples : si l'acompte passé a lui-même
   * un parentInvoiceId, le root est remonté automatiquement.
   *
   * @param acompteId - UUID de n'importe quel acompte du cycle
   */
  async soldePrefill(acompteId: string) {
    const acompte = await prisma.invoice.findFirst({
      where: { id: acompteId, deletedAt: null },
      include: {
        client: true,
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!acompte) throw AppError.notFound('Facture introuvable');
    if (acompte.type !== 'acompte') throw AppError.badRequest('Cette facture n\'est pas une facture d\'acompte');

    // Remonte jusqu'à la racine du cycle (acompte root = celui sans parentInvoiceId)
    const rootId = acompte.parentInvoiceId ?? acompte.id;

    // Tous les acomptes du cycle (root + acomptes enfants)
    const allAcomptes = await prisma.invoice.findMany({
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

    // Vérifie qu'il n'existe pas déjà un solde non-annulé
    const existingSolde = await prisma.invoice.findFirst({
      where: { parentInvoiceId: rootId, type: 'solde', deletedAt: null, status: { notIn: ['cancelled'] } },
      select: { id: true, number: true },
    });
    if (existingSolde) throw AppError.badRequest(`Une facture de solde existe déjà : ${existingSolde.number}`);

    // Somme des paiements sur tous les acomptes du cycle
    const totalAcomptesEncaisses = allAcomptes.reduce((sum, a) => {
      return sum + a.payments.reduce((s, p) => s + Number(p.amount), 0);
    }, 0);

    const fullTtc   = Number(acompte.totalTtc);
    const soldeTtc  = Number((fullTtc - totalAcomptesEncaisses).toFixed(2));

    // Lignes pré-remplies (même structure que CreateInvoiceInput.lines)
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
      // Données à passer directement au formulaire de création
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
      // Résumé du cycle pour affichage
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
    const company = await prisma.companySettings.findFirst();
    const dueDays = company?.defaultInvoiceDueDays ?? 30;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);

    const number = await generateDocumentNumber(original.officeId, 'invoice');

    return prisma.invoice.create({
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
        // Pour un solde, amountDue = totalTtc − acomptes déjà déduits (original.amountDue).
        // Pour les autres types, amountDue = totalTtc complet (nouveau brouillon indépendant).
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
    await prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async getHistory(id: string) {
    return prisma.auditLog.findMany({
      where: {
        entityId:   id,
        entityType: { in: ['invoice', 'payment'] },
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Prédit la date probable de paiement d'une facture à partir du comportement
   * historique du client (retard moyen par rapport à l'échéance).
   *
   * - `predictedDate` = dueDate + avgDaysLate du client
   * - `confidence`    : 'low' (<5 paiements), 'medium' (5-20), 'high' (>20)
   * - `basis`         : 'historical' si données dispo, 'due-date' si client nouveau
   */
  async getPaymentPrediction(invoiceId: string) {
    const invoice = await prisma.invoice.findFirst({
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

    const [behaviorRaw] = await prisma.$queryRaw<BehaviorRow[]>`
      SELECT
        AVG(EXTRACT(EPOCH FROM (pay.payment_date - inv.due_date)) / 86400) AS avg_days_late,
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
    const inv = await prisma.invoice.findFirst({
      where:  { id: invoiceId, deletedAt: null },
      select: { balanceDue: true, number: true },
    });
    if (!inv) throw AppError.notFound('Facture introuvable');
    const balanceDue = Number(inv.balanceDue);
    if (balanceDue <= 0) throw AppError.badRequest('Solde déjà nul');

    return paymentsService.create(invoiceId, {
      amount:      balanceDue,
      method:      'virement',
      reference:   `Confirmé via notification — ${inv.number}`,
      paymentDate: new Date(),
    }, userId);
  }
}

export const invoicesService = new InvoicesService();
