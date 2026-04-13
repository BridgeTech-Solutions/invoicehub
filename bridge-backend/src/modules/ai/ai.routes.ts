import { Router } from 'express';
import { aiController } from './ai.controller';
import { authenticate } from '../../core/middleware/auth';
import { rateLimitByUser } from '../../core/middleware/rateLimitByUser';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.get('/status', aiController.status.bind(aiController));
router.post(
  '/chat',
  rateLimitByUser({ max: 20, windowMs: 60_000, message: 'Trop de messages. Attendez 1 minute avant de réessayer.' }),
  aiController.chatHandler.bind(aiController),
);

export { router as aiRouter };
