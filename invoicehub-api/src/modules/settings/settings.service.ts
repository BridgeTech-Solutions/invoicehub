import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type { UpdateSettingsInput } from './settings.schema';

const ASSET_PATH_FIELDS = ['logoPath', 'stampPath', 'signaturePath', 'headerImagePath', 'footerImagePath'] as const;

// Tous les champs de la config qui contiennent un numéro de compte comptable.
// À la sauvegarde, on valide qu'ils existent dans le plan comptable (chart_of_accounts)
// pour empêcher qu'une faute de frappe casse les écritures automatiques (violation FK).
const ACCOUNT_FIELDS = [
  'initialStockAccount', 'escompteAccountingAccount', 'collectedTaxAccount', 'deductibleTaxAccount',
  'stockAccount', 'stockVariationAccount', 'stockLossAccount',
  'defaultClientAccount', 'defaultSupplierAccount', 'defaultBankAccount',
  'defaultSalesGoodsAccount', 'defaultSalesServiceAccount', 'defaultPurchaseAccount', 'defaultExpenseAccount',
] as const;

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

  /**
   * Vérifie que chaque compte fourni existe dans le plan comptable et est un
   * compte de détail actif (les écritures ne peuvent pas pointer un compte racine).
   */
  private async validateAccounts(input: UpdateSettingsInput) {
    const provided = ACCOUNT_FIELDS
      .map((f) => (input as Record<string, unknown>)[f])
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    if (provided.length === 0) return;

    const unique = [...new Set(provided)];
    const rows = await this.prisma.chartOfAccount.findMany({
      where:  { accountNumber: { in: unique } },
      select: { accountNumber: true, isDetailAccount: true, isActive: true },
    });
    const byNumber = new Map(rows.map((r) => [r.accountNumber, r]));

    const missing  = unique.filter((a) => !byNumber.has(a));
    if (missing.length > 0) {
      throw AppError.badRequest(
        `Compte(s) inexistant(s) dans le plan comptable : ${missing.join(', ')}. Vérifiez le numéro dans Comptabilité → Plan comptable.`,
      );
    }
    const notDetail = unique.filter((a) => byNumber.get(a)?.isDetailAccount === false);
    if (notDetail.length > 0) {
      throw AppError.badRequest(
        `Compte(s) racine non imputables : ${notDetail.join(', ')}. Utilisez un sous-compte de détail (ex : 3111 plutôt que 311).`,
      );
    }
  }

  async update(input: UpdateSettingsInput) {
    await this.validateAccounts(input);
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
          ...(input.footerSafeZonePx             !== undefined && { footerSafeZonePx:             input.footerSafeZonePx }),
          ...(input.reminderEscalation           !== undefined && { reminderEscalation:           input.reminderEscalation }),
          ...(input.initialStockAccount          !== undefined && { initialStockAccount:          input.initialStockAccount }),
          ...(input.escompteAccountingAccount    !== undefined && { escompteAccountingAccount:    input.escompteAccountingAccount }),
          ...(input.collectedTaxAccount          !== undefined && { collectedTaxAccount:          input.collectedTaxAccount }),
          ...(input.deductibleTaxAccount         !== undefined && { deductibleTaxAccount:         input.deductibleTaxAccount }),
          ...(input.stockAccount                 !== undefined && { stockAccount:                 input.stockAccount }),
          ...(input.stockVariationAccount        !== undefined && { stockVariationAccount:        input.stockVariationAccount }),
          ...(input.stockLossAccount             !== undefined && { stockLossAccount:             input.stockLossAccount }),
          ...(input.defaultClientAccount         !== undefined && { defaultClientAccount:         input.defaultClientAccount }),
          ...(input.defaultSupplierAccount       !== undefined && { defaultSupplierAccount:       input.defaultSupplierAccount }),
          ...(input.defaultBankAccount           !== undefined && { defaultBankAccount:           input.defaultBankAccount }),
          ...(input.defaultSalesGoodsAccount     !== undefined && { defaultSalesGoodsAccount:     input.defaultSalesGoodsAccount }),
          ...(input.defaultSalesServiceAccount   !== undefined && { defaultSalesServiceAccount:   input.defaultSalesServiceAccount }),
          ...(input.defaultPurchaseAccount       !== undefined && { defaultPurchaseAccount:       input.defaultPurchaseAccount }),
          ...(input.defaultExpenseAccount        !== undefined && { defaultExpenseAccount:        input.defaultExpenseAccount }),
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
