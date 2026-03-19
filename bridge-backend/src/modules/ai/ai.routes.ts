import { Router } from 'express';
import { aiController } from './ai.controller';
import { authenticate } from '../../core/middleware/auth';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.get('/status', aiController.status.bind(aiController));
router.post('/chat', aiController.chatHandler.bind(aiController));

export { router as aiRouter };
