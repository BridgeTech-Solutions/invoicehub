import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';
import * as ctrl from './stock.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/movements',            authorizePermission('stock:read'),   ctrl.listMovements);
router.get('/movements/:id',        authorizePermission('stock:read'),   ctrl.getMovement);
router.post('/movements/adjust',    authorizePermission('stock:adjust'), auditMiddleware('stock_movement', 'CREATE'), ctrl.adjust);

router.get('/levels',               authorizePermission('stock:read'),   ctrl.getStockLevels);
router.get('/levels/:productId',    authorizePermission('stock:read'),   ctrl.getProductHistory);
router.get('/alerts',               authorizePermission('stock:read'),   ctrl.getAlerts);

export default router;
