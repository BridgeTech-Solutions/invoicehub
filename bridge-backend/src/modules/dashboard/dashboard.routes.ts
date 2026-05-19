import { Router } from 'express';
import { dashboardController } from './dashboard.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate, authorizePermission('dashboard:read'));

router.get('/kpis',     dashboardController.getKpis.bind(dashboardController));
router.get('/aging',    dashboardController.getAging.bind(dashboardController));
router.get('/cashflow', dashboardController.getCashflow.bind(dashboardController));

export { router as dashboardRouter };
