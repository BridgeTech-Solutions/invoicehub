/**
 * @module modules/settings/settings.service
 * Lecture et mise à jour des paramètres de l'entreprise (table company_settings).
 *
 * La table ne contient qu'une seule ligne (singleton). Si elle n'existe pas encore,
 * `get()` retourne null et `update()` la crée avec les valeurs fournies (upsert).
 */
import path from 'path';
import { prisma } from '../../config/database';
import type { UpdateSettingsInput } from './settings.schema';

const ASSET_PATH_FIELDS = ['logoPath', 'stampPath', 'signaturePath', 'headerImagePath', 'footerImagePath'] as const;

/** Converts an absolute filesystem path to a relative URL path (e.g. "uploads/company/uuid.png"). */
function toRelativePath(absPath: string | null): string | null {
  if (!absPath) return null;
  // Already relative (no drive letter) — return as-is
  if (!path.isAbsolute(absPath)) return absPath.replace(/\\/g, '/');
  return path.relative(process.cwd(), absPath).replace(/\\/g, '/');
}

/** Normalises all *Path fields from absolute filesystem paths to relative URL paths. */
function formatSettings<T extends Record<string, unknown>>(settings: T): T {
  if (!settings) return settings;
  const result = { ...settings };
  for (const field of ASSET_PATH_FIELDS) {
    if (field in result) {
      (result as Record<string, unknown>)[field] = toRelativePath(result[field] as string | null);
    }
  }
  return result;
}

export class SettingsService {
  /**
   * Retourne les paramètres actuels de l'entreprise.
   * Retourne `null` si la table n'a pas encore été initialisée.
   */
  async get() {
    const settings = await prisma.companySettings.findFirst();
    return settings ? formatSettings(settings) : null;
  }

  /**
   * Met à jour les paramètres de l'entreprise (upsert).
   *
   * Seuls les champs fournis sont modifiés. Si aucune ligne n'existe,
   * une ligne est créée avec les valeurs fournies et des valeurs par défaut
   * pour les champs obligatoires non renseignés.
   *
   * @param input - Champs à modifier (tous optionnels)
   * @returns Les paramètres mis à jour
   */
  async update(input: UpdateSettingsInput) {
    const existing = await prisma.companySettings.findFirst();

    if (existing) {
      const updated = await prisma.companySettings.update({
        where: { id: existing.id },
        data: {
          ...(input.companyName                !== undefined && { companyName:                input.companyName }),
          ...(input.legalForm                  !== undefined && { legalForm:                  input.legalForm }),
          ...(input.taxNumber                  !== undefined && { taxNumber:                  input.taxNumber }),
          ...(input.rccm                       !== undefined && { rccm:                       input.rccm }),
          ...(input.address                    !== undefined && { address:                    input.address }),
          ...(input.city                       !== undefined && { city:                       input.city }),
          ...(input.country                    !== undefined && { country:                    input.country }),
          ...(input.postalBox                  !== undefined && { postalBox:                  input.postalBox }),
          ...(input.phone                      !== undefined && { phone:                      input.phone }),
          ...(input.email                      !== undefined && { email:                      input.email }),
          ...(input.website                    !== undefined && { website:                    input.website || null }),
          ...(input.defaultCurrency            !== undefined && { defaultCurrency:            input.defaultCurrency }),
          ...(input.defaultTaxRate             !== undefined && { defaultTaxRate:             input.defaultTaxRate }),
          ...(input.defaultProformaValidityDays !== undefined && { defaultProformaValidityDays: input.defaultProformaValidityDays }),
          ...(input.defaultInvoiceDueDays      !== undefined && { defaultInvoiceDueDays:      input.defaultInvoiceDueDays }),
          ...(input.sessionTimeoutMinutes      !== undefined && { sessionTimeoutMinutes:      input.sessionTimeoutMinutes }),
          ...(input.maxLoginAttempts           !== undefined && { maxLoginAttempts:           input.maxLoginAttempts }),
          ...(input.autoReminderDays           !== undefined && { autoReminderDays:           input.autoReminderDays }),
          ...(input.footerSafeZonePx           !== undefined && { footerSafeZonePx:           input.footerSafeZonePx }),
          ...(input.reminderEscalation         !== undefined && { reminderEscalation:         input.reminderEscalation }),
        },
      });
      return formatSettings(updated);
    }

    // Création initiale (premier démarrage)
    const created = await prisma.companySettings.create({
      data: {
        companyName:  input.companyName  ?? 'Bridge Technologies Solutions',
        address:      input.address      ?? 'Douala, Cameroun',
        phone:        input.phone        ?? '',
        email:        input.email        ?? 'contact@bridgetech-solutions.com',
        legalForm:    input.legalForm,
        taxNumber:    input.taxNumber,
        rccm:         input.rccm,
        city:         input.city         ?? 'Douala',
        country:      input.country      ?? 'Cameroun',
        postalBox:    input.postalBox,
        website:      input.website      || undefined,
        defaultCurrency:             input.defaultCurrency             ?? 'XAF',
        defaultTaxRate:              input.defaultTaxRate              ?? 19.25,
        defaultProformaValidityDays: input.defaultProformaValidityDays ?? 30,
        defaultInvoiceDueDays:       input.defaultInvoiceDueDays       ?? 30,
        sessionTimeoutMinutes:       input.sessionTimeoutMinutes       ?? 30,
        maxLoginAttempts:            input.maxLoginAttempts            ?? 5,
        autoReminderDays:            input.autoReminderDays            ?? [7, 14, 30],
        footerSafeZonePx:            input.footerSafeZonePx            ?? 0,
      },
    });
    return formatSettings(created);
  }
}

export const settingsService = new SettingsService();
