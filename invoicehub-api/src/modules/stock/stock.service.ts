import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { onStockMovement } from '../../lib/accountingEngine';
import type { AdjustStockInput, ListMovementsInput, StockLevelsInput } from './stock.schema';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/** Types dont la quantité SORT du stock */
const EXIT_TYPES = new Set(['sale', 'adjustment_out', 'write_off', 'return_supplier', 'transfer_out']);

export interface StockMovementData {
  productId:    string;
  quantity:     number;
  type:         string;
  unitCostHt?:  number | null;
  sourceType?:  string | null;
  sourceId?:    string | null;
  sourceLabel?: string | null;
  notes?:       string | null;
  location?:    string | null;
  createdById:  string;
}

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Nœud central : création d'un mouvement de stock ──────────────────────────

  async createStockMovement(data: StockMovementData, externalTx?: Tx) {
    const runInTx = async (tx: Tx) => {
      const product = await tx.product.findFirst({
        where:   { id: data.productId, deletedAt: null },
        include: {
          category:        { select: { id: true, stockAccountingAccount: true, cogsAccountingAccount: true, lossAccountingAccount: true } },
          defaultSupplier: { select: { id: true, accountingAccount: true, name: true } },
        },
      });
      if (!product) throw AppError.notFound('Produit introuvable');
      if (!product.trackStock) throw AppError.badRequest('Ce produit ne gère pas le stock');

      const isExit    = EXIT_TYPES.has(data.type);
      const signedQty = isExit ? -Math.abs(data.quantity) : Math.abs(data.quantity);

      const currentQty   = Number(product.stockQuantity ?? 0);
      const currentValue = Number(product.stockValue    ?? 0);
      const currentCmup  = Number(product.costPriceHt   ?? 0);

      // Vérification stock suffisant pour les sorties (sauf write_off)
      if (isExit && data.type !== 'write_off' && currentQty < Math.abs(signedQty)) {
        throw AppError.badRequest(
          `Stock insuffisant pour "${product.name}" : disponible ${currentQty}, demandé ${Math.abs(signedQty)}`,
        );
      }

      // ── CMUP et valorisation ───────────────────────────────────────────────
      const newQty = currentQty + signedQty;
      let newCmup = currentCmup;
      let newStockValue: number;

      if (!isExit && data.unitCostHt != null && data.unitCostHt > 0) {
        const addedValue = Math.abs(signedQty) * data.unitCostHt;
        const totalValue = currentValue + addedValue;
        const totalQty   = currentQty + Math.abs(signedQty);
        newCmup          = totalQty > 0 ? totalValue / totalQty : data.unitCostHt;
        newStockValue    = totalValue;
      } else if (!isExit) {
        newStockValue = newQty * currentCmup;
      } else {
        newStockValue = Math.max(0, currentValue - Math.abs(signedQty) * currentCmup);
      }

      const unitCostUsed = isExit ? currentCmup : (data.unitCostHt ?? currentCmup ?? null);
      const totalCostHt  = unitCostUsed != null ? Math.abs(signedQty) * unitCostUsed : null;

      // ── Création du mouvement ─────────────────────────────────────────────
      const movement = await tx.stockMovement.create({
        data: {
          productId:      data.productId,
          type:           data.type as any,
          quantity:       signedQty,
          quantityBefore: currentQty,
          quantityAfter:  newQty,
          unitCostHt:     unitCostUsed,
          totalCostHt,
          sourceType:     data.sourceType  ?? null,
          sourceId:       data.sourceId    ?? null,
          sourceLabel:    data.sourceLabel ?? null,
          location:       data.location    ?? null,
          notes:          data.notes       ?? null,
          createdById:    data.createdById,
        },
      });

      // ── Mise à jour du produit (qty + valeur + CMUP) ──────────────────────
      await tx.product.update({
        where: { id: data.productId },
        data:  {
          stockQuantity: newQty,
          stockValue:    newStockValue,
          ...(newCmup !== currentCmup && { costPriceHt: newCmup }),
        },
      });

      // ── Écriture comptable SYSCOHADA (silencieuse) ────────────────────────
      const stockAccount = product.stockAccountingAccount
        ?? product.category?.stockAccountingAccount
        ?? '311000';
      const cogsAccount  = product.cogsAccountingAccount
        ?? product.category?.cogsAccountingAccount
        ?? '603100';
      const lossAccount  = product.lossAccountingAccount
        ?? product.category?.lossAccountingAccount
        ?? '603200';

      const settings = await tx.companySettings.findFirst({
        select: { initialStockAccount: true },
      });

      await onStockMovement({
        movementId:           movement.id,
        productId:            data.productId,
        productName:          product.name,
        movementType:         data.type,
        signedQty,
        totalCostHt:          totalCostHt ?? 0,
        stockAccount,
        cogsAccount,
        lossAccount,
        supplierAccount:      (product.defaultSupplier as any)?.accountingAccount ?? '401000',
        initialStockAccount:  (settings as any)?.initialStockAccount ?? '108000',
        sourceLabel:          data.sourceLabel ?? null,
      }, tx);

      return { movement, newQty };
    };

    const result = externalTx
      ? await runInTx(externalTx)
      : await this.prisma.$transaction(runInTx);

    // Événement stock.low hors transaction
    if (!externalTx) {
      const { newQty } = result;
      const refreshed = await this.prisma.product.findFirst({
        where:  { id: data.productId },
        select: { stockMinLevel: true },
      });
      const minLevel = Number(refreshed?.stockMinLevel ?? 0);
      if (minLevel > 0 && newQty < minLevel) {
        this.events.emit('stock.low', { productId: data.productId, currentQty: newQty, minLevel });
      }
    }

    return result.movement;
  }

  // ── Ajustement manuel ────────────────────────────────────────────────────────

  async adjustStock(data: AdjustStockInput, userId: string) {
    return this.createStockMovement({
      productId:   data.productId,
      quantity:    data.quantity,
      type:        data.type,
      unitCostHt:  data.unitCostHt ?? null,
      notes:       data.notes,
      location:    data.location   ?? null,
      sourceLabel: data.sourceLabel ?? null,
      createdById: userId,
    });
  }

  // ── Mouvements ───────────────────────────────────────────────────────────────

  async listMovements(input: ListMovementsInput) {
    const { page, limit, productId, type, dateFrom, dateTo, sourceType } = input;
    const where: Prisma.StockMovementWhereInput = {};
    if (productId)  where.productId  = productId;
    if (type)       where.type       = type as any;
    if (sourceType) where.sourceType = sourceType;
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo + 'T23:59:59') } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: {
          product:   { select: { id: true, name: true, reference: true, stockUnit: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getMovementById(id: string) {
    const m = await this.prisma.stockMovement.findUnique({
      where:   { id },
      include: {
        product:   { select: { id: true, name: true, reference: true, stockUnit: true, unit: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!m) throw AppError.notFound('Mouvement de stock introuvable');
    return m;
  }

  // ── Niveaux de stock ─────────────────────────────────────────────────────────

  async getStockLevels(input: StockLevelsInput) {
    const { page, limit, search, lowStock, rupture, categoryId } = input;
    const where: Prisma.ProductWhereInput = { trackStock: true, deletedAt: null };

    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { name:      { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { barcode:   { contains: search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, reference: true, barcode: true, imageUrl: true,
          stockQuantity: true, stockMinLevel: true, stockMaxLevel: true,
          stockUnit: true, costPriceHt: true, stockValue: true,
          category: { select: { id: true, name: true, color: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const enriched = products.map(p => {
      const qty = Number(p.stockQuantity ?? 0);
      const min = Number(p.stockMinLevel ?? 0);
      const max = Number(p.stockMaxLevel ?? 0);
      const stockStatus = qty <= 0       ? 'rupture'
        : min > 0 && qty < min           ? 'bas'
        : max > 0 && qty > max           ? 'surstock'
        :                                  'normal';
      return { ...p, stockStatus };
    });

    const filtered = rupture ? enriched.filter(p => p.stockStatus === 'rupture')
      : lowStock             ? enriched.filter(p => p.stockStatus === 'bas' || p.stockStatus === 'rupture')
      : enriched;

    return { data: filtered, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getProductStockHistory(productId: string, page: number, limit: number) {
    const product = await this.prisma.product.findFirst({
      where:  { id: productId, deletedAt: null, trackStock: true },
      select: {
        id: true, name: true, reference: true,
        stockQuantity: true, costPriceHt: true, stockValue: true,
        stockMinLevel: true, stockMaxLevel: true, stockUnit: true,
      },
    });
    if (!product) throw AppError.notFound('Produit introuvable ou sans gestion de stock');

    const [movements, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where:   { productId },
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.stockMovement.count({ where: { productId } }),
    ]);

    return { product, movements, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Alertes ──────────────────────────────────────────────────────────────────

  async getStockAlerts() {
    const products = await this.prisma.product.findMany({
      where:   { trackStock: true, deletedAt: null, stockMinLevel: { not: null } },
      select:  {
        id: true, name: true, reference: true, imageUrl: true,
        stockQuantity: true, stockMinLevel: true, stockMaxLevel: true,
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: { name: 'asc' },
    });

    return products
      .map(p => {
        const qty = Number(p.stockQuantity ?? 0);
        const min = Number(p.stockMinLevel ?? 0);
        return {
          ...p,
          stockStatus: qty <= 0 ? 'rupture' : qty < min ? 'bas' : 'normal',
          deficit: Math.max(0, min - qty),
        };
      })
      .filter(p => p.stockStatus !== 'normal');
  }

  // ── Résumé global ────────────────────────────────────────────────────────────

  async getStockSummary() {
    const [allTracked, ruptureCount] = await Promise.all([
      this.prisma.product.count({ where: { trackStock: true, deletedAt: null } }),
      this.prisma.product.count({ where: { trackStock: true, deletedAt: null, stockQuantity: { lte: 0 } } }),
    ]);

    const [lowStockProducts, surstockProducts] = await Promise.all([
      this.prisma.product.findMany({
        where:  { trackStock: true, deletedAt: null, stockMinLevel: { not: null } },
        select: { stockQuantity: true, stockMinLevel: true },
      }),
      this.prisma.product.findMany({
        where:  { trackStock: true, deletedAt: null, stockMaxLevel: { not: null } },
        select: { stockQuantity: true, stockMaxLevel: true },
      }),
    ]);

    const lowStockCount  = lowStockProducts.filter(p => Number(p.stockQuantity) < Number(p.stockMinLevel)).length;
    const surstockCount  = surstockProducts.filter(p => Number(p.stockQuantity) > Number(p.stockMaxLevel)).length;

    const stockValueAgg = await this.prisma.product.aggregate({
      where: { trackStock: true, deletedAt: null },
      _sum:  { stockValue: true as any },
    });

    const lastMovements = await this.prisma.stockMovement.findMany({
      orderBy: { createdAt: 'desc' },
      take:    10,
      include: { product: { select: { id: true, name: true } } },
    });

    return {
      totalTrackedProducts: allTracked,
      rupture:    ruptureCount,
      lowStock:   lowStockCount,
      surstock:   surstockCount,
      totalStockValue: Number((stockValueAgg._sum.stockValue ?? 0) as any),
      lastMovements,
    };
  }
}
