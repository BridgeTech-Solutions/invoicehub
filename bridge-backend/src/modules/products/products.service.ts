import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateProductInput,
  UpdateProductInput,
  ListProductsInput,
} from './products.schema';

export class ProductsService {
  // --- Categories ---

  async listCategories() {
    return prisma.productCategory.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findCategoryById(id: string) {
    const cat = await prisma.productCategory.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    if (!cat) throw AppError.notFound('Catégorie introuvable');
    return cat;
  }

  async createCategory(input: CreateCategoryInput, createdById: string) {
    return prisma.productCategory.create({
      data: { ...input, createdById },
    });
  }

  async updateCategory(id: string, input: UpdateCategoryInput) {
    await this.findCategoryById(id);
    return prisma.productCategory.update({ where: { id }, data: input });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.findCategoryById(id);
    const hasProducts = await prisma.product.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (hasProducts > 0) {
      throw AppError.conflict('Impossible de supprimer une catégorie contenant des produits actifs');
    }
    await prisma.productCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // --- Products ---

  async list(input: ListProductsInput) {
    const { page, limit, categoryId, type, isActive, search, clientId } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(categoryId && { categoryId }),
      ...(type && { type }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: { category: { select: { id: true, name: true, icon: true, color: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    // Si clientId fourni : annoter chaque produit avec usageCount + lastPriceForClient
    // et retrier par usage décroissant (mode autocomplete intelligent)
    if (clientId && products.length > 0) {
      const productIds = products.map(p => p.id);

      type UsageRow = { product_id: string; usage_count: bigint; last_price_ht: string | null };
      const usageRows = await prisma.$queryRaw<UsageRow[]>`
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
        usageCount:          Number(usageMap.get(p.id)?.usage_count ?? 0),
        lastPriceForClient:  usageMap.get(p.id)?.last_price_ht !== undefined
          ? Number(usageMap.get(p.id)!.last_price_ht)
          : null,
      }));

      // Trier : produits déjà utilisés avec ce client en premier, puis alphabétique
      annotated.sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));

      return { data: annotated, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    return { data: products, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Retourne les valeurs par défaut pour pré-remplir une ligne de document.
   *
   * Si clientId est fourni, inclut le dernier prix et la dernière quantité
   * facturés pour ce produit à ce client — permet de suggérer le tarif habituel.
   *
   * @param productId - UUID du produit
   * @param clientId  - UUID du client (optionnel)
   */
  async lineDefaults(productId: string, clientId?: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        id: true, name: true, reference: true, description: true,
        unit: true, unitPriceHt: true, taxRateValue: true,
      },
    });
    if (!product) throw AppError.notFound('Produit introuvable');

    let lastPriceForClient: number | null = null;
    let lastQuantityForClient: number | null = null;

    if (clientId) {
      type LastLineRow = { unit_price_ht: string; quantity: string };
      const rows = await prisma.$queryRaw<LastLineRow[]>`
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
        lastPriceForClient     = Number(rows[0].unit_price_ht);
        lastQuantityForClient  = Number(rows[0].quantity);
      }
    }

    const catalogPrice = Number(product.unitPriceHt);

    return {
      designation:          product.name,
      description:          product.description ?? null,
      unit:                 product.unit,
      unitPriceHt:          catalogPrice,
      taxRate:              product.taxRateValue,
      /** Prix du catalogue — référence */
      catalogPrice,
      /** Dernier prix facturé à ce client (null si aucun historique) */
      lastPriceForClient,
      /** Dernière quantité facturée à ce client */
      lastQuantityForClient,
      /** Quantité suggérée : dernière utilisée ou 1 par défaut */
      defaultQuantity:      lastQuantityForClient ?? 1,
      /** Vrai si le prix catalogue a changé depuis la dernière facture à ce client */
      priceChangedSinceLastInvoice:
        lastPriceForClient !== null && lastPriceForClient !== catalogPrice,
    };
  }

  async findById(id: string) {
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: { select: { id: true, name: true } },
        taxRate: { select: { id: true, name: true, code: true, rate: true } },
      },
    });
    if (!product) throw AppError.notFound('Produit introuvable');
    return product;
  }

  async create(input: CreateProductInput, createdById: string) {
    return prisma.product.create({
      data: {
        ...input,
        unitPriceHt: input.unitPriceHt,
        taxRateValue: input.taxRateValue,
        metadata: input.metadata ?? {},
        createdById,
      },
      include: {
        category: { select: { id: true, name: true } },
        taxRate: { select: { id: true, name: true, rate: true } },
      },
    });
  }

  async update(id: string, input: UpdateProductInput) {
    await this.findById(id);
    return prisma.product.update({ where: { id }, data: input });
  }

  async softDelete(id: string): Promise<void> {
    await this.findById(id);
    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}

export const productsService = new ProductsService();
