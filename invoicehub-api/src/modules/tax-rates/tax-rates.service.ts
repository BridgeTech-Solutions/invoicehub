import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type { CreateTaxRateInput, UpdateTaxRateInput } from './tax-rates.schema';

@Injectable()
export class TaxRatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(includeInactive = false) {
    return this.prisma.taxRate.findMany({
      where:   { ...(includeInactive ? {} : { isActive: true }), deletedAt: null },
      orderBy: { rate: 'asc' },
    });
  }

  async findById(id: string) {
    const data = await this.prisma.taxRate.findFirst({ where: { id, deletedAt: null } });
    if (!data) throw AppError.notFound('Taux de taxe introuvable');
    return data;
  }

  async create(input: CreateTaxRateInput) {
    if (input.isDefault) {
      await this.prisma.taxRate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return this.prisma.taxRate.create({ data: input });
  }

  async update(id: string, input: UpdateTaxRateInput) {
    await this.findById(id);
    if (input.isDefault) {
      await this.prisma.taxRate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return this.prisma.taxRate.update({ where: { id }, data: input });
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (existing.isDefault) throw AppError.badRequest('Impossible de supprimer le taux par défaut');
    await this.prisma.taxRate.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }
}
