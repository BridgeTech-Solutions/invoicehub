import { Request, Response, NextFunction } from 'express';
import { productsService } from './products.service';
import { sendCsvResponse } from '../../lib/csv';
import {
  createCategorySchema,
  updateCategorySchema,
  createProductSchema,
  updateProductSchema,
  listProductsSchema,
} from './products.schema';

export class ProductsController {
  // Categories
  async listCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await productsService.listCategories();

      if (req.query['export'] === 'csv') {
        return sendCsvResponse(res, 'categories.csv',
          ['Nom', 'Description', 'Ordre'],
          data.map(c => [c.name, c.description ?? '', c.sortOrder ?? '']),
        );
      }

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async findCategoryById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await productsService.findCategoryById(req.params['id'] as string);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createCategorySchema.parse(req.body);
      const data = await productsService.createCategory(input, req.user!.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateCategorySchema.parse(req.body);
      const data = await productsService.updateCategory(req.params['id'] as string, input);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await productsService.deleteCategory(req.params['id'] as string);
      res.json({ success: true, message: 'Catégorie supprimée' });
    } catch (err) {
      next(err);
    }
  }

  // Products
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listProductsSchema.parse(req.query);

      if (req.query['export'] === 'csv') {
        const { data } = await productsService.list({ ...query, page: 1, limit: 10_000 });
        return sendCsvResponse(res, 'produits.csv',
          ['Référence', 'Désignation', 'Catégorie', 'Prix HT', 'TVA %', 'Unité', 'Actif'],
          data.map(p => [
            p.reference ?? '',
            p.name,
            (p.category as { name: string } | null)?.name ?? '',
            Number(p.unitPriceHt),
            Number(p.taxRateValue),
            p.unit ?? '',
            p.isActive ? 'Oui' : 'Non',
          ]),
        );
      }

      const result = await productsService.list(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await productsService.findById(req.params['id'] as string);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async lineDefaults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientId = typeof req.query['clientId'] === 'string' ? req.query['clientId'] : undefined;
      const data = await productsService.lineDefaults(req.params['id'] as string, clientId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createProductSchema.parse(req.body);
      const data = await productsService.create(input, req.user!.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateProductSchema.parse(req.body);
      const data = await productsService.update(req.params['id'] as string, input);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await productsService.softDelete(req.params['id'] as string);
      res.json({ success: true, message: 'Produit désactivé' });
    } catch (err) {
      next(err);
    }
  }
}

export const productsController = new ProductsController();
