import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';

export interface CreateTaxRateInput {
  name:        string;
  code:        string;
  rate:        number;
  description?: string;
  isDefault?:  boolean;
}

export type UpdateTaxRateInput = Partial<CreateTaxRateInput>;

export class TaxRatesService {
  async list(includeInactive = false) {
    return prisma.taxRate.findMany({
      where:   { ...(includeInactive ? {} : { isActive: true }), deletedAt: null },
      orderBy: { rate: 'asc' },
    });
  }

  async findById(id: string) {
    const data = await prisma.taxRate.findFirst({ where: { id, deletedAt: null } });
    if (!data) throw AppError.notFound('Taux de taxe introuvable');
    return data;
  }

  async create(input: CreateTaxRateInput) {
    if (input.isDefault) {
      await prisma.taxRate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return prisma.taxRate.create({ data: input });
  }

  async update(id: string, input: UpdateTaxRateInput) {
    await this.findById(id);
    if (input.isDefault) {
      await prisma.taxRate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return prisma.taxRate.update({ where: { id }, data: input });
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (existing.isDefault) throw AppError.badRequest('Impossible de supprimer le taux par défaut');
    await prisma.taxRate.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }
}

export const taxRatesService = new TaxRatesService();
