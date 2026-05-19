import { Router } from 'express';
import { notificationsController } from './notifications.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);
router.use(authorizePermission('notifications:read'));

router.get('/',                     notificationsController.list.bind(notificationsController));
router.put('/read-all',             notificationsController.markAllRead.bind(notificationsController));
router.get('/settings',             notificationsController.getSettings.bind(notificationsController));
router.put('/settings',             notificationsController.updateSettings.bind(notificationsController));
router.put('/settings/disable-all', notificationsController.disableAll.bind(notificationsController));
router.put('/settings/enable-all',  notificationsController.enableAll.bind(notificationsController));
router.put('/:id/read',             notificationsController.markRead.bind(notificationsController));

export { router as notificationsRouter };
