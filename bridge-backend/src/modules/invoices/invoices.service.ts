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
import type { CreateInvoiceInput, UpdateInvoiceInput, ListInvoicesInput, LineInput, CreateAvoirInput } from './invoices.schema';

// ---------------------------------------------------------------------------
// Helpers de calcul financier
// ---------------------------------------------------------------------------

/**
 * Calcule les montants d'une ligne de facture à partir des données saisies.
 *
 * Formule SYSCOHADA :
 *  - `subtotalHt` = quantité × prix_unitaire_HT
 *  - `discountAmount` = subtotalHt × taux_remise / 100  (si remise en %)
 *  - `netHt` = subtotalHt − discountAmount
 *  - `taxAmount` = netHt × taux_TVA / 100
 *  - `totalTtc` = netHt + taxAmount
 *
 * @param line - Données brutes d'une ligne (quantité, prix, remise, TVA)
 * @returns Montants calculés et arrondis à 2 décimales
 */
function computeLine(line: LineInput) {
  const subtotalHt = Number((line.quantity * line.unitPriceHt).toFixed(2));

  let discountAmount = 0;
  if (line.discountType === 'percentage') {
    discountAmount = Number((subtotalHt * line.discountValue / 100).toFixed(2));
  } else if (line.discountType === 'fixed') {
    // La remise fixe ne peut pas dépasser le montant HT
    discountAmount = Math.min(line.discountValue, subtotalHt);
  }

  const netHt      = Number((subtotalHt - discountAmount).toFixed(2));
  const taxAmount  = Number((netHt * line.taxRate / 100).toFixed(2));
  const totalTtc   = Number((netHt + taxAmount).toFixed(2));

  return { subtotalHt, discountAmount, netHt, taxAmount, totalTtc };
}

/**
 * Calcule les totaux globaux d'un document à partir des totaux de ses lignes.
 *
 * La remise globale s'applique sur la somme des montants nets HT des lignes
 * (après remises individuelles), avant application de la TVA.
 *
 * @param lines               - Totaux calculés de chaque ligne
 * @param globalDiscountType  - Type de remise globale ('none' | 'percentage' | 'fixed')
 * @param globalDiscountValue - Valeur de la remise globale (% ou montant fixe)
 * @returns Totaux du document : HT, remise globale, TVA, TTC
 */
function computeTotals(
  lines: Array<ReturnType<typeof computeLine>>,
  globalDiscountType: string,
  globalDiscountValue: number,
) {
  // Base de calcul = somme des nets HT de chaque ligne (après remises lignes)
  const subtotalHt = Number(lines.reduce((s, l) => s + l.netHt, 0).toFixed(2));

  let globalDiscountAmount = 0;
  if (globalDiscountType === 'percentage') {
    globalDiscountAmount = Number((subtotalHt * globalDiscountValue / 100).toFixed(2));
  } else if (globalDiscountType === 'fixed') {
    globalDiscountAmount = Math.min(globalDiscountValue, subtotalHt);
  }

  const totalHt  = Number((subtotalHt - globalDiscountAmount).toFixed(2));
  const totalTax = Number(lines.reduce((s, l) => s + l.taxAmount, 0).toFixed(2));
  const totalTtc = Number((totalHt + totalTax).toFixed(2));

  return { subtotalHt, globalDiscountAmount, totalHt, totalTax, totalTtc };
}

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
      ...(status   && { status }),
      ...(dateFrom && { issueDate: { gte: dateFrom } }),
      ...(dateTo   && { issueDate: { lte: dateTo } }),
      // Filtre "en retard" : émises ou partiellement payées avec échéance dépassée
      ...(overdue && {
        status: { in: ['issued', 'partially_paid'] },
        dueDate: { lt: now },
      }),
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

    const computedLines = input.lines.map(l => ({ ...l, ...computeLine(l) }));
    const totals = computeTotals(computedLines, input.globalDiscountType ?? 'none', input.globalDiscountValue ?? 0);

    // Facture d'acompte : le montant TTC est un pourcentage du total contractuel
    let acompteAmount = totals.totalTtc;
    if (input.type === 'acompte' && input.acomptePercentage) {
      acompteAmount = Number((totals.totalTtc * input.acomptePercentage / 100).toFixed(2));
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

    const amountDue = Number((totals.totalTtc - totalAcomptesDeducted).toFixed(2));

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
        totalAcomptesDeducted,
        amountDue,
        balanceDue: amountDue,
        lines: {
          create: computedLines.map(l => ({
            productId: l.productId,
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

    const updateData: Prisma.InvoiceUpdateInput = {
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

      Object.assign(updateData, {
        subtotalHt: totals.subtotalHt,
        globalDiscountAmount: totals.globalDiscountAmount,
        totalHt: totals.totalHt,
        totalTax: totals.totalTax,
        totalTtc: finalTtc,
        amountDue: totals.totalTtc,   // amountDue = full TTC (base de calcul solde)
        balanceDue: finalTtc,
        lines: {
          deleteMany: {},
          create: computedLines.map(l => ({
            productId: l.productId,
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
    }, { excludeUserId: userId });

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
              productId: l.productId,
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
      }, { excludeUserId: userId });
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
        productId?: string | null;
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
          productId: l.productId ?? null,
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
          productId: l.productId,
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
      const totalHt  = Number(avoirLines.reduce((s, l) => s + l.netHt,     0).toFixed(2));
      const totalTax = Number(avoirLines.reduce((s, l) => s + l.taxAmount,  0).toFixed(2));
      const totalTtc = Number(avoirLines.reduce((s, l) => s + l.totalTtc,   0).toFixed(2));

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
          subtotalHt: totalHt,
          globalDiscountType: 'none',
          globalDiscountValue: 0,
          globalDiscountAmount: 0,
          totalHt,
          totalTax,
          totalTtc,
          amountDue: 0,    // Un avoir solde la créance — montant dû = 0
          balanceDue: 0,
          status: 'issued',
          lines: {
            create: avoirLines,
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
    }, { excludeUserId: userId });

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

      lines: invoice.lines.map(l => ({
        reference:   l.product?.reference ?? undefined,
        designation: l.designation,
        description: l.description ?? undefined,
        quantity:    Number(l.quantity),
        unit:        l.unit,
        unitPriceHt: Number(l.unitPriceHt),
        netHt:       Number(l.netHt),
        taxRate:     Number(l.taxRate),
      })),

      subtotalHt: totalHt,
      totalTax,
      totalTtc: displayTtc,

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
        amountDue: original.totalTtc,
        balanceDue: original.totalTtc,
        acomptePercentage: original.acomptePercentage,
        lines: {
          create: original.lines.map(l => ({
            sortOrder: l.sortOrder,
            productId: l.productId,
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
}

export const invoicesService = new InvoicesService();
