import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import type { CreateClientInput, UpdateClientInput, ListClientsInput } from './clients.schema';

export class ClientsService {
  async list(input: ListClientsInput) {
    const { page, limit, type, status, search, city } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {
      deletedAt: null,
      ...(type && { type }),
      ...(status && { status }),
      ...(city && { city: { contains: city, mode: 'insensitive' } }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { taxNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const client = await prisma.client.findFirst({ where: { id, deletedAt: null } });
    if (!client) throw AppError.notFound('Client introuvable');
    return client;
  }

  async create(input: CreateClientInput, createdById: string) {
    return prisma.client.create({
      data: { ...input, createdById, metadata: input.metadata ?? {} },
    });
  }

  async update(id: string, input: UpdateClientInput) {
    await this.findById(id);
    return prisma.client.update({ where: { id }, data: input });
  }

  async archive(id: string): Promise<void> {
    await this.findById(id);
    await prisma.client.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'archived' },
    });
  }

  async getSummary(id: string) {
    await this.findById(id);

    const [invoicesAgg, paidAgg, pendingCount] = await Promise.all([
      // Total facturé (factures émises ou plus)
      prisma.invoice.aggregate({
        where: {
          clientId: id,
          deletedAt: null,
          status: { notIn: ['draft', 'cancelled'] },
        },
        _sum: { totalTtc: true },
        _count: true,
      }),
      // Total payé
      prisma.invoice.aggregate({
        where: {
          clientId: id,
          deletedAt: null,
          status: 'paid',
        },
        _sum: { totalTtc: true },
      }),
      // Factures en attente
      prisma.invoice.count({
        where: {
          clientId: id,
          deletedAt: null,
          status: { in: ['issued', 'partially_paid', 'overdue'] },
        },
      }),
    ]);

    const totalInvoiced = Number(invoicesAgg._sum.totalTtc ?? 0);
    const totalPaid = Number(paidAgg._sum.totalTtc ?? 0);

    return {
      invoiceCount: invoicesAgg._count,
      totalInvoiced,
      totalPaid,
      totalPending: totalInvoiced - totalPaid,
      pendingInvoiceCount: pendingCount,
    };
  }
}

export const clientsService = new ClientsService();
