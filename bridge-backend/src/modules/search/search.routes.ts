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
import { Router } from 'express';
import { z } from 'zod';
import { searchService } from './search.service';
import { authenticate } from '../../core/middleware/auth';

export const searchRouter: ReturnType<typeof Router> = Router();

searchRouter.use(authenticate);

const searchSchema = z.object({
  q:     z.string().min(1, 'La recherche ne peut pas être vide').max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

searchRouter.get('/', async (req, res, next) => {
  try {
    const { q, limit } = searchSchema.parse(req.query);
    const isAdmin      = req.user!.role === 'admin';
    const data         = await searchService.search(q, limit, isAdmin);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});
