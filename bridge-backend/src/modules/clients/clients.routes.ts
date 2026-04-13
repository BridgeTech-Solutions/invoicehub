import { Router } from 'express';
import { clientsController } from './clients.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.get('/', clientsController.list.bind(clientsController));
router.post('/', auditMiddleware('client', 'CREATE'), clientsController.create.bind(clientsController));
// Import en masse — réservé aux admins et commerciaux
router.post('/import', authorize('admin', 'commercial'), auditMiddleware('client', 'CREATE'), clientsController.importClients.bind(clientsController));
router.get('/:id', clientsController.findById.bind(clientsController));
router.put('/:id', auditMiddleware('client', 'UPDATE'), clientsController.update.bind(clientsController));
router.delete('/:id', authorize('admin', 'commercial'), auditMiddleware('client', 'SOFT_DELETE'), clientsController.archive.bind(clientsController));
router.get('/:id/quick-fill', clientsController.quickFill.bind(clientsController));
router.get('/:id/summary', clientsController.getSummary.bind(clientsController));
router.get('/:id/risk-score', clientsController.getRiskScore.bind(clientsController));

export { router as clientsRouter };
