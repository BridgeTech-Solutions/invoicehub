import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { AppError } from '../../core/errors/AppError';

export const officesRouter = Router();

officesRouter.use(authenticate);

const createSchema = z.object({
  code:      z.string().min(1).max(10).transform(v => v.toUpperCase()),
  name:      z.string().min(1).max(255),
  city:      z.string().max(100).optional(),
  address:   z.string().optional(),
  isDefault: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

/** GET /api/offices */
officesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await prisma.agencyOffice.findMany({
      where: { deletedAt: null },
      orderBy: { isDefault: 'desc' },
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/** GET /api/offices/:id */
officesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await prisma.agencyOffice.findFirst({ where: { id: req.params['id']!, deletedAt: null } });
    if (!data) throw AppError.notFound('Bureau introuvable');
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/** POST /api/offices — admin uniquement */
officesRouter.post('/', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);

    if (input.isDefault) {
      await prisma.agencyOffice.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const data = await prisma.agencyOffice.create({ data: input });
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

/** PUT /api/offices/:id — admin uniquement */
officesRouter.put('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.agencyOffice.findFirst({ where: { id: req.params['id']!, deletedAt: null } });
    if (!existing) throw AppError.notFound('Bureau introuvable');

    if (input.isDefault) {
      await prisma.agencyOffice.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const data = await prisma.agencyOffice.update({ where: { id: req.params['id']! }, data: input });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/** DELETE /api/offices/:id — soft delete — admin uniquement */
officesRouter.delete('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.agencyOffice.findFirst({ where: { id: req.params['id']!, deletedAt: null } });
    if (!existing) throw AppError.notFound('Bureau introuvable');
    if (existing.isDefault) throw AppError.badRequest('Impossible de supprimer le bureau par défaut');

    await prisma.agencyOffice.update({ where: { id: req.params['id']! }, data: { deletedAt: new Date(), isActive: false } });
    res.json({ success: true, message: 'Bureau supprimé' });
  } catch (err) { next(err); }
});
