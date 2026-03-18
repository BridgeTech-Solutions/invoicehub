import { Router, Request, Response, NextFunction } from 'express';
import { dashboardService } from './dashboard.service';
import { authenticate } from '../../core/middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/kpis', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await dashboardService.getKpis();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/aging', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await dashboardService.getAging();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export { router as dashboardRouter };
