import { Router } from 'express';
import { productsController } from './products.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';

const categoriesRouter: ReturnType<typeof Router> = Router();
const productsRouter: ReturnType<typeof Router> = Router();

categoriesRouter.use(authenticate);
productsRouter.use(authenticate);

// Categories
categoriesRouter.get('/', productsController.listCategories.bind(productsController));
categoriesRouter.get('/:id', productsController.findCategoryById.bind(productsController));
categoriesRouter.post('/', authorizePermission('products:create'), productsController.createCategory.bind(productsController));
categoriesRouter.put('/:id', authorizePermission('products:update'), productsController.updateCategory.bind(productsController));
categoriesRouter.delete('/:id', authorizePermission('products:delete'), productsController.deleteCategory.bind(productsController));

// Products
productsRouter.get('/', productsController.list.bind(productsController));
// ⚠️ Routes statiques AVANT /:id pour éviter les conflits
productsRouter.post('/import', authorizePermission('products:create'), auditMiddleware('product', 'CREATE'), productsController.importProducts.bind(productsController));
productsRouter.get('/:id/line-defaults', productsController.lineDefaults.bind(productsController));
productsRouter.get('/:id', productsController.findById.bind(productsController));
productsRouter.post('/', authorizePermission('products:create'), productsController.create.bind(productsController));
productsRouter.put('/:id', authorizePermission('products:update'), productsController.update.bind(productsController));
productsRouter.delete('/:id', authorizePermission('products:delete'), productsController.delete.bind(productsController));

export { categoriesRouter, productsRouter };
