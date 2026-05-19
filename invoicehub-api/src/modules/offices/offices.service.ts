import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type { CreateOfficeInput, UpdateOfficeInput } from './offices.schema';

@Injectable()
export class OfficesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.agencyOffice.findMany({
      where:   { deletedAt: null },
      orderBy: { isDefault: 'desc' },
    });
  }

  async findById(id: string) {
    const data = await this.prisma.agencyOffice.findFirst({ where: { id, deletedAt: null } });
    if (!data) throw AppError.notFound('Bureau introuvable');
    return data;
  }

  async create(input: CreateOfficeInput) {
    if (input.isDefault) {
      await this.prisma.agencyOffice.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return this.prisma.agencyOffice.create({ data: input });
  }

  async update(id: string, input: UpdateOfficeInput) {
    await this.findById(id);
    if (input.isDefault) {
      await this.prisma.agencyOffice.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return this.prisma.agencyOffice.update({ where: { id }, data: input });
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (existing.isDefault) throw AppError.badRequest('Impossible de supprimer le bureau par défaut');
    await this.prisma.agencyOffice.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }
}
