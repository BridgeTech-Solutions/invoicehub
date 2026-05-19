import { Request, Response, NextFunction } from 'express';
import * as service from './settings-advanced.service';
import {
  createWebhookSchema, updateWebhookSchema,
  createApiKeySchema, createCustomFieldSchema,
  setCustomFieldValueSchema, createWorkflowRuleSchema,
  createIpWhitelistSchema, createExportJobSchema,
} from './settings-advanced.schema';

// ── Webhooks ──────────────────────────────────────────────────────────────────

export async function listWebhooks(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await service.listWebhooks() }); } catch (e) { next(e); }
}
export async function getWebhook(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await service.getWebhookById(String(req.params['id'])) }); } catch (e) { next(e); }
}
export async function createWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createWebhook(createWebhookSchema.parse(req.body), req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
}
export async function updateWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateWebhook(String(req.params['id']), updateWebhookSchema.parse(req.body));
    res.json({ success: true, data });
  } catch (e) { next(e); }
}
export async function deleteWebhook(req: Request, res: Response, next: NextFunction) {
  try { await service.deleteWebhook(String(req.params['id'])); res.json({ success: true, message: 'Webhook supprimé' }); } catch (e) { next(e); }
}

// ── Clés API ──────────────────────────────────────────────────────────────────

export async function listApiKeys(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await service.listApiKeys(req.user!.id) }); } catch (e) { next(e); }
}
export async function createApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createApiKey(createApiKeySchema.parse(req.body), req.user!.id);
    res.status(201).json({ success: true, data, warning: 'La clé brute ne sera plus affichée après cette réponse.' });
  } catch (e) { next(e); }
}
export async function revokeApiKey(req: Request, res: Response, next: NextFunction) {
  try { await service.revokeApiKey(String(req.params['id']), req.user!.id); res.json({ success: true, message: 'Clé révoquée' }); } catch (e) { next(e); }
}

// ── Champs personnalisés ──────────────────────────────────────────────────────

export async function listCustomFields(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listCustomFields(req.query['entityType'] as string | undefined);
    res.json({ success: true, data });
  } catch (e) { next(e); }
}
export async function createCustomField(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createCustomField(createCustomFieldSchema.parse(req.body));
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
}
export async function deleteCustomField(req: Request, res: Response, next: NextFunction) {
  try { await service.deleteCustomField(String(req.params['id'])); res.json({ success: true, message: 'Champ supprimé' }); } catch (e) { next(e); }
}
export async function getCustomFieldValues(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getCustomFieldValues(String(req.params['entityType']), String(req.params['entityId']));
    res.json({ success: true, data });
  } catch (e) { next(e); }
}
export async function setCustomFieldValue(req: Request, res: Response, next: NextFunction) {
  try {
    const { fieldId, ...value } = setCustomFieldValueSchema.parse(req.body);
    const data = await service.setCustomFieldValue(String(req.params['entityType']), String(req.params['entityId']), fieldId, value);
    res.json({ success: true, data });
  } catch (e) { next(e); }
}

// ── Workflow Rules ────────────────────────────────────────────────────────────

export async function listWorkflowRules(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listWorkflowRules(req.query['entityType'] as string | undefined);
    res.json({ success: true, data });
  } catch (e) { next(e); }
}
export async function createWorkflowRule(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createWorkflowRule(createWorkflowRuleSchema.parse(req.body), req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
}
export async function toggleWorkflowRule(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await service.toggleWorkflowRule(String(req.params['id'])) }); } catch (e) { next(e); }
}
export async function deleteWorkflowRule(req: Request, res: Response, next: NextFunction) {
  try { await service.deleteWorkflowRule(String(req.params['id'])); res.json({ success: true, message: 'Règle supprimée' }); } catch (e) { next(e); }
}

// ── IP Whitelist ──────────────────────────────────────────────────────────────

export async function listIpWhitelist(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await service.listIpWhitelist() }); } catch (e) { next(e); }
}
export async function addIpWhitelist(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createIpWhitelistSchema.parse(req.body);
    const data = await service.addIpWhitelist(input, req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
}
export async function removeIpWhitelist(req: Request, res: Response, next: NextFunction) {
  try { await service.removeIpWhitelist(String(req.params['id'])); res.json({ success: true, message: 'IP supprimée' }); } catch (e) { next(e); }
}

// ── Export Jobs ───────────────────────────────────────────────────────────────

export async function listExportJobs(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await service.listExportJobs(req.user!.id) }); } catch (e) { next(e); }
}
export async function getExportJob(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await service.getExportJob(String(req.params['id']), req.user!.id) }); } catch (e) { next(e); }
}
export async function createExportJob(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createExportJobSchema.parse(req.body);
    const data = await service.createExportJob(input, req.user!.id);
    res.status(202).json({ success: true, data, message: 'Export en cours de traitement' });
  } catch (e) { next(e); }
}

export async function downloadExport(req: Request, res: Response, next: NextFunction) {
  try {
    const { absolutePath, filename, format } = await service.getExportDownload(
      String(req.params['id']),
      req.user!.id,
    );

    const mimeTypes: Record<string, string> = {
      csv:      'text/csv',
      excel:    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sage_csv: 'text/plain',
      ciel_csv: 'text/plain',
      dsf_xml:  'application/xml',
    };

    const mime = mimeTypes[format as string] ?? 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(absolutePath);
  } catch (e) { next(e); }
}
