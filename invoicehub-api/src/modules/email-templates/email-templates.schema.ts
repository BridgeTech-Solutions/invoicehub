import { z } from 'zod';

export const updateEmailTemplateSchema = z.object({
  name:     z.string().min(1).max(255).optional(),
  subject:  z.string().min(1).max(500).optional(),
  bodyHtml: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const previewEmailTemplateSchema = z.record(z.string(), z.string());

export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
export type PreviewEmailTemplateInput = z.infer<typeof previewEmailTemplateSchema>;
