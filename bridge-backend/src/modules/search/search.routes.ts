/**
 * @module modules/search
 * Recherche globale intelligente multi-entité.
 *
 * Endpoint :
 *   GET /api/search?q=<requête>
 *
 * Exemples de requêtes supportées :
 *   "Camtel 2025"          → factures/proformas du client Camtel en 2025
 *   "impayé > 500000"      → factures impayées > 500 000 XAF
 *   "FAC-031"              → navigation directe vers la facture FAC-031
 *   "Jean Dupont"          → client ou utilisateur
 *   "mars 2026 brouillon"  → proformas/factures brouillon de mars 2026
 *   ">= 1M envoyé"         → factures émises ≥ 1 000 000 XAF
 *
 * Réponse :
 *   {
 *     parsed:     { description, filters détectés }
 *     navigation: { type, id, number }   // si numéro de document exact trouvé
 *     results:    { invoices, proformas, clients, products, users? }
 *   }
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../core/middleware/auth';
import { parseSearchQuery, describeParsedQuery } from './search.parser';

export const searchRouter = Router();

searchRouter.use(authenticate);

const searchSchema = z.object({
  q:     z.string().min(1, 'La recherche ne peut pas être vide').max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const MODE = 'insensitive' as const;

/** Construit le filtre de date (issueDate / createdAt) depuis year/month */
function buildDateFilter(year: number | null, month: number | null) {
  if (!year && !month) return null;

  const now = new Date();
  const y = year ?? now.getFullYear();

  if (month) {
    // Plage exacte du mois
    const start = new Date(y, month - 1, 1);
    const end   = new Date(y, month, 1); // premier jour du mois suivant
    return { gte: start, lt: end };
  }

  // Toute l'année
  return {
    gte: new Date(y, 0, 1),
    lt:  new Date(y + 1, 0, 1),
  };
}

/** Construit le filtre de montant depuis les bornes parsées */
function buildAmountFilter(p: {
  amountGt:  number | null;
  amountGte: number | null;
  amountLt:  number | null;
  amountLte: number | null;
}) {
  const f: Record<string, number> = {};
  if (p.amountGt  !== null) f['gt']  = p.amountGt;
  if (p.amountGte !== null) f['gte'] = p.amountGte;
  if (p.amountLt  !== null) f['lt']  = p.amountLt;
  if (p.amountLte !== null) f['lte'] = p.amountLte;
  return Object.keys(f).length > 0 ? f : null;
}

// ── Route principale ──────────────────────────────────────────────────────────

searchRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, limit } = searchSchema.parse(req.query);
    const isAdmin      = req.user!.role === 'admin';

    // ── Parser ────────────────────────────────────────────────────────────────
    const parsed     = parseSearchQuery(q);
    const dateFilter = buildDateFilter(parsed.year, parsed.month);
    const amountF    = buildAmountFilter(parsed);
    const text       = parsed.text;
    const hasText    = text.length > 0;

    // Rien à chercher : pas de texte ET pas de filtre → erreur explicite
    if (!hasText && !parsed.hasFilters) {
      res.json({
        success: true,
        data: {
          parsed:     { description: '', filters: parsed },
          navigation: null,
          results:    { invoices: [], proformas: [], clients: [], products: [], users: [] },
        },
      });
      return;
    }

    // ── Requêtes parallèles ───────────────────────────────────────────────────

    const [invoices, proformas, clients, products, users] = await Promise.all([

      // ── Factures ────────────────────────────────────────────────────────────
      prisma.invoice.findMany({
        where: {
          deletedAt: null,
          // Filtre statut
          ...(parsed.invoiceStatuses.length > 0 && {
            status: { in: parsed.invoiceStatuses as any[] },
          }),
          // Filtre montant
          ...(amountF && { totalTtc: amountF }),
          // Filtre date
          ...(dateFilter && { issueDate: dateFilter }),
          // Texte OU numéro de document
          ...(hasText || parsed.documentNumber
            ? {
                OR: [
                  ...(hasText
                    ? [
                        { number:  { contains: text,               mode: MODE } },
                        { subject: { contains: text,               mode: MODE } },
                        { client:  { name: { contains: text,       mode: MODE } } },
                        { client:  { email: { contains: text,      mode: MODE } } },
                        { client:  { taxNumber: { contains: text,  mode: MODE } } },
                      ]
                    : []),
                  ...(parsed.documentNumber
                    ? [{ number: { contains: parsed.documentNumber, mode: MODE } }]
                    : []),
                ],
              }
            : {}),
        },
        select: {
          id:        true,
          number:    true,
          status:    true,
          type:      true,
          totalTtc:  true,
          issueDate:  true,
          dueDate:   true,
          client:    { select: { id: true, name: true } },
        },
        orderBy: { issueDate: 'desc' },
        take: limit,
      }),

      // ── Proformas ────────────────────────────────────────────────────────────
      prisma.proforma.findMany({
        where: {
          deletedAt: null,
          ...(parsed.proformaStatuses.length > 0 && {
            status: { in: parsed.proformaStatuses as any[] },
          }),
          ...(amountF && { totalTtc: amountF }),
          ...(dateFilter && { createdAt: dateFilter }),
          ...(hasText || parsed.documentNumber
            ? {
                OR: [
                  ...(hasText
                    ? [
                        { number:  { contains: text,              mode: MODE } },
                        { subject: { contains: text,              mode: MODE } },
                        { client:  { name: { contains: text,      mode: MODE } } },
                        { client:  { email: { contains: text,     mode: MODE } } },
                      ]
                    : []),
                  ...(parsed.documentNumber
                    ? [{ number: { contains: parsed.documentNumber, mode: MODE } }]
                    : []),
                ],
              }
            : {}),
        },
        select: {
          id:       true,
          number:   true,
          status:   true,
          totalTtc: true,
          createdAt: true,
          validUntil: true,
          client:   { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),

      // ── Clients ──────────────────────────────────────────────────────────────
      // Les filtres de statut/montant/date ne s'appliquent pas aux clients
      hasText
        ? prisma.client.findMany({
            where: {
              deletedAt: null,
              OR: [
                { name:       { contains: text, mode: MODE } },
                { email:      { contains: text, mode: MODE } },
                { taxNumber:  { contains: text, mode: MODE } },
                { rccm:       { contains: text, mode: MODE } },
                { phone:      { contains: text, mode: MODE } },
                { city:       { contains: text, mode: MODE } },
              ],
            },
            select: {
              id:      true,
              name:    true,
              email:   true,
              phone:   true,
              city:    true,
              type:    true,
              status:  true,
            },
            orderBy: { name: 'asc' },
            take: limit,
          })
        : Promise.resolve([]),

      // ── Produits ─────────────────────────────────────────────────────────────
      hasText
        ? prisma.product.findMany({
            where: {
              deletedAt: null,
              OR: [
                { name:        { contains: text, mode: MODE } },
                { reference:   { contains: text, mode: MODE } },
                { description: { contains: text, mode: MODE } },
              ],
            },
            select: {
              id:          true,
              name:        true,
              reference:   true,
              unitPriceHt: true,
              type:        true,
              unit:        true,
            },
            orderBy: { name: 'asc' },
            take: limit,
          })
        : Promise.resolve([]),

      // ── Utilisateurs (admin uniquement) ──────────────────────────────────────
      isAdmin && hasText
        ? prisma.user.findMany({
            where: {
              deletedAt: null,
              OR: [
                { firstName: { contains: text, mode: MODE } },
                { lastName:  { contains: text, mode: MODE } },
                { email:     { contains: text, mode: MODE } },
              ],
            },
            select: {
              id:        true,
              firstName: true,
              lastName:  true,
              email:     true,
              role:      true,
              status:    true,
            },
            orderBy: { lastName: 'asc' },
            take: limit,
          })
        : Promise.resolve([]),
    ]);

    // ── Navigation directe ────────────────────────────────────────────────────
    // Si un numéro de document exact est trouvé, retourner un hint de navigation
    let navigation: { type: string; id: string; number: string } | null = null;

    if (parsed.documentNumber) {
      const exactInvoice = invoices.find(
        (i: { number: string }) => i.number.toUpperCase() === parsed.documentNumber
      ) as (typeof invoices)[0] | undefined;
      if (exactInvoice) {
        navigation = { type: 'invoice', id: exactInvoice.id, number: exactInvoice.number };
      } else {
        const exactProforma = proformas.find(
          (p: { number: string }) => p.number.toUpperCase() === parsed.documentNumber
        ) as (typeof proformas)[0] | undefined;
        if (exactProforma) {
          navigation = { type: 'proforma', id: exactProforma.id, number: exactProforma.number };
        }
      }
    }

    // ── Réponse ───────────────────────────────────────────────────────────────
    res.json({
      success: true,
      data: {
        /** Interprétation lisible de la requête (affichable dans l'UI) */
        parsed: {
          description: describeParsedQuery(parsed),
          text:              parsed.text || null,
          documentNumber:    parsed.documentNumber,
          invoiceStatuses:   parsed.invoiceStatuses.length  > 0 ? parsed.invoiceStatuses  : null,
          proformaStatuses:  parsed.proformaStatuses.length > 0 ? parsed.proformaStatuses : null,
          amountGt:          parsed.amountGt,
          amountGte:         parsed.amountGte,
          amountLt:          parsed.amountLt,
          amountLte:         parsed.amountLte,
          year:              parsed.year,
          month:             parsed.month,
        },
        /** Navigation directe si numéro exact détecté */
        navigation,
        /** Résultats par catégorie */
        results: {
          invoices,
          proformas,
          clients,
          products,
          users,
        },
        /** Nombre total de résultats toutes catégories confondues */
        total: invoices.length + proformas.length + clients.length + products.length + users.length,
      },
    });
  } catch (err) {
    next(err);
  }
});
