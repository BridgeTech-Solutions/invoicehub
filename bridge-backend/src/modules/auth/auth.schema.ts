import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
  totpToken: z.string().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email invalide'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  newPassword: z
    .string()
    .min(8, 'Le mot de passe doit faire au moins 8 caractères')
    .regex(/[A-Z]/, 'Doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Doit contenir au moins un chiffre'),
});

export const verifyTotpSchema = z.object({
  token: z.string().length(6, 'Code TOTP à 6 chiffres'),
});

export const disableTotpSchema = z.object({
  token: z.string().length(6, 'Code TOTP à 6 chiffres'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyTotpInput = z.infer<typeof verifyTotpSchema>;
export type DisableTotpInput = z.infer<typeof disableTotpSchema>;
