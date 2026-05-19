import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { CreateSupplierInput, UpdateSupplierInput, CreateContactInput, UpdateContactInput } from './suppliers.schema';

function generateSupplierCode(): string {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `FOUR-${ym}-${seq}`;
}

export async function listSuppliers(params: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  category?: string;
}) {
  const { page, limit, search, status, category } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { deletedAt: null };
  if (status) where['status'] = status;
  if (category) where['category'] = category;
  if (search) {
    where['OR'] = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { supplierCode: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        contacts: { where: { isPrimary: true }, take: 1 },
        _count: { select: { purchaseOrders: true, invoices: true } },
      },
    }),
    prisma.supplier.count({ where }),
  ]);

  return { data, total };
}

export async function getSupplierById(id: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id, deletedAt: null },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      _count: { select: { purchaseOrders: true, invoices: true } },
    },
  });
  if (!supplier) throw AppError.notFound('Fournisseur introuvable');
  return supplier;
}

export async function createSupplier(data: CreateSupplierInput, createdById: string) {
  let supplierCode = generateSupplierCode();
  let attempt = 0;
  while (attempt < 5) {
    const exists = await prisma.supplier.findFirst({ where: { supplierCode } });
    if (!exists) break;
    supplierCode = generateSupplierCode();
    attempt++;
  }

  return prisma.supplier.create({
    data: {
      ...(data as any),
      supplierCode,
      createdById,
    },
  });
}

export async function updateSupplier(id: string, data: UpdateSupplierInput) {
  const supplier = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!supplier) throw AppError.notFound('Fournisseur introuvable');
  return prisma.supplier.update({ where: { id }, data: data as any });
}

export async function deleteSupplier(id: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!supplier) throw AppError.notFound('Fournisseur introuvable');

  const unpaidInvoices = await prisma.supplierInvoice.count({
    where: { supplierId: id, deletedAt: null, status: { notIn: ['paid', 'cancelled'] as any[] } },
  });
  if (unpaidInvoices > 0) {
    throw AppError.conflict(`Impossible : ${unpaidInvoices} facture(s) fournisseur non soldée(s)`);
  }

  await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listContacts(supplierId: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null } });
  if (!supplier) throw AppError.notFound('Fournisseur introuvable');
  return prisma.supplierContact.findMany({
    where: { supplierId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function addContact(supplierId: string, data: CreateContactInput) {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null } });
  if (!supplier) throw AppError.notFound('Fournisseur introuvable');

  return prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.supplierContact.updateMany({
        where: { supplierId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.supplierContact.create({ data: { ...(data as any), supplierId } });
  });
}

export async function updateContact(supplierId: string, contactId: string, data: UpdateContactInput) {
  const contact = await prisma.supplierContact.findFirst({
    where: { id: contactId, supplierId },
  });
  if (!contact) throw AppError.notFound('Contact introuvable');

  return prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.supplierContact.updateMany({
        where: { supplierId, isPrimary: true, id: { not: contactId } },
        data: { isPrimary: false },
      });
    }
    return tx.supplierContact.update({ where: { id: contactId }, data: data as any });
  });
}

export async function deleteContact(supplierId: string, contactId: string) {
  const contact = await prisma.supplierContact.findFirst({
    where: { id: contactId, supplierId },
  });
  if (!contact) throw AppError.notFound('Contact introuvable');
  await prisma.supplierContact.delete({ where: { id: contactId } });
}

export async function getSupplierPurchaseOrders(supplierId: string, params: { page: number; limit: number }) {
  const { page, limit } = params;
  const where = { supplierId, deletedAt: null };
  const [data, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, status: true, totalTtc: true, issueDate: true, expectedDeliveryDate: true },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return { data, total };
}

export async function getSupplierInvoices(supplierId: string, params: { page: number; limit: number }) {
  const { page, limit } = params;
  const where = { supplierId, deletedAt: null };
  const [data, total] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, status: true, totalTtc: true, invoiceDate: true, dueDate: true, balanceDue: true },
    }),
    prisma.supplierInvoice.count({ where }),
  ]);
  return { data, total };
}

export async function getFinancialSummary(id: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!supplier) throw AppError.notFound('Fournisseur introuvable');

  const now = new Date();
  const startOfYear  = new Date(now.getFullYear(), 0, 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalPurchases,
    purchasesThisYear,
    purchasesThisMonth,
    pendingPayables,
    overduePayables,
    totalPayments,
    openPurchaseOrders,
    lastInvoices,
  ] = await Promise.all([
    prisma.supplierInvoice.aggregate({
      where: { supplierId: id, deletedAt: null, status: { notIn: ['draft', 'cancelled'] as any[] } },
      _sum: { totalTtc: true },
      _count: true,
    }),
    prisma.supplierInvoice.aggregate({
      where: {
        supplierId: id, deletedAt: null,
        status: { notIn: ['draft', 'cancelled'] as any[] },
        invoiceDate: { gte: startOfYear },
      },
      _sum: { totalTtc: true },
    }),
    prisma.supplierInvoice.aggregate({
      where: {
        supplierId: id, deletedAt: null,
        status: { notIn: ['draft', 'cancelled'] as any[] },
        invoiceDate: { gte: startOfMonth },
      },
      _sum: { totalTtc: true },
    }),
    prisma.supplierInvoice.aggregate({
      where: {
        supplierId: id, deletedAt: null,
        status: { in: ['validated', 'partially_paid'] as any[] },
      },
      _sum: { balanceDue: true },
      _count: true,
    }),
    prisma.supplierInvoice.aggregate({
      where: {
        supplierId: id, deletedAt: null,
        status: { in: ['validated', 'partially_paid'] as any[] },
        dueDate: { lt: now },
      },
      _sum: { balanceDue: true },
      _count: true,
    }),
    prisma.supplierPayment.aggregate({
      where: { supplierId: id },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.purchaseOrder.count({
      where: {
        supplierId: id, deletedAt: null,
        status: { in: ['draft', 'sent', 'confirmed', 'partially_received'] as any[] },
      },
    }),
    prisma.supplierInvoice.findMany({
      where: { supplierId: id, deletedAt: null },
      orderBy: { invoiceDate: 'desc' },
      take: 5,
      select: {
        id: true, number: true, status: true,
        totalTtc: true, balanceDue: true, invoiceDate: true, dueDate: true,
      },
    }),
  ]);

  return {
    supplierId: id,
    supplierName: supplier.name,
    totalPurchases: {
      amount: Number(totalPurchases._sum.totalTtc ?? 0),
      invoiceCount: totalPurchases._count,
    },
    purchasesThisYear:  Number(purchasesThisYear._sum.totalTtc ?? 0),
    purchasesThisMonth: Number(purchasesThisMonth._sum.totalTtc ?? 0),
    pendingPayables: {
      amount: Number(pendingPayables._sum.balanceDue ?? 0),
      count:  pendingPayables._count,
    },
    overduePayables: {
      amount: Number(overduePayables._sum.balanceDue ?? 0),
      count:  overduePayables._count,
    },
    totalPayments: {
      amount: Number(totalPayments._sum.amount ?? 0),
      count:  totalPayments._count,
    },
    openPurchaseOrders,
    lastInvoices,
  };
}
