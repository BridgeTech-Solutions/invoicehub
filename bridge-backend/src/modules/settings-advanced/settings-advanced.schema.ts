import { z } from 'zod';

export const createWebhookSchema = z.object({
  name: z.string().min(2).max(200),
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
  secret: z.string().min(8).max(255).optional().nullable(),
  headers: z.record(z.string()).optional().default({}),
  isActive: z.boolean().default(true),
  retryCount: z.number().int().min(0).max(5).default(3),
});

export const updateWebhookSchema = createWebhookSchema.partial();

export const createApiKeySchema = z.object({
  name: z.string().min(2).max(200),
  permissions: z.array(z.string()).default([]),
  expiresAt: z.coerce.date().optional().nullable(),
  ipWhitelist: z.array(z.string()).optional().default([]),
});

export const createCustomFieldSchema = z.object({
  entityType: z.enum(['client', 'supplier', 'invoice', 'proforma', 'product', 'expense']),
  fieldName: z.string().min(2).max(100).regex(/^[a-z_]+$/),
  label: z.string().min(2).max(200),
  fieldType: z.enum(['text', 'number', 'date', 'boolean', 'select', 'json']),
  options: z.array(z.string()).optional().nullable(),
  isRequired: z.boolean().default(false),
  defaultValue: z.string().optional().nullable(),
  displayOrder: z.number().int().default(0),
});

export const setCustomFieldValueSchema = z.object({
  fieldId: z.string().uuid(),
  valueText: z.string().optional().nullable(),
  valueNumber: z.number().optional().nullable(),
  valueDate: z.coerce.date().optional().nullable(),
  valueBoolean: z.boolean().optional().nullable(),
  valueJson: z.unknown().optional().nullable(),
});

export const createWorkflowRuleSchema = z.object({
  name: z.string().min(2).max(200),
  entityType: z.string().min(1).max(50),
  triggerEvent: z.string().min(1).max(100),
  conditions: z.record(z.unknown()).optional().default({}),
  actions: z.array(z.object({
    type: z.string(),
    config: z.record(z.unknown()).optional().default({}),
  })).min(1),
  isActive: z.boolean().default(true),
});

export const createIpWhitelistSchema = z.object({
  ipAddress: z.string().min(7).max(50),
  description: z.string().max(255).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const createExportJobSchema = z.object({
  entityType: z.enum(['invoices', 'clients', 'products', 'payments', 'expenses', 'accounting_entries']),
  format: z.enum(['csv', 'excel', 'pdf', 'sage_csv', 'ciel_csv']),
  filters: z.record(z.unknown()).optional().default({}),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;
export type CreateWorkflowRuleInput = z.infer<typeof createWorkflowRuleSchema>;
export type CreateExportJobInput = z.infer<typeof createExportJobSchema>;
