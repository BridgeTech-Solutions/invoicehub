import { Request, Response, NextFunction } from 'express';
import * as service from './purchase-orders.service';
import {
  createPurchaseOrderSchema, updatePurchaseOrderSchema,
  receiveLineSchema, computeSchema,
} from './purchase-orders.schema';

function pagination(req: Request) {
  return {
    page: Math.max(1, parseInt(String(req.query['page'] ?? '1'))),
    limit: Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20')))),
  };
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { data, total } = await service.listPurchaseOrders({
      page, limit,
      search: req.query['search'] as string | undefined,
      status: req.query['status'] as string | undefined,
      supplierId: req.query['supplierId'] as string | undefined,
      dateFrom: req.query['dateFrom'] as string | undefined,
      dateTo: req.query['dateTo'] as string | undefined,
    });
    res.json({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
}

export async function findById(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getPurchaseOrderById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createPurchaseOrderSchema.parse(req.body);
    const data = await service.createPurchaseOrder(input, req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updatePurchaseOrderSchema.parse(req.body);
    const data = await service.updatePurchaseOrder(String(req.params['id']), input, req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deletePurchaseOrder(String(req.params['id']));
    res.json({ success: true, message: 'Bon de commande supprimé' });
  } catch (err) { next(err); }
}

export async function send(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.sendPurchaseOrder(String(req.params['id']), req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.confirmPurchaseOrder(String(req.params['id']), req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function receive(req: Request, res: Response, next: NextFunction) {
  try {
    const input = receiveLineSchema.parse(req.body);
    const data = await service.receivePurchaseOrder(String(req.params['id']), input, req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.cancelPurchaseOrder(String(req.params['id']), req.user!.id, req.body?.comment);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function compute(req: Request, res: Response, next: NextFunction) {
  try {
    const { lines } = computeSchema.parse(req.body);
    const result = service.computeDryRun(lines);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { buffer, filename } = await service.generatePdfResponse(String(req.params['id']));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) { next(err); }
}
