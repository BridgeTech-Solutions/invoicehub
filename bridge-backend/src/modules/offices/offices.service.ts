import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';

export interface CreateOfficeInput {
  code:      string;
  name:      string;
  city?:     string;
  address?:  string;
  isDefault?: boolean;
}

export type UpdateOfficeInput = Partial<CreateOfficeInput>;

export class OfficesService {
  async list() {
    return prisma.agencyOffice.findMany({
      where:   { deletedAt: null },
      orderBy: { isDefault: 'desc' },
    });
  }

  async findById(id: string) {
    const data = await prisma.agencyOffice.findFirst({ where: { id, deletedAt: null } });
    if (!data) throw AppError.notFound('Bureau introuvable');
    return data;
  }

  async create(input: CreateOfficeInput) {
    if (input.isDefault) {
      await prisma.agencyOffice.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return prisma.agencyOffice.create({ data: input });
  }

  async update(id: string, input: UpdateOfficeInput) {
    await this.findById(id);
    if (input.isDefault) {
      await prisma.agencyOffice.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return prisma.agencyOffice.update({ where: { id }, data: input });
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (existing.isDefault) throw AppError.badRequest('Impossible de supprimer le bureau par défaut');
    await prisma.agencyOffice.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }
}

export const officesService = new OfficesService();
