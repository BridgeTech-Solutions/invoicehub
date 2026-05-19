import { Router } from 'express';
import { clientsController } from './clients.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.get('/',        authorizePermission('clients:read'),   clientsController.list.bind(clientsController));
router.post('/',       authorizePermission('clients:create'), auditMiddleware('client', 'CREATE'), clientsController.create.bind(clientsController));
// Import en masse — réservé aux admins et commerciaux
router.post('/import', authorizePermission('clients:create'), auditMiddleware('client', 'CREATE'), clientsController.importClients.bind(clientsController));
router.get('/:id',            authorizePermission('clients:read'),   clientsController.findById.bind(clientsController));
router.put('/:id',            authorizePermission('clients:update'), auditMiddleware('client', 'UPDATE'), clientsController.update.bind(clientsController));
router.delete('/:id',         authorizePermission('clients:delete'), auditMiddleware('client', 'SOFT_DELETE'), clientsController.archive.bind(clientsController));
router.get('/:id/quick-fill', authorizePermission('clients:read'),   clientsController.quickFill.bind(clientsController));
router.get('/:id/summary',    authorizePermission('clients:read'),   clientsController.getSummary.bind(clientsController));
router.get('/:id/risk-score', authorizePermission('clients:read'),   clientsController.getRiskScore.bind(clientsController));

export { router as clientsRouter };
