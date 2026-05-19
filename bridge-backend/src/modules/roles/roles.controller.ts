import { Request, Response, NextFunction } from 'express';
import * as service from './roles.service';
import { createRoleSchema, updateRoleSchema } from './roles.schema';

export async function listRoles(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listRoles();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getRole(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getRoleById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createRole(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createRoleSchema.parse(req.body);
    const data = await service.createRole(input, req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateRole(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateRoleSchema.parse(req.body);
    const data = await service.updateRole(String(req.params['id']), input);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteRole(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteRole(String(req.params['id']));
    res.json({ success: true, message: 'Rôle supprimé' });
  } catch (err) { next(err); }
}

export async function listPermissions(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: service.ALL_PERMISSIONS });
  } catch (err) { next(err); }
}
