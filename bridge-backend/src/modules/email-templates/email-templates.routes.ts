import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { AppError } from '../../core/errors/AppError';

export const emailTemplatesRouter: ReturnType<typeof Router> = Router();

emailTemplatesRouter.use(authenticate, authorize('admin'));

const updateSchema = z.object({
  name:      z.string().min(1).max(255).optional(),
  subject:   z.string().min(1).max(500).optional(),
  bodyHtml:  z.string().min(1).optional(),
  isActive:  z.boolean().optional(),
});

/** GET /api/email-templates */
emailTemplatesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await prisma.emailTemplate.findMany({ orderBy: { type: 'asc' } });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/** GET /api/email-templates/:id */
emailTemplatesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await prisma.emailTemplate.findFirst({
      where: { id: req.params['id'] as string },
    });
    if (!data) throw AppError.notFound('Template introuvable');
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/** PUT /api/email-templates/:id
 *  Les templates sont créés via seed/migration, pas via l'API.
 *  L'admin peut uniquement modifier le contenu (subject, bodyHtml, isActive).
 */
emailTemplatesRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.emailTemplate.findFirst({ where: { id: req.params['id'] as string } });
    if (!existing) throw AppError.notFound('Template introuvable');

    const data = await prisma.emailTemplate.update({ where: { id: req.params['id'] as string }, data: input });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/** POST /api/email-templates/:id/preview
 *  Renvoie le HTML du template avec des variables d'exemple substituées.
 */
emailTemplatesRouter.post('/:id/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await prisma.emailTemplate.findFirst({ where: { id: req.params['id'] as string } });
    if (!template) throw AppError.notFound('Template introuvable');

    const vars: Record<string, string> = req.body ?? {};
    let html = template.bodyHtml;
    for (const [key, value] of Object.entries(vars)) {
      html = html.replaceAll(`{{${key}}}`, value);
    }

    res.json({ success: true, data: { subject: template.subject, html } });
  } catch (err) { next(err); }
});
