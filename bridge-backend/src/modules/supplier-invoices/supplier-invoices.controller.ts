import { Request, Response, NextFunction } from 'express';
import * as service from './supplier-invoices.service';
import {
  createSupplierInvoiceSchema, updateSupplierInvoiceSchema,
  paySupplierInvoiceSchema, disputeSchema,
} from './supplier-invoices.schema';

function pagination(req: Request) {
  return {
    page: Math.max(1, parseInt(String(req.query['page'] ?? '1'))),
    limit: Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20')))),
  };
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { data, total } = await service.listSupplierInvoices({
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
    const data = await service.getSupplierInvoiceById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createSupplierInvoiceSchema.parse(req.body);
    const data = await service.createSupplierInvoice(input, req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateSupplierInvoiceSchema.parse(req.body);
    const data = await service.updateSupplierInvoice(String(req.params['id']), input, req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteSupplierInvoice(String(req.params['id']));
    res.json({ success: true, message: 'Facture fournisseur supprimée' });
  } catch (err) { next(err); }
}

export async function validate(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.validateSupplierInvoice(String(req.params['id']), req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function dispute(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = disputeSchema.parse(req.body);
    const data = await service.disputeSupplierInvoice(String(req.params['id']), req.user!.id, reason);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function pay(req: Request, res: Response, next: NextFunction) {
  try {
    const input = paySupplierInvoiceSchema.parse(req.body);
    const data = await service.paySupplierInvoice(String(req.params['id']), input, req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function listPayments(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listSupplierPayments(String(req.params['id']));
    res.json({ success: true, data });
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
