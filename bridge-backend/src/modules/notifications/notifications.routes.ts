import { Router } from 'express';
import { notificationsController } from './notifications.controller';
import { authenticate } from '../../core/middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', notificationsController.list.bind(notificationsController));
router.put('/read-all', notificationsController.markAllRead.bind(notificationsController));
router.get('/settings', notificationsController.getSettings.bind(notificationsController));
router.put('/settings', notificationsController.updateSettings.bind(notificationsController));
router.put('/:id/read', notificationsController.markRead.bind(notificationsController));

export { router as notificationsRouter };
