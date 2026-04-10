import { Router } from 'express';
import { taxRatesController } from './tax-rates.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';

export const taxRatesRouter: ReturnType<typeof Router> = Router();

taxRatesRouter.use(authenticate);

taxRatesRouter.get('/',    taxRatesController.list.bind(taxRatesController));
taxRatesRouter.get('/:id', taxRatesController.findById.bind(taxRatesController));
taxRatesRouter.post('/',   authorize('admin'), taxRatesController.create.bind(taxRatesController));
taxRatesRouter.put('/:id', authorize('admin'), taxRatesController.update.bind(taxRatesController));
taxRatesRouter.delete('/:id', authorize('admin'), taxRatesController.delete.bind(taxRatesController));
