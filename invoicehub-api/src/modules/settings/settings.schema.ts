import { z } from 'zod';

export const updateSettingsSchema = z.object({
  companyName: z.string().min(1).max(255).optional(),
  legalForm:   z.string().max(100).optional(),
  taxNumber:   z.string().max(100).optional(),
  rccm:        z.string().max(100).optional(),

  address:   z.string().min(1).optional(),
  city:      z.string().max(100).optional(),
  country:   z.string().max(100).optional(),
  postalBox: z.string().max(50).optional(),
  phone:     z.string().max(50).optional(),
  email:     z.string().email().optional(),
  website:   z.string().url().optional().or(z.literal('')),

  companyCode:                 z.string().min(2).max(10).regex(/^[A-Z0-9]+$/, 'Lettres majuscules et chiffres uniquement').optional(),
  defaultCurrency:             z.string().length(3).optional(),
  defaultTaxRate:              z.number().min(0).max(100).optional(),
  defaultProformaValidityDays: z.number().int().positive().optional(),
  defaultInvoiceDueDays:       z.number().int().positive().optional(),

  sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  maxLoginAttempts:      z.number().int().min(1).max(20).optional(),
  require2FA:            z.boolean().optional(),

  autoReminderDays: z.array(z.number().int().positive()).max(10).optional(),

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

  footerSafeZonePx: z.number().int().min(0).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
