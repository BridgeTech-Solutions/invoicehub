import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { searchService } from './search.service';

const searchSchema = z.object({
  q:     z.string().min(1, 'La recherche ne peut pas être vide').max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export class SearchController {
  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q, limit } = searchSchema.parse(req.query);
      const isAdmin = req.user!.roleName === 'admin';
      const data    = await searchService.search(q, limit, isAdmin);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
}

export const searchController = new SearchController();
