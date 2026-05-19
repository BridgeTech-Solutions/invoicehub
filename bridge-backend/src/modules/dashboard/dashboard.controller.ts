import { Request, Response, NextFunction } from 'express';
import { dashboardService } from './dashboard.service';

export class DashboardController {
  async getKpis(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardService.getKpis();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async getAging(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardService.getAging();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async getCashflow(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardService.getCashflowForecast();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
}

export const dashboardController = new DashboardController();
