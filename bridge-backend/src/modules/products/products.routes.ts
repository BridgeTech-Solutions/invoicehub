import { Router } from 'express';
import { productsController } from './products.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';

const categoriesRouter = Router();
const productsRouter = Router();

categoriesRouter.use(authenticate);
productsRouter.use(authenticate);

// Categories
categoriesRouter.get('/', productsController.listCategories.bind(productsController));
categoriesRouter.get('/:id', productsController.findCategoryById.bind(productsController));
categoriesRouter.post('/', authorize('admin'), productsController.createCategory.bind(productsController));
categoriesRouter.put('/:id', authorize('admin'), productsController.updateCategory.bind(productsController));
categoriesRouter.delete('/:id', authorize('admin'), productsController.deleteCategory.bind(productsController));

// Products
productsRouter.get('/', productsController.list.bind(productsController));
// ⚠️ Routes statiques AVANT /:id pour éviter les conflits
productsRouter.get('/:id/line-defaults', productsController.lineDefaults.bind(productsController));
productsRouter.get('/:id', productsController.findById.bind(productsController));
productsRouter.post('/', authorize('admin', 'commercial'), productsController.create.bind(productsController));
productsRouter.put('/:id', authorize('admin', 'commercial'), productsController.update.bind(productsController));
productsRouter.delete('/:id', authorize('admin'), productsController.delete.bind(productsController));

export { categoriesRouter, productsRouter };
