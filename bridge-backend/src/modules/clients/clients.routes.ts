import { Router } from 'express';
import { clientsController } from './clients.controller';
import { authenticate } from '../../core/middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', clientsController.list.bind(clientsController));
router.post('/', clientsController.create.bind(clientsController));
router.get('/:id', clientsController.findById.bind(clientsController));
router.put('/:id', clientsController.update.bind(clientsController));
router.delete('/:id', clientsController.archive.bind(clientsController));
router.get('/:id/summary', clientsController.getSummary.bind(clientsController));

export { router as clientsRouter };
