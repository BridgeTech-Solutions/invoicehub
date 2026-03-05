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
    const { page, limit, categoryId, type, isActive, search } = input;
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

    const [total, data] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: { category: { select: { id: true, name: true, icon: true, color: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
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
