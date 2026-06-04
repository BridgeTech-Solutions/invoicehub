import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { z } from 'zod';

export const createUnitSchema = z.object({
  code:        z.string().min(1).max(20).regex(/^[a-zA-Z0-9_²³]+$/, 'Code invalide'),
  label:       z.string().min(1).max(50),
  labelPlural: z.string().max(50).optional().nullable(),
  showOnPdf:   z.boolean().default(true),
  isActive:    z.boolean().default(true),
  sortOrder:   z.number().int().min(0).default(0),
});

export const updateUnitSchema = createUnitSchema.partial();

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(activeOnly = false) {
    return this.prisma.unit.findMany({
      where:   activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async create(data: CreateUnitInput) {
    const exists = await this.prisma.unit.findUnique({ where: { code: data.code } });
    if (exists) throw AppError.conflict(`Le code "${data.code}" est déjà utilisé`);
    return this.prisma.unit.create({ data });
  }

  async update(id: string, data: UpdateUnitInput) {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) throw AppError.notFound('Unité introuvable');
    if (data.code && data.code !== unit.code) {
      const exists = await this.prisma.unit.findUnique({ where: { code: data.code } });
      if (exists) throw AppError.conflict(`Le code "${data.code}" est déjà utilisé`);
    }
    return this.prisma.unit.update({ where: { id }, data });
  }

  async remove(id: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) throw AppError.notFound('Unité introuvable');
    // Désactiver plutôt que supprimer (intégrité des docs existants)
    return this.prisma.unit.update({ where: { id }, data: { isActive: false } });
  }

  async reorder(items: { id: string; sortOrder: number }[]) {
    await this.prisma.$transaction(
      items.map(i => this.prisma.unit.update({ where: { id: i.id }, data: { sortOrder: i.sortOrder } })),
    );
  }
}
