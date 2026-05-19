import { Router } from 'express';
import { taxRatesController } from './tax-rates.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';

export const taxRatesRouter: ReturnType<typeof Router> = Router();

taxRatesRouter.use(authenticate);

taxRatesRouter.get('/',    taxRatesController.list.bind(taxRatesController));
taxRatesRouter.get('/:id', taxRatesController.findById.bind(taxRatesController));
taxRatesRouter.post('/',   authorizePermission('settings:update'), taxRatesController.create.bind(taxRatesController));
taxRatesRouter.put('/:id', authorizePermission('settings:update'), taxRatesController.update.bind(taxRatesController));
taxRatesRouter.delete('/:id', authorizePermission('settings:update'), taxRatesController.delete.bind(taxRatesController));
