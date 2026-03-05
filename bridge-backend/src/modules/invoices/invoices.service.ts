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
import { generatePdf, buildDocumentHtml } from '../../lib/pdf';
import { sendMail } from '../../lib/mailer';
import type { CreateInvoiceInput, UpdateInvoiceInput, ListInvoicesInput, LineInput } from './invoices.schema';

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
        lines: { orderBy: { sortOrder: 'asc' } },
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
      const acomptesAgg = await prisma.payment.aggregate({
        where: {
          invoice: { parentInvoiceId: input.parentInvoiceId, type: 'acompte' },
          deletedAt: null,
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
      Object.assign(updateData, {
        subtotalHt: totals.subtotalHt,
        globalDiscountAmount: totals.globalDiscountAmount,
        totalHt: totals.totalHt,
        totalTax: totals.totalTax,
        totalTtc: totals.totalTtc,
        amountDue: totals.totalTtc,
        balanceDue: totals.totalTtc,
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

    // Notification email au client — non critique (ne bloque pas la réponse si échec)
    if (invoice.client.email) {
      await sendMail({
        to: invoice.client.email,
        subject: `Facture ${invoice.number} — Bridge Technologies Solutions`,
        html: `
          <p>Bonjour ${invoice.client.name},</p>
          <p>Veuillez trouver ci-joint votre facture N° <strong>${invoice.number}</strong>.</p>
          <p>Montant total : <strong>${Number(invoice.totalTtc).toLocaleString('fr-FR')} ${invoice.currency}</strong></p>
          <p>Date d'échéance : ${new Date(invoice.dueDate).toLocaleDateString('fr-FR')}</p>
          <p>Cordialement,<br>Bridge Technologies Solutions</p>
        `,
      }).catch(() => {/* Email non critique — l'émission est déjà enregistrée */});
    }

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
    });
  }

  /**
   * Génère le PDF d'une facture et retourne le buffer binaire avec le nom de fichier.
   * Met à jour `pdf_generated_at` en base après génération.
   *
   * @param id - UUID de la facture
   * @returns Buffer PDF et nom de fichier suggéré pour le téléchargement
   */
  async generatePdfResponse(id: string) {
    const invoice = await this.findById(id);
    const company = await prisma.companySettings.findFirst();

    const docType = invoice.type === 'avoir' ? 'Avoir' : 'Facture';

    const html = buildDocumentHtml({
      type: docType,
      number: invoice.number,
      issueDate: new Date(invoice.issueDate).toLocaleDateString('fr-FR'),
      dueDate: new Date(invoice.dueDate).toLocaleDateString('fr-FR'),
      companyName: company?.companyName ?? 'Bridge Technologies Solutions',
      companyAddress: company?.address ?? 'Douala, Cameroun',
      companyPhone: company?.phone ?? '',
      companyEmail: company?.email ?? '',
      companyTaxNumber: company?.taxNumber ?? undefined,
      clientName: invoice.client.name,
      clientAddress: invoice.client.address ?? undefined,
      clientEmail: invoice.client.email ?? undefined,
      clientTaxNumber: invoice.client.taxNumber ?? undefined,
      subject: invoice.subject ?? undefined,
      currency: invoice.currency,
      lines: invoice.lines.map(l => ({
        designation: l.designation,
        quantity: Number(l.quantity),
        unit: l.unit,
        unitPriceHt: Number(l.unitPriceHt),
        taxRate: Number(l.taxRate),
        totalTtc: Number(l.totalTtc),
      })),
      subtotalHt: Number(invoice.totalHt),
      totalTax: Number(invoice.totalTax),
      totalTtc: Number(invoice.totalTtc),
      notes: invoice.notes ?? undefined,
      paymentConditions: invoice.paymentConditions ?? undefined,
    });

    const pdfBuffer = await generatePdf(html);

    await prisma.invoice.update({ where: { id }, data: { pdfGeneratedAt: new Date() } });

    // Les "/" du numéro sont remplacés par "-" pour un nom de fichier valide
    return { buffer: pdfBuffer, filename: `${invoice.number.replace(/\//g, '-')}.pdf` };
  }
}

export const invoicesService = new InvoicesService();
