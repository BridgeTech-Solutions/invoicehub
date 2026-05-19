import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';
import * as ctrl from './settings-advanced.controller';

export const webhooksRouter: Router = Router();
export const apiKeysRouter: Router = Router();
export const customFieldsRouter: Router = Router();
export const workflowRulesRouter: Router = Router();
export const ipWhitelistRouter: Router = Router();
export const exportsRouter: Router = Router();

// ── Webhooks ──────────────────────────────────────────────────────────────────
webhooksRouter.use(authenticate, authorizePermission('webhooks:manage'));
webhooksRouter.get('/',    ctrl.listWebhooks);
webhooksRouter.post('/',   auditMiddleware('webhook', 'CREATE'), ctrl.createWebhook);
webhooksRouter.get('/:id', ctrl.getWebhook);
webhooksRouter.put('/:id', auditMiddleware('webhook', 'UPDATE'), ctrl.updateWebhook);
webhooksRouter.delete('/:id', auditMiddleware('webhook', 'SOFT_DELETE'), ctrl.deleteWebhook);

// ── Clés API ──────────────────────────────────────────────────────────────────
apiKeysRouter.use(authenticate, authorizePermission('api-keys:manage'));
apiKeysRouter.get('/',    ctrl.listApiKeys);
apiKeysRouter.post('/',   auditMiddleware('api_key', 'CREATE'), ctrl.createApiKey);
apiKeysRouter.delete('/:id', auditMiddleware('api_key', 'SOFT_DELETE'), ctrl.revokeApiKey);

// ── Champs personnalisés ──────────────────────────────────────────────────────
customFieldsRouter.use(authenticate);
customFieldsRouter.get('/',    authorizePermission('settings:read'),   ctrl.listCustomFields);
customFieldsRouter.post('/',   authorizePermission('settings:manage'), ctrl.createCustomField);
customFieldsRouter.delete('/:id', authorizePermission('settings:manage'), ctrl.deleteCustomField);
customFieldsRouter.get('/values/:entityType/:entityId',  authorizePermission('settings:read'),   ctrl.getCustomFieldValues);
customFieldsRouter.post('/values/:entityType/:entityId', authorizePermission('settings:manage'), ctrl.setCustomFieldValue);

// ── Workflow Rules ────────────────────────────────────────────────────────────
workflowRulesRouter.use(authenticate);
workflowRulesRouter.get('/',           authorizePermission('settings:read'),   ctrl.listWorkflowRules);
workflowRulesRouter.post('/',          authorizePermission('settings:manage'), ctrl.createWorkflowRule);
workflowRulesRouter.post('/:id/toggle', authorizePermission('settings:manage'), ctrl.toggleWorkflowRule);
workflowRulesRouter.delete('/:id',     authorizePermission('settings:manage'), ctrl.deleteWorkflowRule);

// ── IP Whitelist ──────────────────────────────────────────────────────────────
ipWhitelistRouter.use(authenticate, authorizePermission('settings:manage'));
ipWhitelistRouter.get('/',    ctrl.listIpWhitelist);
ipWhitelistRouter.post('/',   ctrl.addIpWhitelist);
ipWhitelistRouter.delete('/:id', ctrl.removeIpWhitelist);

// ── Export Jobs ───────────────────────────────────────────────────────────────
exportsRouter.use(authenticate);
exportsRouter.get('/',              ctrl.listExportJobs);
exportsRouter.post('/',             ctrl.createExportJob);
exportsRouter.get('/:id',           ctrl.getExportJob);
exportsRouter.get('/:id/download',  ctrl.downloadExport);
