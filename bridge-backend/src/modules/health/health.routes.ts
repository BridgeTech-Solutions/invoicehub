import { Router } from 'express';

const router: ReturnType<typeof Router> = Router();

/**
 * GET /api/health
 * Endpoint de santé simple — utilisé par les load balancers et scripts de démarrage.
 * Retourne 200 si l'API est disponible.
 */
router.get('/', (_req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

export { router as healthRouter };
