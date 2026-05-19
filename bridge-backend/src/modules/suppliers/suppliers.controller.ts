import { Request, Response, NextFunction } from 'express';
import * as service from './suppliers.service';
import {
  createSupplierSchema, updateSupplierSchema,
  createContactSchema, updateContactSchema,
} from './suppliers.schema';

function pagination(req: Request) {
  return {
    page: Math.max(1, parseInt(String(req.query['page'] ?? '1'))),
    limit: Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20')))),
  };
}

export async function listSuppliers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { data, total } = await service.listSuppliers({
      page, limit,
      search: req.query['search'] as string | undefined,
      status: req.query['status'] as string | undefined,
      category: req.query['category'] as string | undefined,
    });
    res.json({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
}

export async function getSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getSupplierById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createSupplierSchema.parse(req.body);
    const data = await service.createSupplier(input, req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateSupplierSchema.parse(req.body);
    const data = await service.updateSupplier(String(req.params['id']), input);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteSupplier(String(req.params['id']));
    res.json({ success: true, message: 'Fournisseur supprimé' });
  } catch (err) { next(err); }
}

export async function listContacts(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listContacts(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function addContact(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createContactSchema.parse(req.body);
    const data = await service.addContact(String(req.params['id']), input);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateContact(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateContactSchema.parse(req.body);
    const data = await service.updateContact(String(req.params['id']), String(req.params['contactId']), input);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteContact(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteContact(String(req.params['id']), String(req.params['contactId']));
    res.json({ success: true, message: 'Contact supprimé' });
  } catch (err) { next(err); }
}

export async function getSupplierPurchaseOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { data, total } = await service.getSupplierPurchaseOrders(String(req.params['id']), { page, limit });
    res.json({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
}

export async function getSupplierInvoices(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { data, total } = await service.getSupplierInvoices(String(req.params['id']), { page, limit });
    res.json({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
}

export async function getFinancialSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getFinancialSummary(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
