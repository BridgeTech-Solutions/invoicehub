import { Request, Response, NextFunction } from 'express';
import * as service from './stock.service';
import { adjustStockSchema } from './stock.schema';

function pagination(req: Request) {
  return {
    page: Math.max(1, parseInt(String(req.query['page'] ?? '1'))),
    limit: Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20')))),
  };
}

export async function listMovements(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { data, total } = await service.listMovements({
      page, limit,
      productId: req.query['productId'] as string | undefined,
      type: req.query['type'] as string | undefined,
      dateFrom: req.query['dateFrom'] as string | undefined,
      dateTo: req.query['dateTo'] as string | undefined,
    });
    res.json({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
}

export async function getMovement(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getMovementById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function adjust(req: Request, res: Response, next: NextFunction) {
  try {
    const input = adjustStockSchema.parse(req.body);
    const data = await service.adjustStock(input, req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getStockLevels(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const data = await service.getStockLevels({
      page, limit,
      search: req.query['search'] as string | undefined,
      lowStock: req.query['lowStock'] === 'true',
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getProductHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { data, total } = await service.getProductStockHistory(String(req.params['productId']), { page, limit });
    res.json({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
}

export async function getAlerts(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getStockAlerts();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
