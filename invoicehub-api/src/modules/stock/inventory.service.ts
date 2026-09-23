import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { StockService } from './stock.service';
import type { CreateInventoryInput, SaveCountsInput } from './stock.schema';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  /** INV-AAAA-NNN (séquence par année civile). */
  private async nextReference(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const n = await this.prisma.inventorySession.count({ where: { reference: { startsWith: `INV-${year}-` } } });
    return `INV-${year}-${String(n + 1).padStart(3, '0')}`;
  }

  /**
   * Crée une session et FIGE le stock théorique de chaque produit suivi (option :
   * limité à une catégorie). La session naît « en cours » (comptage ouvert).
   */
  async createSession(input: CreateInventoryInput, userId: string) {
    const products = await this.prisma.product.findMany({
      where:  { trackStock: true, deletedAt: null, ...(input.categoryId ? { categoryId: input.categoryId } : {}) },
      select: { id: true, stockQuantity: true, costPriceHt: true },
    });
    if (products.length === 0) throw AppError.badRequest('Aucun produit suivi en stock pour cette portée.');

    const reference = await this.nextReference();

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.inventorySession.create({
        data: {
          reference,
          status:      'in_progress',
          notes:       input.notes ?? null,
          categoryId:  input.categoryId ?? null,
          createdById: userId,
        },
      });
      await tx.inventoryCountLine.createMany({
        data: products.map((p) => ({
          sessionId:      session.id,
          productId:      p.id,
          theoreticalQty: p.stockQuantity ?? 0,
          unitCostHt:     p.costPriceHt ?? null,
        })),
      });
      return session;
    });
  }

  async listSessions() {
    const sessions = await this.prisma.inventorySession.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { lines: true } } },
    });
    return sessions.map((s) => ({
      id: s.id, reference: s.reference, status: s.status, notes: s.notes,
      categoryId: s.categoryId, lineCount: s._count.lines,
      validatedAt: s.validatedAt, createdAt: s.createdAt,
    }));
  }

  async getSession(id: string) {
    const session = await this.prisma.inventorySession.findUnique({
      where:   { id },
      include: {
        lines: {
          orderBy: { product: { name: 'asc' } },
          include: { product: { select: { id: true, name: true, reference: true, stockUnit: true, stockQuantity: true } } },
        },
      },
    });
    if (!session) throw AppError.notFound('Session d\'inventaire introuvable');

    const lines = session.lines.map((l) => {
      const theoretical = Number(l.theoreticalQty);
      const counted     = l.countedQty != null ? Number(l.countedQty) : null;
      const gap         = counted != null ? counted - theoretical : null;
      return {
        id: l.id, productId: l.productId,
        productName: l.product.name, productReference: l.product.reference, stockUnit: l.product.stockUnit,
        theoreticalQty: theoretical,
        currentQty: Number(l.product.stockQuantity ?? 0),
        countedQty: counted,
        unitCostHt: l.unitCostHt != null ? Number(l.unitCostHt) : null,
        gap,
        gapValue: gap != null && l.unitCostHt != null ? gap * Number(l.unitCostHt) : null,
        movementId: l.movementId,
        notes: l.notes,
      };
    });

    // Noms créateur/valideur (ids scalaires, pas de relation) — une requête.
    const userIds = [session.createdById, session.validatedById].filter(Boolean) as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const nameOf = (uid: string | null) => {
      const u = users.find((x) => x.id === uid);
      return u ? `${u.firstName} ${u.lastName}` : null;
    };

    const counted = lines.filter((l) => l.countedQty != null).length;
    const gaps    = lines.filter((l) => l.gap != null && l.gap !== 0);

    return {
      id: session.id, reference: session.reference, status: session.status, notes: session.notes,
      categoryId: session.categoryId,
      createdBy: nameOf(session.createdById), validatedBy: nameOf(session.validatedById),
      validatedAt: session.validatedAt, createdAt: session.createdAt,
      lines,
      summary: {
        total: lines.length,
        counted,
        pending: lines.length - counted,
        gaps: gaps.length,
        gapValue: gaps.reduce((s, l) => s + (l.gapValue ?? 0), 0),
      },
    };
  }

  /** Saisie/màj des quantités comptées (session en cours uniquement). */
  async saveCounts(id: string, input: SaveCountsInput) {
    const session = await this.prisma.inventorySession.findUnique({ where: { id }, select: { status: true } });
    if (!session) throw AppError.notFound('Session d\'inventaire introuvable');
    if (session.status !== 'in_progress') throw AppError.badRequest('Seule une session en cours peut être saisie.');

    await this.prisma.$transaction(
      input.lines.map((l) =>
        this.prisma.inventoryCountLine.update({
          where: { id: l.lineId },
          data:  { countedQty: l.countedQty, notes: l.notes ?? undefined },
        }),
      ),
    );
    return this.getSession(id);
  }

  /**
   * Valide la session : pour chaque ligne comptée dont le compté diffère du stock
   * ACTUEL, génère un mouvement d'ajustement (entrée si surplus, sortie si manque)
   * → le stock est recalé EXACTEMENT sur le compté + écriture comptable. Atomique.
   */
  async validateSession(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.inventorySession.findUnique({ where: { id }, include: { lines: true } });
      if (!session) throw AppError.notFound('Session d\'inventaire introuvable');
      if (session.status !== 'in_progress') throw AppError.badRequest('Seule une session en cours peut être validée.');

      for (const line of session.lines) {
        if (line.countedQty == null) continue; // non comptée → pas de recalage
        const product = await tx.product.findFirst({
          where:  { id: line.productId, deletedAt: null },
          select: { stockQuantity: true, trackStock: true },
        });
        if (!product || !product.trackStock) continue;

        const counted = Number(line.countedQty);
        const current = Number(product.stockQuantity ?? 0);
        const delta   = counted - current; // recale sur le compté (pas sur le théorique figé)
        if (delta === 0) continue;

        const movement = await this.stock.createStockMovement({
          productId:   line.productId,
          quantity:    Math.abs(delta),
          type:        delta > 0 ? 'adjustment_in' : 'adjustment_out',
          unitCostHt:  line.unitCostHt != null ? Number(line.unitCostHt) : null,
          sourceType:  'inventory',
          sourceId:    id,
          sourceLabel: session.reference,
          notes:       `Inventaire ${session.reference} : théorique ${Number(line.theoreticalQty)}, compté ${counted}`,
          createdById: userId,
        }, tx as any);

        await tx.inventoryCountLine.update({ where: { id: line.id }, data: { movementId: movement.id } });
      }

      return tx.inventorySession.update({
        where: { id },
        data:  { status: 'validated', validatedById: userId, validatedAt: new Date() },
      });
    });
  }

  async cancelSession(id: string) {
    const session = await this.prisma.inventorySession.findUnique({ where: { id }, select: { status: true } });
    if (!session) throw AppError.notFound('Session d\'inventaire introuvable');
    if (session.status === 'validated') throw AppError.badRequest('Une session validée ne peut pas être annulée.');
    if (session.status === 'cancelled') return session;
    return this.prisma.inventorySession.update({ where: { id }, data: { status: 'cancelled' } });
  }
}
