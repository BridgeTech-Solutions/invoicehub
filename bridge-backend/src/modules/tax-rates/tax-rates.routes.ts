import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { AppError } from '../../core/errors/AppError';

export const taxRatesRouter: ReturnType<typeof Router> = Router();

taxRatesRouter.use(authenticate);

const createSchema = z.object({
  name:        z.string().min(1).max(100),
  code:        z.string().min(1).max(20),
  rate:        z.number().min(0).max(100),
  description: z.string().optional(),
  isDefault:   z.boolean().optional(),
});

const updateSchema = createSchema.partial();

/** GET /api/tax-rates — Liste tous les taux (actifs par défaut) */
taxRatesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeInactive = req.query['includeInactive'] === 'true';
    const data = await prisma.taxRate.findMany({
      where: { ...(includeInactive ? {} : { isActive: true }), deletedAt: null },
      orderBy: { rate: 'asc' },
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/** GET /api/tax-rates/:id */
taxRatesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await prisma.taxRate.findFirst({ where: { id: req.params['id'] as string, deletedAt: null } });
    if (!data) throw AppError.notFound('Taux de taxe introuvable');
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/** POST /api/tax-rates — admin uniquement */
taxRatesRouter.post('/', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);

    // Si ce taux devient le défaut, retirer le défaut actuel
    if (input.isDefault) {
      await prisma.taxRate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const data = await prisma.taxRate.create({ data: input });
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

/** PUT /api/tax-rates/:id — admin uniquement */
taxRatesRouter.put('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.taxRate.findFirst({ where: { id: req.params['id'] as string, deletedAt: null } });
    if (!existing) throw AppError.notFound('Taux de taxe introuvable');

    if (input.isDefault) {
      await prisma.taxRate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const data = await prisma.taxRate.update({ where: { id: req.params['id'] as string }, data: input });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/** DELETE /api/tax-rates/:id — soft delete — admin uniquement */
taxRatesRouter.delete('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.taxRate.findFirst({ where: { id: req.params['id'] as string, deletedAt: null } });
    if (!existing) throw AppError.notFound('Taux de taxe introuvable');
    if (existing.isDefault) throw AppError.badRequest('Impossible de supprimer le taux par défaut');

    await prisma.taxRate.update({ where: { id: req.params['id'] as string }, data: { deletedAt: new Date(), isActive: false } });
    res.json({ success: true, message: 'Taux de taxe supprimé' });
  } catch (err) { next(err); }
});
