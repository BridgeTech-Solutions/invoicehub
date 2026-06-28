import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomBytes, createHash } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import {
  CreateWebhookInput, CreateApiKeyInput, CreateCustomFieldInput,
  CreateWorkflowRuleInput, CreateExportJobInput,
} from './settings-advanced.schema';

const EXPORT_QUEUE = 'export';

@Injectable()
export class SettingsAdvancedService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EXPORT_QUEUE) private readonly exportQueue: Queue,
  ) {}

  // ── Webhooks ────────────────────────────────────────────────────────────────

  async listWebhooks() {
    return this.prisma.webhook.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { deliveries: true } } },
    });
  }

  async getWebhookById(id: string) {
    const wh = await this.prisma.webhook.findUnique({
      where: { id },
      include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!wh) throw AppError.notFound('Webhook introuvable');
    return wh;
  }

  async createWebhook(data: CreateWebhookInput, userId: string) {
    return this.prisma.webhook.create({ data: { ...data, createdById: userId } });
  }

  async updateWebhook(id: string, data: Partial<CreateWebhookInput>) {
    const wh = await this.prisma.webhook.findUnique({ where: { id } });
    if (!wh) throw AppError.notFound('Webhook introuvable');
    return this.prisma.webhook.update({ where: { id }, data: data as any });
  }

  async deleteWebhook(id: string) {
    const wh = await this.prisma.webhook.findUnique({ where: { id } });
    if (!wh) throw AppError.notFound('Webhook introuvable');
    await this.prisma.webhook.delete({ where: { id } });
  }

  // ── Clés API ────────────────────────────────────────────────────────────────

  async listApiKeys(userId: string) {
    return this.prisma.apiKey.findMany({
      where:   { createdById: userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select:  { id: true, name: true, keyPrefix: true, permissions: true, expiresAt: true, lastUsedAt: true, createdAt: true, isActive: true },
    });
  }

  async createApiKey(data: CreateApiKeyInput, userId: string) {
    const rawKey   = `bts_${randomBytes(32).toString('hex')}`;
    const keyHash  = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 10); // colonne key_prefix = VarChar(10)

    const apiKey = await this.prisma.apiKey.create({
      data: { name: data.name, permissions: data.permissions, expiresAt: data.expiresAt, keyHash, keyPrefix, createdById: userId, isActive: true },
    });
    return { ...apiKey, rawKey };
  }

  async revokeApiKey(id: string, userId: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, createdById: userId } });
    if (!key) throw AppError.notFound('Clé API introuvable');
    await this.prisma.apiKey.update({ where: { id }, data: { isActive: false, revokedAt: new Date(), revokedById: userId } });
  }

  // ── Champs personnalisés ────────────────────────────────────────────────────

  async listCustomFields(entityType?: string) {
    return this.prisma.customField.findMany({
      where:   { ...(entityType ? { entityType: entityType as any } : {}), isActive: true },
      orderBy: [{ entityType: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async createCustomField(data: CreateCustomFieldInput) {
    const exists = await this.prisma.customField.findFirst({
      where: { entityType: data.entityType as any, name: data.fieldName },
    });
    if (exists) throw AppError.conflict(`Le champ "${data.fieldName}" existe déjà pour ce type d'entité`);
    return this.prisma.customField.create({
      data: {
        entityType:   data.entityType as any,
        name:         data.fieldName,
        label:        data.label,
        fieldType:    data.fieldType as any,
        isRequired:   data.isRequired,
        sortOrder:    data.displayOrder,
        options:      data.options ? data.options as any : undefined,
        defaultValue: data.defaultValue,
        isActive:     true,
      },
    });
  }

  async deleteCustomField(id: string) {
    const field = await this.prisma.customField.findUnique({ where: { id } });
    if (!field) throw AppError.notFound('Champ personnalisé introuvable');
    await this.prisma.customField.update({ where: { id }, data: { isActive: false } });
  }

  async getCustomFieldValues(entityType: string, entityId: string) {
    return this.prisma.customFieldValue.findMany({
      where:   { entityType: entityType as any, entityId },
      include: { customField: true },
    });
  }

  async setCustomFieldValue(entityType: string, entityId: string, customFieldId: string, value: {
    valueText?:    string | null;
    valueNumber?:  number | null;
    valueDate?:    Date | null;
    valueBoolean?: boolean | null;
    valueJson?:    unknown;
  }) {
    return this.prisma.customFieldValue.upsert({
      where:  { customFieldId_entityId: { customFieldId, entityId } },
      update: value as any,
      create: { customFieldId, entityType: entityType as any, entityId, ...value as any },
    });
  }

  // ── Workflow Rules ──────────────────────────────────────────────────────────

  async listWorkflowRules(module?: string) {
    return this.prisma.workflowRule.findMany({
      where:   { ...(module ? { module } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWorkflowRule(data: CreateWorkflowRuleInput, userId: string) {
    return this.prisma.workflowRule.create({
      data: {
        name:         data.name,
        module:       data.entityType,
        triggerEvent: data.triggerEvent,
        conditions:   (data.conditions ?? {}) as any,
        actions:      (data.actions ?? []) as any,
        isActive:     true,
        createdById:  userId,
      },
    });
  }

  async toggleWorkflowRule(id: string) {
    const rule = await this.prisma.workflowRule.findUnique({ where: { id } });
    if (!rule) throw AppError.notFound('Règle introuvable');
    return this.prisma.workflowRule.update({ where: { id }, data: { isActive: !rule.isActive } });
  }

  async deleteWorkflowRule(id: string) {
    const rule = await this.prisma.workflowRule.findUnique({ where: { id } });
    if (!rule) throw AppError.notFound('Règle introuvable');
    await this.prisma.workflowRule.delete({ where: { id } });
  }

  // ── IP Whitelist ────────────────────────────────────────────────────────────

  async listIpWhitelist() {
    return this.prisma.ipWhitelist.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async addIpWhitelist(data: { ipAddress: string; label?: string | null; isActive: boolean }, userId: string) {
    return this.prisma.ipWhitelist.create({
      data: { ipAddress: data.ipAddress, label: data.label ?? data.ipAddress, isActive: data.isActive, createdById: userId },
    });
  }

  async removeIpWhitelist(id: string) {
    await this.prisma.ipWhitelist.delete({ where: { id } });
  }

  // ── Export Jobs ─────────────────────────────────────────────────────────────

  async listExportJobs(userId: string) {
    return this.prisma.exportJob.findMany({
      where:   { createdById: userId },
      orderBy: { createdAt: 'desc' },
      take:    50,
    });
  }

  async getExportJob(id: string, userId: string) {
    const job = await this.prisma.exportJob.findFirst({ where: { id, createdById: userId } });
    if (!job) throw AppError.notFound('Export introuvable');
    return job;
  }

  async createExportJob(data: CreateExportJobInput, userId: string) {
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    const job = await this.prisma.exportJob.create({
      data: {
        module:      data.entityType,
        format:      data.format as any,
        filters:     (data.filters ?? {}) as any,
        status:      'pending' as any,
        expiresAt,
        createdById: userId,
      },
    });
    await this.exportQueue.add('export', { exportJobId: job.id });
    return job;
  }

  async getExportDownload(id: string, userId: string) {
    const job = await this.prisma.exportJob.findFirst({ where: { id, createdById: userId } });
    if (!job) throw AppError.notFound('Export introuvable');
    if (job.status !== 'completed') throw AppError.badRequest('Export non terminé');
    if (!job.filePath) throw AppError.badRequest('Fichier non disponible');

    const absolutePath = path.join(process.cwd(), job.filePath);
    if (!fs.existsSync(absolutePath)) throw AppError.notFound('Fichier introuvable sur le serveur');

    return { absolutePath, filename: path.basename(absolutePath), format: job.format };
  }
}
