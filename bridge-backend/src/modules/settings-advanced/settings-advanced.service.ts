import { randomBytes, createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { exportQueue } from '../../jobs/queues';
import {
  CreateWebhookInput, CreateApiKeyInput, CreateCustomFieldInput,
  CreateWorkflowRuleInput, CreateExportJobInput,
} from './settings-advanced.schema';

// ── Webhooks ──────────────────────────────────────────────────────────────────

export async function listWebhooks() {
  return prisma.webhook.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { deliveries: true } } },
  });
}

export async function getWebhookById(id: string) {
  const wh = await prisma.webhook.findUnique({
    where: { id },
    include: {
      deliveries: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!wh) throw AppError.notFound('Webhook introuvable');
  return wh;
}

export async function createWebhook(data: CreateWebhookInput, userId: string) {
  return prisma.webhook.create({ data: { ...data, createdById: userId } });
}

export async function updateWebhook(id: string, data: Partial<CreateWebhookInput>) {
  const wh = await prisma.webhook.findUnique({ where: { id } });
  if (!wh) throw AppError.notFound('Webhook introuvable');
  return prisma.webhook.update({ where: { id }, data: data as any });
}

export async function deleteWebhook(id: string) {
  const wh = await prisma.webhook.findUnique({ where: { id } });
  if (!wh) throw AppError.notFound('Webhook introuvable');
  await prisma.webhook.delete({ where: { id } });
}

// ── Clés API ──────────────────────────────────────────────────────────────────

export async function listApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: { createdById: userId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, keyPrefix: true, permissions: true, expiresAt: true, lastUsedAt: true, createdAt: true, isActive: true },
  });
}

export async function createApiKey(data: CreateApiKeyInput, userId: string) {
  const rawKey = `bts_${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 12);

  const apiKey = await prisma.apiKey.create({
    data: {
      name: data.name,
      permissions: data.permissions,
      expiresAt: data.expiresAt,
      keyHash,
      keyPrefix,
      createdById: userId,
      isActive: true,
    },
  });

  return { ...apiKey, rawKey };
}

export async function revokeApiKey(id: string, userId: string) {
  const key = await prisma.apiKey.findFirst({ where: { id, createdById: userId } });
  if (!key) throw AppError.notFound('Clé API introuvable');
  await prisma.apiKey.update({ where: { id }, data: { isActive: false, revokedAt: new Date(), revokedById: userId } });
}

// ── Champs personnalisés ──────────────────────────────────────────────────────

export async function listCustomFields(entityType?: string) {
  return prisma.customField.findMany({
    where: { ...(entityType ? { entityType: entityType as any } : {}), isActive: true },
    orderBy: [{ entityType: 'asc' }, { sortOrder: 'asc' }],
  });
}

export async function createCustomField(data: CreateCustomFieldInput) {
  const exists = await prisma.customField.findFirst({
    where: { entityType: data.entityType as any, name: data.fieldName },
  });
  if (exists) throw AppError.conflict(`Le champ "${data.fieldName}" existe déjà pour ce type d'entité`);
  return prisma.customField.create({
    data: {
      entityType: data.entityType as any,
      name: data.fieldName,
      label: data.label,
      fieldType: data.fieldType as any,
      isRequired: data.isRequired,
      sortOrder: data.displayOrder,
      options: data.options ? data.options as any : undefined,
      defaultValue: data.defaultValue,
      isActive: true,
    },
  });
}

export async function deleteCustomField(id: string) {
  const field = await prisma.customField.findUnique({ where: { id } });
  if (!field) throw AppError.notFound('Champ personnalisé introuvable');
  await prisma.customField.update({ where: { id }, data: { isActive: false } });
}

export async function getCustomFieldValues(entityType: string, entityId: string) {
  return prisma.customFieldValue.findMany({
    where: { entityType: entityType as any, entityId },
    include: { customField: true },
  });
}

export async function setCustomFieldValue(entityType: string, entityId: string, customFieldId: string, value: {
  valueText?: string | null;
  valueNumber?: number | null;
  valueDate?: Date | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown;
}) {
  return prisma.customFieldValue.upsert({
    where: { customFieldId_entityId: { customFieldId, entityId } },
    update: value as any,
    create: { customFieldId, entityType: entityType as any, entityId, ...value as any },
  });
}

// ── Workflow Rules ────────────────────────────────────────────────────────────

export async function listWorkflowRules(module?: string) {
  return prisma.workflowRule.findMany({
    where: { ...(module ? { module } : {}) },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createWorkflowRule(data: CreateWorkflowRuleInput, userId: string) {
  return prisma.workflowRule.create({
    data: {
      name: data.name,
      module: data.entityType,
      triggerEvent: data.triggerEvent,
      conditions: (data.conditions ?? {}) as any,
      actions: (data.actions ?? []) as any,
      isActive: true,
      createdById: userId,
    },
  });
}

export async function toggleWorkflowRule(id: string) {
  const rule = await prisma.workflowRule.findUnique({ where: { id } });
  if (!rule) throw AppError.notFound('Règle introuvable');
  return prisma.workflowRule.update({ where: { id }, data: { isActive: !rule.isActive } });
}

export async function deleteWorkflowRule(id: string) {
  const rule = await prisma.workflowRule.findUnique({ where: { id } });
  if (!rule) throw AppError.notFound('Règle introuvable');
  await prisma.workflowRule.delete({ where: { id } });
}

// ── IP Whitelist ──────────────────────────────────────────────────────────────

export async function listIpWhitelist() {
  return prisma.ipWhitelist.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function addIpWhitelist(data: { ipAddress: string; label?: string; isActive: boolean }, userId: string) {
  return prisma.ipWhitelist.create({
    data: { ipAddress: data.ipAddress, label: data.label ?? data.ipAddress, isActive: data.isActive, createdById: userId },
  });
}

export async function removeIpWhitelist(id: string) {
  await prisma.ipWhitelist.delete({ where: { id } });
}

// ── Export Jobs ───────────────────────────────────────────────────────────────

export async function listExportJobs(userId: string) {
  return prisma.exportJob.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function getExportJob(id: string, userId: string) {
  const job = await prisma.exportJob.findFirst({ where: { id, createdById: userId } });
  if (!job) throw AppError.notFound('Export introuvable');
  return job;
}

export async function createExportJob(data: CreateExportJobInput, userId: string) {
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  const job = await prisma.exportJob.create({
    data: {
      module: data.entityType,
      format: data.format as any,
      filters: (data.filters ?? {}) as any,
      status: 'pending' as any,
      expiresAt,
      createdById: userId,
    },
  });
  await exportQueue.add('export', { exportJobId: job.id });
  return job;
}

export async function getExportDownload(id: string, userId: string) {
  const job = await prisma.exportJob.findFirst({ where: { id, createdById: userId } });
  if (!job) throw AppError.notFound('Export introuvable');
  if (job.status !== 'completed') throw AppError.badRequest('Export non terminé');
  if (!job.filePath) throw AppError.badRequest('Fichier non disponible');

  const absolutePath = path.join(process.cwd(), job.filePath);
  if (!fs.existsSync(absolutePath)) {
    throw AppError.notFound('Fichier introuvable sur le serveur');
  }

  const filename = path.basename(absolutePath);
  return { absolutePath, filename, format: job.format };
}
