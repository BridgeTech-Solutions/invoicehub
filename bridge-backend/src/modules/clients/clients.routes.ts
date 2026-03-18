import { Router } from 'express';
import { clientsController } from './clients.controller';
import { authenticate } from '../../core/middleware/auth';
import { auditMiddleware } from '../../core/middleware/audit';

const router = Router();

router.use(authenticate);

router.get('/', clientsController.list.bind(clientsController));
router.post('/', auditMiddleware('client', 'CREATE'), clientsController.create.bind(clientsController));
router.get('/:id', clientsController.findById.bind(clientsController));
router.put('/:id', auditMiddleware('client', 'UPDATE'), clientsController.update.bind(clientsController));
router.delete('/:id', auditMiddleware('client', 'SOFT_DELETE'), clientsController.archive.bind(clientsController));
router.get('/:id/quick-fill', clientsController.quickFill.bind(clientsController));
router.get('/:id/summary', clientsController.getSummary.bind(clientsController));

export { router as clientsRouter };
