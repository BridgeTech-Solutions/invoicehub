import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateProductInput,
  UpdateProductInput,
  ListProductsInput,
  ImportProductRow,
} from './products.schema';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Catégories ────────────────────────────────────────────────

  async listCategories() {
    return this.prisma.productCategory.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findCategoryById(id: string) {
    const cat = await this.prisma.productCategory.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    if (!cat) throw AppError.notFound('Catégorie introuvable');
    return cat;
  }

  async createCategory(input: CreateCategoryInput, createdById: string) {
    return this.prisma.productCategory.create({
      data: { ...input, createdById },
    });
  }

  async updateCategory(id: string, input: UpdateCategoryInput) {
    await this.findCategoryById(id);
    return this.prisma.productCategory.update({ where: { id }, data: input });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.findCategoryById(id);
    const hasProducts = await this.prisma.product.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (hasProducts > 0) {
      throw AppError.conflict('Impossible de supprimer une catégorie contenant des produits actifs');
    }
    await this.prisma.productCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ── Produits ──────────────────────────────────────────────────

  async list(input: ListProductsInput) {
    const { page, limit, categoryId, type, isActive, search, clientId, trackStock } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(categoryId  && { categoryId }),
      ...(type        && { type }),
      ...(trackStock !== undefined && { trackStock }),
      ...(isActive !== undefined  && { isActive }),
      ...(search && {
        OR: [
          { name:      { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { barcode:   { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: { category: { select: { id: true, name: true, icon: true, color: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    if (clientId && products.length > 0) {
      const productIds = products.map(p => p.id);

      type UsageRow = { product_id: string; usage_count: bigint; last_price_ht: string | null };
      const usageRows = await this.prisma.$queryRaw<UsageRow[]>`
        WITH ranked AS (
          SELECT
            il.product_id,
            il.unit_price_ht,
            ROW_NUMBER() OVER (PARTITION BY il.product_id ORDER BY i.created_at DESC) AS rn,
            COUNT(*) OVER (PARTITION BY il.product_id) AS usage_count
          FROM invoice_lines il
          JOIN invoices i ON i.id = il.invoice_id
          WHERE i.client_id = ${clientId}::uuid
            AND i.deleted_at IS NULL
            AND il.product_id = ANY(${productIds}::uuid[])
        )
        SELECT product_id, usage_count, unit_price_ht AS last_price_ht
        FROM ranked WHERE rn = 1
      `;

      const usageMap = new Map(usageRows.map(r => [r.product_id, r]));

      const annotated = products.map(p => ({
        ...p,
        usageCount:         Number(usageMap.get(p.id)?.usage_count ?? 0),
        lastPriceForClient: usageMap.get(p.id)?.last_price_ht !== undefined
          ? Number(usageMap.get(p.id)!.last_price_ht)
          : null,
      }));

      annotated.sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));
      return { data: annotated, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    return { data: products, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async lineDefaults(productId: string, clientId?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        id: true, name: true, reference: true, description: true,
        unit: true, unitPriceHt: true, taxRateValue: true,
        trackStock: true, stockQuantity: true,
      },
    });
    if (!product) throw AppError.notFound('Produit introuvable');

    let lastPriceForClient: number | null = null;
    let lastQuantityForClient: number | null = null;

    if (clientId) {
      type LastLineRow = { unit_price_ht: string; quantity: string };
      const rows = await this.prisma.$queryRaw<LastLineRow[]>`
        SELECT il.unit_price_ht, il.quantity
        FROM invoice_lines il
        JOIN invoices i ON i.id = il.invoice_id
        WHERE il.product_id = ${productId}::uuid
          AND i.client_id  = ${clientId}::uuid
          AND i.deleted_at IS NULL
        ORDER BY i.created_at DESC
        LIMIT 1
      `;
      if (rows.length > 0) {
        lastPriceForClient    = Number(rows[0].unit_price_ht);
        lastQuantityForClient = Number(rows[0].quantity);
      }
    }

    const catalogPrice = Number(product.unitPriceHt);

    return {
      designation:          product.name,
      description:          product.description ?? null,
      unit:                 product.unit,
      unitPriceHt:          catalogPrice,
      taxRate:              product.taxRateValue,
      catalogPrice,
      lastPriceForClient,
      lastQuantityForClient,
      defaultQuantity:      lastQuantityForClient ?? 1,
      priceChangedSinceLastInvoice:
        lastPriceForClient !== null && lastPriceForClient !== catalogPrice,
      stockQuantity: product.trackStock ? Number(product.stockQuantity) : null,
    };
  }

  async findById(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: { select: { id: true, name: true } },
        taxRate:  { select: { id: true, name: true, code: true, rate: true } },
      },
    });
    if (!product) throw AppError.notFound('Produit introuvable');
    return product;
  }

  async create(input: CreateProductInput, createdById: string) {
    const { metadata, ...rest } = input;
    return this.prisma.product.create({
      data: {
        ...rest,
        metadata: (metadata ?? {}) as object,
        createdById,
      },
      include: {
        category: { select: { id: true, name: true } },
        taxRate:  { select: { id: true, name: true, rate: true } },
      },
    });
  }

  async update(id: string, input: UpdateProductInput) {
    const existing = await this.findById(id);

    // Si passage de product → service, forcer désactivation du stock
    const forceNoStock = input.type === 'service' && existing.type !== 'service';
    const { metadata, ...rest } = input;

    const data: Prisma.ProductUpdateInput = {
      ...rest,
      ...(metadata !== undefined && { metadata: metadata as object }),
      ...(forceNoStock && {
        trackStock:        false,
        stockMinLevel:     null,
        stockMaxLevel:     null,
        stockUnit:         null,
        purchasePriceHt:   null,
        defaultSupplierId: null,
      }),
    };

    return this.prisma.product.update({ where: { id }, data });
  }

  async softDelete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.product.update({
      where: { id },
      data:  { deletedAt: new Date(), isActive: false },
    });
  }

  async getStockStatus(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null, trackStock: true },
      select: {
        id: true, name: true, reference: true, imageUrl: true as any,
        stockQuantity: true, stockMinLevel: true, stockMaxLevel: true,
        stockUnit: true, costPriceHt: true, stockValue: true as any, purchasePriceHt: true,
        category: { select: { id: true, name: true, color: true } },
      },
    });
    if (!product) throw AppError.notFound('Produit introuvable ou sans gestion de stock');

    const qty = Number(product.stockQuantity);
    const min = Number(product.stockMinLevel ?? 0);
    const max = Number(product.stockMaxLevel ?? 0);

    const stockStatus = qty <= 0       ? 'rupture'
      : min > 0 && qty < min           ? 'bas'
      : max > 0 && qty > max           ? 'surstock'
      :                                  'normal';

    const lastMovements = await this.prisma.stockMovement.findMany({
      where:   { productId: id },
      orderBy: { createdAt: 'desc' },
      take:    5,
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });

    return { ...product, stockStatus, lastMovements };
  }

  async importProducts(rows: ImportProductRow[], createdById: string): Promise<{
    created:    number;
    duplicates: { index: number; name: string; reason: string }[];
    errors:     { index: number; name: string; message: string }[];
  }> {
    const categoryNames = [...new Set(
      rows.map(r => r.categoryName).filter((n): n is string => !!n),
    )];
    const categoryMap = new Map<string, string>();
    if (categoryNames.length > 0) {
      const cats = await this.prisma.productCategory.findMany({
        where: { name: { in: categoryNames, mode: 'insensitive' }, deletedAt: null },
        select: { id: true, name: true },
      });
      cats.forEach(c => categoryMap.set(c.name.toLowerCase(), c.id));
    }

    const names      = rows.map(r => r.name).filter(Boolean);
    const references = rows.map(r => r.reference).filter((r): r is string => !!r);

    const existing = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { in: names, mode: Prisma.QueryMode.insensitive } },
          ...(references.length > 0 ? [{ reference: { in: references, mode: Prisma.QueryMode.insensitive } }] : []),
        ],
      },
      select: { name: true, reference: true },
    });
    const existingNames = new Set(existing.map(p => p.name.toLowerCase()));
    const existingRefs  = new Set(existing.map(p => p.reference?.toLowerCase()).filter(Boolean) as string[]);

    const toCreate: Prisma.ProductCreateManyInput[] = [];
    const duplicates: { index: number; name: string; reason: string }[] = [];
    const errors:     { index: number; name: string; message: string }[] = [];

    rows.forEach((row, i) => {
      if (row.reference && existingRefs.has(row.reference.toLowerCase())) {
        duplicates.push({ index: i, name: row.name, reason: `Référence déjà existante : ${row.reference}` });
        return;
      }
      if (existingNames.has(row.name.toLowerCase())) {
        duplicates.push({ index: i, name: row.name, reason: `Nom déjà existant : ${row.name}` });
        return;
      }

      const categoryId = row.categoryName
        ? (categoryMap.get(row.categoryName.toLowerCase()) ?? null)
        : null;

      toCreate.push({
        name:         row.name,
        reference:    row.reference ?? null,
        type:         row.type,
        description:  row.description ?? null,
        unit:         row.unit,
        unitPriceHt:  row.unitPriceHt,
        taxRateValue: row.taxRateValue,
        isActive:     row.isActive,
        categoryId,
        createdById,
        metadata:     {},
      });

      existingNames.add(row.name.toLowerCase());
      if (row.reference) existingRefs.add(row.reference.toLowerCase());
    });

    if (toCreate.length > 0) {
      await this.prisma.product.createMany({ data: toCreate });
    }

    return { created: toCreate.length, duplicates, errors };
  }
}
