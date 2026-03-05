import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';

const router = Router();

router.use(authenticate);

router.get('/me', usersController.me.bind(usersController));
router.put('/me/password', usersController.changePassword.bind(usersController));

router.get('/', authorize('admin'), usersController.list.bind(usersController));
router.post('/', authorize('admin'), usersController.create.bind(usersController));
router.get('/:id', authorize('admin'), usersController.findById.bind(usersController));
router.put('/:id', authorize('admin'), usersController.update.bind(usersController));
router.delete('/:id', authorize('admin'), usersController.delete.bind(usersController));

export { router as usersRouter };
