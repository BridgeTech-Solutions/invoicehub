import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[a-z_]+$/, 'Minuscules et underscores uniquement'),
  displayName: z.string().min(2).max(255),
  permissions: z.array(z.string().min(1)).default([]),
});

export const updateRoleSchema = z.object({
  displayName: z.string().min(2).max(255).optional(),
  permissions: z.array(z.string().min(1)).optional(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
