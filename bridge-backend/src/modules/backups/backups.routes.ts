import { Router } from 'express';
import { backupsController } from './backups.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { rateLimitByUser } from '../../core/middleware/rateLimitByUser';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate, authorizePermission('backups:manage'));

// 3 backups manuels par heure par utilisateur
const backupRateLimit = rateLimitByUser({
  max: 3,
  windowMs: 60 * 60 * 1000,
  message: 'Limite de 3 backups manuels par heure atteinte.',
});

router.post('/',               backupRateLimit, backupsController.trigger.bind(backupsController));
router.get('/',                                 backupsController.list.bind(backupsController));
router.get('/:id',                              backupsController.findById.bind(backupsController));
router.get('/:id/download',                     backupsController.download.bind(backupsController));
router.delete('/:id',                           backupsController.delete.bind(backupsController));

export { router as backupsRouter };
