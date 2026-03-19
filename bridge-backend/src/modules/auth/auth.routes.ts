import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../core/middleware/auth';

const router: ReturnType<typeof Router> = Router();

// Routes publiques
router.post('/login', authController.login.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));
router.post('/logout', authController.logout.bind(authController));
router.post('/forgot-password', authController.forgotPassword.bind(authController));
router.post('/reset-password', authController.resetPassword.bind(authController));

// Routes protégées (nécessitent d'être connecté)
router.post('/2fa/enable', authenticate, authController.enableTwoFactor.bind(authController));
router.post('/2fa/verify', authenticate, authController.verifyTwoFactor.bind(authController));
router.post('/2fa/disable', authenticate, authController.disableTwoFactor.bind(authController));
router.post('/2fa/backup-codes', authenticate, authController.regenerateBackupCodes.bind(authController));

// Gestion des sessions
router.get('/sessions', authenticate, authController.listSessions.bind(authController));
router.delete('/sessions', authenticate, authController.revokeAllSessions.bind(authController));
router.delete('/sessions/:id', authenticate, authController.revokeSession.bind(authController));

export { router as authRouter };
