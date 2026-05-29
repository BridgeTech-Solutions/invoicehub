import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import {
  CreateSupplierInput, UpdateSupplierInput,
  CreateContactInput, UpdateContactInput,
} from './suppliers.schema';

function generateSupplierCode(): string {
  const now = new Date();
  const ym  = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const seq  = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `FOUR-${ym}-${seq}`;
}

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async listSuppliers(params: { page: number; limit: number; search?: string; status?: string; category?: string }) {
    const { page, limit, search, status, category } = params;
    const where: Record<string, unknown> = { deletedAt: null };
    if (status)   where['status']   = status;
    if (category) where['category'] = category;
    if (search) {
      where['OR'] = [
        { name:         { contains: search, mode: 'insensitive' } },
        { email:        { contains: search, mode: 'insensitive' } },
        { supplierCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { name: 'asc' },
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
          _count:   { select: { purchaseOrders: true, invoices: true } },
        },
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getSupplierById(id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where:   { id, deletedAt: null },
      include: {
        contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        _count:   { select: { purchaseOrders: true, invoices: true } },
      },
    });
    if (!supplier) throw AppError.notFound('Fournisseur introuvable');
    return supplier;
  }

  async createSupplier(data: CreateSupplierInput, createdById: string) {
    let supplierCode = generateSupplierCode();
    for (let i = 0; i < 5; i++) {
      const exists = await this.prisma.supplier.findFirst({ where: { supplierCode } });
      if (!exists) break;
      supplierCode = generateSupplierCode();
    }
    return this.prisma.supplier.create({
      data: {
        name:            data.name,
        type:            data.type,
        email:           data.email,
        phone:           data.phone,
        address:         data.address,
        city:            data.city,
        country:         data.country,
        taxNumber:         data.taxNumber,
        rccm:              data.rccm,
        website:           data.website,
        currency:          data.currency,
        defaultDueDays:    data.defaultDueDays,
        paymentMethod:     data.paymentMethod as any,
        status:            data.status as any,
        category:          data.category,
        rating:            data.rating,
        bankName:          data.bankName,
        bankAccount:       data.bankAccount,
        accountingAccount: data.accountingAccount,
        internalNotes:     data.internalNotes,
        supplierCode,
        createdById,
      },
    });
  }

  async updateSupplier(id: string, data: UpdateSupplierInput) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!supplier) throw AppError.notFound('Fournisseur introuvable');
    const patch: Record<string, unknown> = {};
    if (data.name           !== undefined) patch['name']           = data.name;
    if (data.type           !== undefined) patch['type']           = data.type;
    if (data.email          !== undefined) patch['email']          = data.email;
    if (data.phone          !== undefined) patch['phone']          = data.phone;
    if (data.address        !== undefined) patch['address']        = data.address;
    if (data.city           !== undefined) patch['city']           = data.city;
    if (data.country        !== undefined) patch['country']        = data.country;
    if (data.taxNumber         !== undefined) patch['taxNumber']         = data.taxNumber;
    if (data.rccm              !== undefined) patch['rccm']              = data.rccm;
    if (data.website           !== undefined) patch['website']           = data.website;
    if (data.currency          !== undefined) patch['currency']          = data.currency;
    if (data.defaultDueDays !== undefined) patch['defaultDueDays'] = data.defaultDueDays;
    if (data.paymentMethod  !== undefined) patch['paymentMethod']  = data.paymentMethod;
    if (data.status         !== undefined) patch['status']         = data.status;
    if (data.category       !== undefined) patch['category']       = data.category;
    if (data.rating         !== undefined) patch['rating']         = data.rating;
    if (data.bankName       !== undefined) patch['bankName']       = data.bankName;
    if (data.bankAccount       !== undefined) patch['bankAccount']       = data.bankAccount;
    if (data.accountingAccount !== undefined) patch['accountingAccount'] = data.accountingAccount;
    if (data.internalNotes     !== undefined) patch['internalNotes']     = data.internalNotes;
    return this.prisma.supplier.update({ where: { id }, data: patch as any });
  }

  async deleteSupplier(id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!supplier) throw AppError.notFound('Fournisseur introuvable');
    const unpaid = await this.prisma.supplierInvoice.count({
      where: { supplierId: id, deletedAt: null, status: { notIn: ['paid', 'cancelled'] as any[] } },
    });
    if (unpaid > 0) throw AppError.conflict(`Impossible : ${unpaid} facture(s) fournisseur non soldée(s)`);
    await this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async listContacts(supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null } });
    if (!supplier) throw AppError.notFound('Fournisseur introuvable');
    return this.prisma.supplierContact.findMany({
      where:   { supplierId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async addContact(supplierId: string, data: CreateContactInput) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null } });
    if (!supplier) throw AppError.notFound('Fournisseur introuvable');
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.supplierContact.updateMany({ where: { supplierId, isPrimary: true }, data: { isPrimary: false } });
      }
      return tx.supplierContact.create({ data: { ...(data as any), supplierId } });
    });
  }

  async updateContact(supplierId: string, contactId: string, data: UpdateContactInput) {
    const contact = await this.prisma.supplierContact.findFirst({ where: { id: contactId, supplierId } });
    if (!contact) throw AppError.notFound('Contact introuvable');
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.supplierContact.updateMany({
          where: { supplierId, isPrimary: true, id: { not: contactId } },
          data:  { isPrimary: false },
        });
      }
      return tx.supplierContact.update({ where: { id: contactId }, data: data as any });
    });
  }

  async deleteContact(supplierId: string, contactId: string) {
    const contact = await this.prisma.supplierContact.findFirst({ where: { id: contactId, supplierId } });
    if (!contact) throw AppError.notFound('Contact introuvable');
    await this.prisma.supplierContact.delete({ where: { id: contactId } });
  }

  async getSupplierPurchaseOrders(supplierId: string, params: { page: number; limit: number }) {
    const where = { supplierId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where, skip: (params.page - 1) * params.limit, take: params.limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, status: true, totalTtc: true, issueDate: true, expectedDeliveryDate: true },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { data, total };
  }

  async getSupplierInvoices(supplierId: string, params: { page: number; limit: number }) {
    const where = { supplierId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        where, skip: (params.page - 1) * params.limit, take: params.limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, status: true, totalTtc: true, invoiceDate: true, dueDate: true, balanceDue: true },
      }),
      this.prisma.supplierInvoice.count({ where }),
    ]);
    return { data, total };
  }

  async getFinancialSummary(id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!supplier) throw AppError.notFound('Fournisseur introuvable');

    const now           = new Date();
    const startOfYear   = new Date(now.getFullYear(), 0, 1);
    const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalPurchases, purchasesThisYear, purchasesThisMonth, pendingPayables, overduePayables,
           totalPayments, openPurchaseOrders, lastInvoices] = await Promise.all([
      this.prisma.supplierInvoice.aggregate({ where: { supplierId: id, deletedAt: null, status: { notIn: ['draft', 'cancelled'] as any[] } }, _sum: { totalTtc: true }, _count: true }),
      this.prisma.supplierInvoice.aggregate({ where: { supplierId: id, deletedAt: null, status: { notIn: ['draft', 'cancelled'] as any[] }, invoiceDate: { gte: startOfYear } }, _sum: { totalTtc: true } }),
      this.prisma.supplierInvoice.aggregate({ where: { supplierId: id, deletedAt: null, status: { notIn: ['draft', 'cancelled'] as any[] }, invoiceDate: { gte: startOfMonth } }, _sum: { totalTtc: true } }),
      this.prisma.supplierInvoice.aggregate({ where: { supplierId: id, deletedAt: null, status: { in: ['validated', 'partially_paid'] as any[] } }, _sum: { balanceDue: true }, _count: true }),
      this.prisma.supplierInvoice.aggregate({ where: { supplierId: id, deletedAt: null, status: { in: ['validated', 'partially_paid'] as any[] }, dueDate: { lt: now } }, _sum: { balanceDue: true }, _count: true }),
      this.prisma.supplierPayment.aggregate({ where: { supplierId: id }, _sum: { amount: true }, _count: true }),
      this.prisma.purchaseOrder.count({ where: { supplierId: id, deletedAt: null, status: { in: ['draft', 'sent', 'confirmed', 'partially_received'] as any[] } } }),
      this.prisma.supplierInvoice.findMany({ where: { supplierId: id, deletedAt: null }, orderBy: { invoiceDate: 'desc' }, take: 5, select: { id: true, number: true, status: true, totalTtc: true, balanceDue: true, invoiceDate: true, dueDate: true } }),
    ]);

    return {
      supplierId: id, supplierName: supplier.name,
      totalPurchases: { amount: Number(totalPurchases._sum.totalTtc ?? 0), invoiceCount: totalPurchases._count },
      purchasesThisYear:  Number(purchasesThisYear._sum.totalTtc ?? 0),
      purchasesThisMonth: Number(purchasesThisMonth._sum.totalTtc ?? 0),
      pendingPayables:  { amount: Number(pendingPayables._sum.balanceDue ?? 0),  count: pendingPayables._count },
      overduePayables:  { amount: Number(overduePayables._sum.balanceDue ?? 0),  count: overduePayables._count },
      totalPayments:    { amount: Number(totalPayments._sum.amount ?? 0),         count: totalPayments._count },
      openPurchaseOrders, lastInvoices,
    };
  }
}
