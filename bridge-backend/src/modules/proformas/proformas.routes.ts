import { Router } from 'express';
import { proformasController } from './proformas.controller';
import { authenticate } from '../../core/middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', proformasController.list.bind(proformasController));
router.post('/', proformasController.create.bind(proformasController));
router.get('/:id', proformasController.findById.bind(proformasController));
router.put('/:id', proformasController.update.bind(proformasController));
router.delete('/:id', proformasController.delete.bind(proformasController));
router.post('/:id/send', proformasController.send.bind(proformasController));
router.post('/:id/accept', proformasController.accept.bind(proformasController));
router.post('/:id/reject', proformasController.reject.bind(proformasController));
router.post('/:id/convert', proformasController.convert.bind(proformasController));
router.get('/:id/pdf', proformasController.getPdf.bind(proformasController));

export { router as proformasRouter };
