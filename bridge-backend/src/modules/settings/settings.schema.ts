import { z } from 'zod';

/**
 * Schéma de mise à jour des paramètres de l'entreprise.
 * Tous les champs sont optionnels — seuls les champs fournis sont modifiés.
 */
export const updateSettingsSchema = z.object({
  // ── Identité légale ──────────────────────────────────────────────────────────
  companyName: z.string().min(1).max(255).optional(),
  legalForm:   z.string().max(100).optional(),
  taxNumber:   z.string().max(100).optional(),
  rccm:        z.string().max(100).optional(),

  // ── Coordonnées ──────────────────────────────────────────────────────────────
  address:   z.string().min(1).optional(),
  city:      z.string().max(100).optional(),
  country:   z.string().max(100).optional(),
  postalBox: z.string().max(50).optional(),
  phone:     z.string().max(50).optional(),
  email:     z.string().email().optional(),
  website:   z.string().url().optional().or(z.literal('')),

  // ── Paramètres métier ────────────────────────────────────────────────────────
  defaultCurrency:             z.string().length(3).optional(),
  defaultTaxRate:              z.number().min(0).max(100).optional(),
  defaultProformaValidityDays: z.number().int().positive().optional(),
  defaultInvoiceDueDays:       z.number().int().positive().optional(),

  // ── Paramètres de sécurité ───────────────────────────────────────────────────
  sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  maxLoginAttempts:      z.number().int().min(1).max(20).optional(),

  // ── Rappels automatiques ────────────────────────────────────────────────────
  /** Jours avant/après échéance pour déclencher les rappels (ex : [7, 14, 30]) */
  autoReminderDays: z.array(z.number().int().positive()).max(10).optional(),

  /**
   * Configuration d'escalade des alertes internes.
   * - levels        : escalade factures OVERDUE (daysOverdue, label, notifyCreator, notifyManagers, sendEmail)
   * - checkLevels   : vérification factures ISSUED + proformas SENT (daysSince, notifyManagers, sendEmail)
   * - draftCheckLevels : escalade brouillons non envoyés — Cas B (daysSince, notifyManagers, sendEmail)
   */
  reminderEscalation: z.object({
    levels: z.array(z.object({
      daysOverdue:    z.number().int().min(0),
      label:          z.string().min(1).max(50),
      notifyCreator:  z.boolean(),
      notifyManagers: z.boolean(),
      sendEmail:      z.boolean(),
    })).max(10).optional().default([]),

    checkLevels: z.array(z.object({
      daysSince:      z.number().int().min(1),
      notifyManagers: z.boolean(),
      sendEmail:      z.boolean(),
    })).max(10).optional(),

    draftCheckLevels: z.array(z.object({
      daysSince:      z.number().int().min(1),
      notifyManagers: z.boolean(),
      sendEmail:      z.boolean(),
    })).max(10).optional(),
  }).optional(),

  // ── PDF ──────────────────────────────────────────────────────────────────────
  /** Hauteur en px de la zone infos entreprise à protéger en bas du footer */
  footerSafeZonePx: z.number().int().min(0).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
