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
import { searchController } from './search.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';

export const searchRouter: ReturnType<typeof Router> = Router();

searchRouter.use(authenticate, authorizePermission('search:read'));

searchRouter.get('/', searchController.search.bind(searchController));
