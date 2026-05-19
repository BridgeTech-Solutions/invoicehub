import { Router, IRouter } from 'express'
import { approvalsController as ctrl } from './approvals.controller'
import { authenticate } from '../../core/middleware/auth'
import { authorizePermission } from '../../core/middleware/rbac'
import { auditMiddleware } from '../../core/middleware/audit'
import { AuditAction } from '@prisma/client'

const router: IRouter = Router()
router.use(authenticate)

// ── Workflows (admin) ─────────────────────────────────────────
router.get('/workflows',      authorizePermission('approvals:admin'), ctrl.listWorkflows.bind(ctrl))
router.post('/workflows',     authorizePermission('approvals:admin'), auditMiddleware('approval_workflow', 'CREATE' as AuditAction), ctrl.createWorkflow.bind(ctrl))
router.get('/workflows/:id',  authorizePermission('approvals:admin'), ctrl.findWorkflow.bind(ctrl))
router.put('/workflows/:id',  authorizePermission('approvals:admin'), auditMiddleware('approval_workflow', 'UPDATE' as AuditAction), ctrl.updateWorkflow.bind(ctrl))
router.delete('/workflows/:id', authorizePermission('approvals:admin'), auditMiddleware('approval_workflow', 'SOFT_DELETE' as AuditAction), ctrl.deleteWorkflow.bind(ctrl))

// ── Demandes ──────────────────────────────────────────────────
router.get('/requests',           authorizePermission('approvals:view', 'approvals:view_own'), ctrl.listRequests.bind(ctrl))
router.get('/pending-count',      authorizePermission('approvals:view', 'approvals:view_own'), ctrl.pendingCount.bind(ctrl))
router.get('/requests/:id',       authorizePermission('approvals:view', 'approvals:view_own'), ctrl.findRequest.bind(ctrl))
router.post('/requests/:id/approve',  authorizePermission('approvals:approve'), auditMiddleware('approval_request', 'APPROVAL_DECISION' as AuditAction), ctrl.approve.bind(ctrl))
router.post('/requests/:id/reject',   authorizePermission('approvals:approve'), auditMiddleware('approval_request', 'APPROVAL_DECISION' as AuditAction), ctrl.reject.bind(ctrl))
router.post('/requests/:id/delegate', authorizePermission('approvals:approve'), ctrl.delegate.bind(ctrl))
router.post('/requests/:id/cancel',   authorizePermission('approvals:view', 'approvals:view_own'), ctrl.cancel.bind(ctrl))

export { router as approvalsRouter }
