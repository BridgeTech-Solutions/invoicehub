import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import * as ctrl from './roles.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/permissions', authorizePermission('roles:read'), ctrl.listPermissions);
router.get('/', authorizePermission('roles:read'), ctrl.listRoles);
router.post('/', authorizePermission('roles:manage'), ctrl.createRole);
router.get('/:id', authorizePermission('roles:read'), ctrl.getRole);
router.put('/:id', authorizePermission('roles:manage'), ctrl.updateRole);
router.delete('/:id', authorizePermission('roles:manage'), ctrl.deleteRole);

export default router;
