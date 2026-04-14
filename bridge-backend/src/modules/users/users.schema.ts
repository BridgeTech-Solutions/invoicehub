import { z } from 'zod';

export const createUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  role: z.enum(['admin', 'commercial', 'employee']).default('employee'),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Doit contenir une majuscule')
    .regex(/[0-9]/, 'Doit contenir un chiffre')
    .optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(50).optional().nullable(),
  role: z.enum(['admin', 'commercial', 'employee']).optional(),
  status: z.enum(['active', 'suspended', 'pending_activation']).optional(),
  language: z.enum(['fr', 'en']).optional(),
  timezone: z.string().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  emailNotifications: z.boolean().optional(),
  invoiceNotifications: z.boolean().optional(),
});

/** Schéma de mise à jour du profil personnel (sans changement de rôle) */
export const updateMeSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName:  z.string().min(1).max(100).optional(),
  phone:     z.string().max(50).optional().nullable(),
  language:  z.enum(['fr', 'en']).optional(),
  timezone:  z.string().optional(),
  theme:     z.enum(['light', 'dark', 'system']).optional(),
  emailNotifications:   z.boolean().optional(),
  invoiceNotifications: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Doit contenir une majuscule')
    .regex(/[0-9]/, 'Doit contenir un chiffre'),
});

export const listUsersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  role: z.enum(['admin', 'commercial', 'employee']).optional(),
  status: z.enum(['active', 'suspended', 'pending_activation']).optional(),
  search: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Doit contenir une majuscule')
    .regex(/[0-9]/, 'Doit contenir un chiffre'),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateUserInput    = z.infer<typeof createUserSchema>;
export type UpdateUserInput    = z.infer<typeof updateUserSchema>;
export type UpdateMeInput      = z.infer<typeof updateMeSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ListUsersInput     = z.infer<typeof listUsersSchema>;
