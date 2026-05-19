import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateSettingsInput } from './settings.schema';

const ASSET_PATH_FIELDS = ['logoPath', 'stampPath', 'signaturePath', 'headerImagePath', 'footerImagePath'] as const;

function toRelativePath(absPath: string | null): string | null {
  if (!absPath) return null;
  if (!path.isAbsolute(absPath)) return absPath.replace(/\\/g, '/');
  return path.relative(process.cwd(), absPath).replace(/\\/g, '/');
}

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

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const settings = await this.prisma.companySettings.findFirst();
    return settings ? formatSettings(settings as unknown as Record<string, unknown>) : null;
  }

  async update(input: UpdateSettingsInput) {
    const existing = await this.prisma.companySettings.findFirst();

    if (existing) {
      const updated = await this.prisma.companySettings.update({
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
          ...(input.require2FA                 !== undefined && { require2FA:                 input.require2FA }),
          ...(input.companyCode                !== undefined && { companyCode:                input.companyCode }),
          ...(input.autoReminderDays           !== undefined && { autoReminderDays:           input.autoReminderDays }),
          ...(input.footerSafeZonePx           !== undefined && { footerSafeZonePx:           input.footerSafeZonePx }),
          ...(input.reminderEscalation         !== undefined && { reminderEscalation:         input.reminderEscalation }),
        },
      });
      return formatSettings(updated as unknown as Record<string, unknown>);
    }

    const created = await this.prisma.companySettings.create({
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
        require2FA:                  input.require2FA                  ?? false,
        companyCode:                 input.companyCode                 ?? 'BTS',
        autoReminderDays:            input.autoReminderDays            ?? [7, 14, 30],
        footerSafeZonePx:            input.footerSafeZonePx            ?? 0,
      },
    });
    return formatSettings(created as unknown as Record<string, unknown>);
  }
}
