import { Request, Response, NextFunction } from 'express';
import { productsService } from './products.service';
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
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async findCategoryById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await productsService.findCategoryById(req.params['id']!);
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
      const data = await productsService.updateCategory(req.params['id']!, input);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await productsService.deleteCategory(req.params['id']!);
      res.json({ success: true, message: 'Catégorie supprimée' });
    } catch (err) {
      next(err);
    }
  }

  // Products
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listProductsSchema.parse(req.query);
      const result = await productsService.list(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await productsService.findById(req.params['id']!);
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
      const data = await productsService.update(req.params['id']!, input);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await productsService.softDelete(req.params['id']!);
      res.json({ success: true, message: 'Produit désactivé' });
    } catch (err) {
      next(err);
    }
  }
}

export const productsController = new ProductsController();
