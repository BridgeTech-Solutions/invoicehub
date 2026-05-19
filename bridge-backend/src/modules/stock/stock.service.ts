import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { eventBus } from '../../lib/eventBus';
import { AdjustStockInput } from './stock.schema';

export interface StockMovementData {
  productId: string;
  quantity: number;
  type: string;
  unitCostHt?: number | null;
  sourceType?: string | null;
  sourceId?: string | null;
  notes?: string | null;
  location?: string | null;
  createdById: string;
}

/**
 * Crée un mouvement de stock et met à jour stock_quantity du produit.
 * Centralisé : appelé par purchase-orders (réception) et ajustements manuels.
 */
export async function createStockMovement(data: StockMovementData) {
  const product = await prisma.product.findFirst({
    where: { id: data.productId, deletedAt: null },
    select: { id: true, trackStock: true, stockQuantity: true, stockMinLevel: true },
  });
  if (!product) throw AppError.notFound('Produit introuvable');
  if (!product.trackStock) throw AppError.badRequest('Ce produit ne gère pas le stock');

  const newQty = Number(product.stockQuantity ?? 0) + data.quantity;

  return prisma.$transaction(async (tx) => {
    const movement = await tx.stockMovement.create({
      data: {
        productId: data.productId,
        type: data.type as any,
        quantity: data.quantity,
        unitCostHt: data.unitCostHt,
        quantityBefore: Number(product.stockQuantity ?? 0),
        quantityAfter: newQty,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        notes: data.notes,
        location: data.location,
        createdById: data.createdById,
      },
    });
    await tx.product.update({
      where: { id: data.productId },
      data: { stockQuantity: newQty },
    });
    return movement;
  }).then((movement) => {
    const minLevel = Number(product.stockMinLevel ?? 0);
    if (minLevel > 0 && newQty < minLevel) {
      void eventBus.emit('stock.low', { productId: data.productId, currentQty: newQty, minLevel });
    }
    return movement;
  });
}

export async function listMovements(params: {
  page: number; limit: number;
  productId?: string; type?: string;
  dateFrom?: string; dateTo?: string;
}) {
  const { page, limit, productId, type, dateFrom, dateTo } = params;
  const where: Record<string, unknown> = {};
  if (productId) where['productId'] = productId;
  if (type) where['type'] = type;
  if (dateFrom || dateTo) {
    where['createdAt'] = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  const [data, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, reference: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);
  return { data, total };
}

export async function getMovementById(id: string) {
  const m = await prisma.stockMovement.findUnique({
    where: { id },
    include: { product: true, createdBy: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!m) throw AppError.notFound('Mouvement de stock introuvable');
  return m;
}

export async function getStockLevels(params: { page: number; limit: number; search?: string; lowStock?: boolean }) {
  const { page, limit, search, lowStock } = params;
  const where: Record<string, unknown> = { trackStock: true, deletedAt: null };
  if (search) where['OR'] = [
    { name: { contains: search, mode: 'insensitive' } },
    { reference: { contains: search, mode: 'insensitive' } },
  ];

  const products = await prisma.product.findMany({
    where,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, reference: true,
      stockQuantity: true, stockMinLevel: true, stockMaxLevel: true,
    },
  });

  const filtered = lowStock
    ? products.filter((p) => Number(p.stockQuantity ?? 0) < Number(p.stockMinLevel ?? 0))
    : products;

  return filtered;
}

export async function getProductStockHistory(productId: string, params: { page: number; limit: number }) {
  const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
  if (!product) throw AppError.notFound('Produit introuvable');

  const [data, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { productId },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockMovement.count({ where: { productId } }),
  ]);
  return { data, total };
}

export async function getStockAlerts() {
  return prisma.product.findMany({
    where: {
      trackStock: true,
      deletedAt: null,
      stockMinLevel: { not: null },
    },
    select: {
      id: true, name: true, reference: true,
      stockQuantity: true, stockMinLevel: true,
    },
    orderBy: { name: 'asc' },
  }).then((products) =>
    products.filter((p) => Number(p.stockQuantity ?? 0) < Number(p.stockMinLevel ?? 0))
  );
}

export async function adjustStock(data: AdjustStockInput, userId: string) {
  return createStockMovement({
    productId: data.productId,
    quantity: data.type === 'adjustment_out' ? -Math.abs(data.quantity) : Math.abs(data.quantity),
    type: data.type,
    unitCostHt: data.unitCostHt,
    notes: data.notes,
    location: data.location,
    createdById: userId,
  });
}
