# PHASE 5 — Module Bank (NestJS Migration)

> **Contexte** : Migration du module `bank` Express/TypeScript vers NestJS.
> Ce module est le plus complexe du backend (1 228 lignes de service) : comptes bancaires,
> import multi-format (CSV/OFX/MT940), rapprochement, matching intelligent (scoring pondéré,
> subset-sum, algorithme hongrois), apprentissage automatique de règles.

---

## 0. Fichiers source Express analysés

| Fichier | Rôle |
|---|---|
| `bank.routes.ts` | 30 routes Express, 7 permissions RBAC |
| `bank.controller.ts` | Fonctions controller (pure délégation vers service) |
| `bank.service.ts` | 1 228 lignes, toute la logique métier |
| `bank.schema.ts` | 8 schémas Zod |
| `bank.matching.ts` | Algorithmes purs : levenshtein, computeScore, subsetSum, hungarian |
| `bank.parsers.ts` | Décodage buffer, détection format, parsing CSV/OFX/MT940 |
| `bank.profiles.ts` | Profils bancaires CEMAC (Afriland, SCB, BGFIBank, etc.) |

---

## 1. Décisions d'architecture (5 décisions critiques)

### Décision 1 : Fichiers algorithmiques purs — PAS de @Injectable

`bank.matching.ts` (levenshtein, textSimilarity, computeScore, subsetSum, hungarian)
et `bank.profiles.ts` (constante `BANK_PROFILES`) sont des modules TypeScript purs :
zéro dépendance NestJS, zéro state, zéro IO.

**NE PAS** les transformer en `@Injectable()`. Les importer directement dans `BankService`.

```typescript
// src/modules/bank/bank.matching.ts — PAS de changement, copier tel quel
// src/modules/bank/bank.profiles.ts — PAS de changement, copier tel quel
// src/modules/bank/bank.parsers.ts  — PAS de changement, copier tel quel
//   (importe iconv-lite + bank.profiles, reste un module TS pur)
```

### Décision 2 : BullMQ pour imports > 200 lignes

`confirmImport()` dans le service dispatche un job BullMQ quand le fichier dépasse 200 transactions.
En NestJS, la queue s'injecte par `@InjectQueue`.

```
Constante : BANK_IMPORT_QUEUE = 'bank-import'   (valeur = nom de la queue existante)
BankService constructor : @InjectQueue(BANK_IMPORT_QUEUE) private bankImportQueue: Queue
BankImportProcessor    : @Processor(BANK_IMPORT_QUEUE) + @Process('process')
```

Le processor doit être déclaré dans `BankModule.providers[]` et importé dans `JobsModule`
(ou resté autonome dans `BankModule` puisqu'il n'est pas partagé).

### Décision 3 : PAS de conflit d'ordre de routes dans ce module

Contrairement aux phases précédentes, **toutes les routes bank ont des segments différents**
ou des méthodes HTTP différentes. Aucun conflit `static vs :param` dans le même groupe.

Vérification :
- `GET accounts/:id` (2 seg) vs `GET accounts/:id/import-config` (3 seg) → OK, segments ≠
- `POST import/detect`, `POST import/preview`, `POST import/confirm` (2 seg, statiques)
  vs `POST import` (1 seg, déprécié) → OK, segments ≠
- `GET transactions/:id` vs `GET transactions/:id/suggestions` → OK, segments ≠

**Bonne pratique appliquée quand même** : grouper les méthodes par ressource dans
l'ordre naturel CRUD (list, create, getById, update, delete), avec les sous-routes
spécifiques **juste avant** le `@Get(':id')` correspondant.

### Décision 4 : Route dépréciée avec headers personnalisés

`POST /bank/import` (ancien pipeline CSV) est déprécié. Express utilisait un middleware inline :
```ts
(_req, res, next) => { res.setHeader('Deprecation', 'true'); res.setHeader('Sunset', '2026-12-31'); next(); }
```

En NestJS, utiliser les décorateurs `@Header()` sur la méthode du controller :
```typescript
@Post('import')
@Header('Deprecation', 'true')
@Header('Sunset', '2026-12-31')
@UseInterceptors(FileInterceptor('file'))
@Permission('bank:import-confirm')
async importCsv(...) {}
```

### Décision 5 : Permissions RBAC étendues

Le module bank introduit 7 nouvelles permissions à ajouter à l'enum `Permission` :

```typescript
// src/core/decorators/permission.decorator.ts (enum Permission existant)
BANK_READ           = 'bank:read',
BANK_MANAGE         = 'bank:manage',
BANK_IMPORT_PARSE   = 'bank:import-parse',
BANK_IMPORT_CONFIRM = 'bank:import-confirm',
BANK_RECONCILE      = 'bank:reconcile',
BANK_AUTO_MATCH     = 'bank:auto-match',
BANK_RULES          = 'bank:rules',
```

Et les assigner dans les seeds RBAC :
- `admin` : toutes les permissions bank
- `commercial` : `bank:read`, `bank:import-parse`, `bank:import-confirm`, `bank:reconcile`
- `employee` : `bank:read`

---

## 2. Nouveaux packages à installer

```bash
pnpm add iconv-lite
pnpm add -D @types/iconv-lite   # si nécessaire
```

> `iconv-lite` est utilisé par `bank.parsers.ts` pour décoder les encodages Win-1252 / ISO-8859-1.
> Vérifier s'il est déjà dans le `package.json` Express existant.

---

## 3. Constante de queue

```typescript
// src/jobs/constants.ts  (fichier de constantes des queues — à créer si inexistant)
export const EMAIL_QUEUE        = 'email';
export const NOTIFICATION_QUEUE = 'notification';
export const BANK_IMPORT_QUEUE  = 'bank-import';   // ← ajouter
// ... autres queues existantes
```

---

## 4. Code complet — BankService

```typescript
// src/modules/bank/bank.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { BANK_IMPORT_QUEUE } from '../../jobs/constants';
import {
  CreateBankAccountInput, UpdateBankAccountInput,
  CreateTransactionInput, ReconcileInput, OpenReconciliationInput,
  ImportCsvInput, DetectFormatInput,
} from './bank.schema';
import {
  decodeBuffer, autoDetectFormat, parseStatementFile,
  detectFileFormat, computeContentHash,
  DetectedFormat, ImportPreview, FileFormat,
} from './bank.parsers';
import {
  computeScore, subsetSum, hungarian, SubsetCandidate,
} from './bank.matching';

export interface BankImportJobData {
  importId:      string;
  bankAccountId: string;
  lines:         unknown[];
}

@Injectable()
export class BankService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue(BANK_IMPORT_QUEUE) private bankImportQueue: Queue<BankImportJobData>,
  ) {}

  // ── Résumé ─────────────────────────────────────────────────────────────────

  async getBankSummary() {
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [accounts, unreconciledCount, openReconciliations, importsThisMonth] = await Promise.all([
      this.prisma.bankAccount.findMany({
        where: { deletedAt: null, isActive: true },
        select: {
          id: true, name: true, bankName: true, currentBalance: true, currency: true, color: true,
          _count: { select: { transactions: { where: { reconciliationStatus: 'pending' } } } },
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.bankTransaction.count({
        where: { reconciliationStatus: 'pending', bankAccount: { deletedAt: null } },
      }),
      this.prisma.bankReconciliation.count({ where: { status: 'open' } }),
      this.prisma.bankStatementImport.count({ where: { importedAt: { gte: startOfMonth } } }),
    ]);

    const totalBalance = accounts.reduce((sum, a) => sum + Number(a.currentBalance ?? 0), 0);

    return {
      totalBalance,
      accountsCount: accounts.length,
      unreconciledCount,
      openReconciliations,
      importsThisMonth,
      accounts: accounts.map((a) => ({
        id:             a.id,
        name:           a.name,
        bankName:       a.bankName,
        currentBalance: Number(a.currentBalance),
        currency:       a.currency,
        color:          a.color,
        pendingCount:   a._count.transactions,
      })),
    };
  }

  // ── Comptes bancaires ───────────────────────────────────────────────────────

  async listAccounts() {
    return this.prisma.bankAccount.findMany({
      where:   { deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { transactions: true } } },
    });
  }

  async getAccountById(id: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where:   { id, deletedAt: null },
      include: { transactions: { orderBy: { transactionDate: 'desc' }, take: 10 } },
    });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');
    return account;
  }

  async createAccount(data: CreateBankAccountInput) {
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.bankAccount.updateMany({
          where: { isDefault: true, deletedAt: null },
          data:  { isDefault: false },
        });
      }
      return tx.bankAccount.create({
        data: {
          name:              data.name,
          bankName:          data.bankName,
          accountNumber:     data.accountNumber   ?? undefined,
          branchName:        data.branchName       ?? undefined,
          iban:              data.iban              ?? undefined,
          swiftBic:          data.swiftBic          ?? undefined,
          currency:          data.currency,
          openingBalance:    data.openingBalance,
          currentBalance:    data.openingBalance,
          isDefault:         data.isDefault,
          accountingAccount: data.accountingAccount ?? undefined,
          color:             data.color             ?? undefined,
          notes:             data.notes             ?? undefined,
        },
      });
    });
  }

  async updateAccount(id: string, data: UpdateBankAccountInput) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');

    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.bankAccount.updateMany({
          where: { isDefault: true, deletedAt: null, id: { not: id } },
          data:  { isDefault: false },
        });
      }
      return tx.bankAccount.update({ where: { id }, data });
    });
  }

  async deleteAccount(id: string) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');
    if (Number(account.currentBalance) !== 0) {
      throw AppError.conflict('Impossible de supprimer un compte avec un solde non nul');
    }
    await this.prisma.bankAccount.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  async listTransactions(params: {
    page: number; limit: number;
    accountId?: string; type?: string;
    dateFrom?: string; dateTo?: string;
    reconciled?: boolean; search?: string;
  }) {
    const { page, limit, accountId, type, dateFrom, dateTo, reconciled, search } = params;
    const where: Record<string, unknown> = {};
    if (accountId) where['bankAccountId'] = accountId;
    if (type)      where['type']           = type;
    if (typeof reconciled === 'boolean') {
      where['reconciliationStatus'] = reconciled ? 'reconciled' : 'pending';
    }
    if (dateFrom || dateTo) {
      where['transactionDate'] = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      };
    }
    if (search) {
      where['OR'] = [
        { label:     { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        skip:     (page - 1) * limit,
        take:     limit,
        orderBy:  { transactionDate: 'desc' },
        include:  { bankAccount: { select: { id: true, name: true, currency: true } } },
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);
    return { data, total };
  }

  async getTransactionById(id: string) {
    const t = await this.prisma.bankTransaction.findUnique({
      where:   { id },
      include: { bankAccount: true },
    });
    if (!t) throw AppError.notFound('Transaction introuvable');
    return t;
  }

  async createTransaction(data: CreateTransactionInput) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: data.bankAccountId, deletedAt: null },
    });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');

    const delta = data.type === 'credit' ? data.amount : -data.amount;

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.bankTransaction.create({
        data: {
          bankAccountId:   data.bankAccountId,
          transactionDate: data.transactionDate,
          label:           data.label,
          amount:          data.amount,
          type:            data.type,
          reference:       data.reference ?? undefined,
          category:        data.category  ?? undefined,
          notes:           data.notes     ?? undefined,
        },
      });
      await tx.bankAccount.update({
        where: { id: data.bankAccountId },
        data:  { currentBalance: { increment: delta } },
      });
      return transaction;
    });
  }

  // ── Suggestions de matching ─────────────────────────────────────────────────

  async getSuggestions(transactionId: string) {
    const tx0 = await this.prisma.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!tx0) throw AppError.notFound('Transaction introuvable');
    if (tx0.reconciliationStatus === 'reconciled') return { suggestions: [] };

    const amount    = Number(tx0.amount);
    const tolerance = Math.max(1, amount * 0.05);
    const dateFrom  = new Date(tx0.transactionDate);
    dateFrom.setDate(dateFrom.getDate() - 10);
    const dateTo = new Date(tx0.transactionDate);
    dateTo.setDate(dateTo.getDate() + 10);

    const [payments, supplierPayments, expenses, matchingRules] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          deletedAt: null, bankTransactionId: null,
          amount:      { gte: amount - tolerance, lte: amount + tolerance },
          paymentDate: { gte: dateFrom, lte: dateTo },
        },
        include: { invoice: { select: { number: true } } },
        take: 5,
      }),
      this.prisma.supplierPayment.findMany({
        where: {
          deletedAt: null, bankTransactionId: null,
          amount:      { gte: amount - tolerance, lte: amount + tolerance },
          paymentDate: { gte: dateFrom, lte: dateTo },
        },
        include: { supplierInvoice: { select: { supplierInvoiceNumber: true } } },
        take: 5,
      }),
      this.prisma.expense.findMany({
        where: {
          deletedAt: null, bankTransactionId: null,
          amountTtc:   { gte: amount - tolerance, lte: amount + tolerance },
          expenseDate: { gte: dateFrom, lte: dateTo },
        },
        select: { id: true, number: true, title: true, amountTtc: true, expenseDate: true },
        take: 5,
      }),
      this.prisma.bankMatchingRule.findMany({
        where: { bankAccountId: tx0.bankAccountId, isActive: true },
      }),
    ]);

    const getRuleBonus = (entityLabel: string, entityAmount: number): number => {
      for (const rule of matchingRules) {
        if (rule.confidence < 3) continue;
        const labelMatch = entityLabel.toLowerCase().includes(rule.labelContains.toLowerCase());
        const amountOk   = (!rule.amountMin || entityAmount >= Number(rule.amountMin))
                        && (!rule.amountMax || entityAmount <= Number(rule.amountMax));
        if (labelMatch && amountOk) return 15;
      }
      return 0;
    };

    const score = (entityAmount: number, entityDate: Date, entityLabel: string, entityRef?: string | null) =>
      computeScore({
        entityAmount, entityDate, entityLabel, entityRef,
        txAmount:  amount,
        txDate:    tx0.transactionDate,
        txLabel:   tx0.label,
        txRef:     tx0.reference,
        ruleBonus: getRuleBonus(entityLabel, entityAmount),
      });

    const suggestions: Array<{
      entityType: string; entityId: string; label: string;
      amount: number; date: Date; score: number; scoreDetail: object;
    }> = [];

    for (const p of payments) {
      const lbl    = `Paiement FAC ${p.invoice?.number ?? ''} — ${Number(p.amount).toLocaleString('fr-FR')} XAF`;
      const detail = score(Number(p.amount), p.paymentDate, lbl, p.reference);
      suggestions.push({ entityType: 'payment', entityId: p.id, label: lbl, amount: Number(p.amount), date: p.paymentDate, score: detail.total, scoreDetail: detail });
    }
    for (const sp of supplierPayments) {
      const lbl    = `Paiement fournisseur ${sp.supplierInvoice?.supplierInvoiceNumber ?? ''} — ${Number(sp.amount).toLocaleString('fr-FR')} XAF`;
      const detail = score(Number(sp.amount), sp.paymentDate, lbl, sp.reference);
      suggestions.push({ entityType: 'supplier_payment', entityId: sp.id, label: lbl, amount: Number(sp.amount), date: sp.paymentDate, score: detail.total, scoreDetail: detail });
    }
    for (const e of expenses) {
      const lbl    = `Dépense ${e.number} — ${e.title}`;
      const detail = score(Number(e.amountTtc), e.expenseDate, lbl);
      suggestions.push({ entityType: 'expense', entityId: e.id, label: lbl, amount: Number(e.amountTtc), date: e.expenseDate, score: detail.total, scoreDetail: detail });
    }

    suggestions.sort((a, b) => b.score - a.score);
    return { transaction: tx0, suggestions: suggestions.slice(0, 10) };
  }

  // ── Réconciliation d'une transaction ────────────────────────────────────────

  async reconcileTransaction(id: string, data: ReconcileInput, userId?: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('Transaction introuvable');
    if (t.reconciliationStatus === 'reconciled') throw AppError.conflict('Transaction déjà rapprochée');

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.bankTransaction.update({
        where: { id },
        data: {
          reconciliationStatus: 'reconciled',
          reconciledAt:         now,
          reconciledById:       userId ?? undefined,
          matchedEntityType:    data.matchedEntityType,
          matchedEntityId:      data.matchedEntityId,
        },
      });

      if (data.matchedEntityType === 'payment') {
        await tx.payment.updateMany({
          where: { id: data.matchedEntityId, deletedAt: null, bankTransactionId: null },
          data:  { bankTransactionId: id, reconciledAt: now, reconciledById: userId ?? undefined },
        });
      } else if (data.matchedEntityType === 'supplier_payment') {
        await tx.supplierPayment.updateMany({
          where: { id: data.matchedEntityId, deletedAt: null, bankTransactionId: null },
          data:  { bankTransactionId: id, reconciledAt: now, reconciledById: userId ?? undefined },
        });
      } else if (data.matchedEntityType === 'expense') {
        await tx.expense.updateMany({
          where: { id: data.matchedEntityId, deletedAt: null, bankTransactionId: null },
          data:  { bankTransactionId: id },
        });
      }

      return result;
    });

    // Apprentissage automatique
    if (userId) {
      this.learnMatchingRule(id, data.matchedEntityType, data.matchedEntityId, userId).catch(() => {});
    }

    return updated;
  }

  async unmatchTransaction(id: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('Transaction introuvable');
    if (t.reconciliationStatus !== 'reconciled') throw AppError.badRequest('Transaction non rapprochée');

    return this.prisma.$transaction(async (tx) => {
      if (t.matchedEntityType === 'payment' && t.matchedEntityId) {
        await tx.payment.updateMany({
          where: { id: t.matchedEntityId, bankTransactionId: id },
          data:  { bankTransactionId: null, reconciledAt: null, reconciledById: null },
        });
      } else if (t.matchedEntityType === 'supplier_payment' && t.matchedEntityId) {
        await tx.supplierPayment.updateMany({
          where: { id: t.matchedEntityId, bankTransactionId: id },
          data:  { bankTransactionId: null, reconciledAt: null, reconciledById: null },
        });
      } else if (t.matchedEntityType === 'expense' && t.matchedEntityId) {
        await tx.expense.updateMany({
          where: { id: t.matchedEntityId, bankTransactionId: id },
          data:  { bankTransactionId: null },
        });
      }
      return tx.bankTransaction.update({
        where: { id },
        data: {
          reconciliationStatus: 'pending',
          reconciledAt:         null,
          matchedEntityType:    null,
          matchedEntityId:      null,
        },
      });
    });
  }

  async ignoreTransaction(id: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('Transaction introuvable');
    return this.prisma.bankTransaction.update({ where: { id }, data: { reconciliationStatus: 'ignored' } });
  }

  // ── Rapprochements ──────────────────────────────────────────────────────────

  async listReconciliations(params: { page: number; limit: number; accountId?: string }) {
    const where: Record<string, unknown> = {};
    if (params.accountId) where['bankAccountId'] = params.accountId;

    const [data, total] = await Promise.all([
      this.prisma.bankReconciliation.findMany({
        where,
        skip:    (params.page - 1) * params.limit,
        take:    params.limit,
        orderBy: { periodStart: 'desc' },
        include: { bankAccount: { select: { id: true, name: true } } },
      }),
      this.prisma.bankReconciliation.count({ where }),
    ]);
    return { data, total };
  }

  async getReconciliationById(id: string) {
    const r = await this.prisma.bankReconciliation.findUnique({
      where:   { id },
      include: { bankAccount: true },
    });
    if (!r) throw AppError.notFound('Session de rapprochement introuvable');
    return r;
  }

  async openReconciliation(data: OpenReconciliationInput, userId: string) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id: data.bankAccountId, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');

    return this.prisma.bankReconciliation.create({
      data: {
        bankAccountId:           data.bankAccountId,
        periodStart:             data.periodStart,
        periodEnd:               data.periodEnd,
        openingBalance:          data.openingBalance,
        closingBalanceStatement: 0,
        closingBalanceSystem:    Number(account.currentBalance),
        notes:                   data.notes ?? undefined,
        status:                  'in_progress',
        createdById:             userId,
      },
    });
  }

  async getReconciliationReport(id: string) {
    const r = await this.prisma.bankReconciliation.findUnique({
      where:   { id },
      include: { bankAccount: { select: { id: true, name: true, currency: true } } },
    });
    if (!r) throw AppError.notFound('Session de rapprochement introuvable');

    const [reconciledTxns, pendingCount, ignoredCount] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'reconciled',
                 transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
        select: { type: true, amount: true },
      }),
      this.prisma.bankTransaction.count({
        where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'pending',
                 transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
      }),
      this.prisma.bankTransaction.count({
        where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'ignored',
                 transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
      }),
    ]);

    let totalCredits = 0, totalDebits = 0;
    for (const t of reconciledTxns) {
      if (t.type === 'credit') totalCredits += Number(t.amount);
      else totalDebits += Number(t.amount);
    }
  
    const closingBalanceStatement = Number(r.openingBalance) + totalCredits - totalDebits;
    const closingBalanceSystem    = Number(r.closingBalanceSystem);
    const gap                     = closingBalanceStatement - closingBalanceSystem;

    return {
      reconciliation: r,
      openingBalance: Number(r.openingBalance),
      totalCredits, totalDebits,
      closingBalanceStatement, closingBalanceSystem,
      gap,
      isBalanced:      Math.abs(gap) < 1,
      reconciledCount: reconciledTxns.length,
      pendingCount, ignoredCount,
    };
  }

  async completeReconciliation(id: string, userId: string) {
    const r = await this.prisma.bankReconciliation.findUnique({ where: { id } });
    if (!r) throw AppError.notFound('Session de rapprochement introuvable');
    if (r.status !== 'in_progress') throw AppError.badRequest('Session déjà clôturée');

    return this.prisma.$transaction(async (tx) => {
      const reconciledTxns = await tx.bankTransaction.findMany({
        where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'reconciled',
                 transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
        select: { type: true, amount: true },
      });

      let totalCredits = 0, totalDebits = 0;
      for (const t of reconciledTxns) {
        if (t.type === 'credit') totalCredits += Number(t.amount);
        else totalDebits += Number(t.amount);
      }

      const closingBalanceStatement = Number(r.openingBalance) + totalCredits - totalDebits;
      const closingBalanceSystem    = Number(r.closingBalanceSystem);
      const now                     = new Date();

      const [updated] = await Promise.all([
        tx.bankReconciliation.update({
          where: { id },
          data: {
            status:                 'completed',
            completedAt:            now,
            completedById:          userId,
            closingBalanceStatement,
            isBalanced:             Math.abs(closingBalanceStatement - closingBalanceSystem) < 1,
          },
        }),
        tx.bankAccount.update({
          where: { id: r.bankAccountId },
          data:  { lastReconciledDate: r.periodEnd },
        }),
      ]);

      return updated;
    });
  }

  // ── Import CSV (ancien pipeline — déprécié) ─────────────────────────────────

  async importCsv(csvContent: string, params: ImportCsvInput, userId: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: params.bankAccountId, deletedAt: null },
    });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');

    const lines   = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) throw AppError.badRequest('Le fichier CSV est vide ou ne contient pas d\'en-tête');

    // Parsing CSV (logique identique à l'Express — copier depuis bank.service.ts Express)
    const parseCsvLine = (line: string, delimiter: string): string[] => {
      const result: string[] = [];
      let cur = ''; let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === delimiter && !inQuotes) { result.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      result.push(cur.trim());
      return result;
    };

    const parseDate = (raw: string, format: ImportCsvInput['dateFormat']): Date | null => {
      const s = raw.trim();
      let day: number, month: number, year: number;
      if (format === 'DD/MM/YYYY') [day, month, year] = s.split('/').map(Number) as [number, number, number];
      else if (format === 'MM/DD/YYYY') [month, day, year] = s.split('/').map(Number) as [number, number, number];
      else [year, month, day] = s.split('-').map(Number) as [number, number, number];
      const d = new Date(year, month - 1, day);
      return isNaN(d.getTime()) ? null : d;
    };

    const headers  = parseCsvLine(lines[0]!, params.delimiter).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const colIndex = (name: string) => {
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const idx = headers.indexOf(key);
      if (idx === -1) throw AppError.badRequest(`Colonne "${name}" introuvable dans le CSV`);
      return idx;
    };

    const dateIdx  = colIndex(params.dateColumn);
    const labelIdx = colIndex(params.labelColumn);
    const debitIdx = colIndex(params.debitColumn);
    const creditIdx = colIndex(params.creditColumn);
    const refIdx   = params.referenceColumn ? headers.indexOf(params.referenceColumn.toLowerCase().replace(/[^a-z0-9]/g, '')) : -1;

    const toCreate: Array<{
      bankAccountId: string; transactionDate: Date; label: string;
      amount: number; type: 'debit' | 'credit'; reference?: string; source: string;
    }> = [];

    let skipped = 0, totalCredits = 0, totalDebits = 0;
    let periodStart: Date | null = null, periodEnd: Date | null = null;

    for (const raw of lines.slice(1)) {
      const cols     = parseCsvLine(raw, params.delimiter);
      const date     = parseDate(cols[dateIdx] ?? '', params.dateFormat);
      if (!date) { skipped++; continue; }

      const debitRaw  = Number((cols[debitIdx]  ?? '0').replace(/\s/g, '').replace(',', '.'));
      const creditRaw = Number((cols[creditIdx] ?? '0').replace(/\s/g, '').replace(',', '.'));
      const label     = (cols[labelIdx] ?? '').trim();
      if (!label) { skipped++; continue; }

      const isCredit = creditRaw > 0;
      const amount   = isCredit ? creditRaw : debitRaw;
      if (amount <= 0) { skipped++; continue; }

      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd   || date > periodEnd)   periodEnd   = date;
      if (isCredit) totalCredits += amount; else totalDebits += amount;

      toCreate.push({
        bankAccountId: params.bankAccountId,
        transactionDate: date, label, amount,
        type:      isCredit ? 'credit' : 'debit',
        reference: refIdx >= 0 ? (cols[refIdx] ?? undefined) : undefined,
        source:    'csv',
      });
    }

    if (toCreate.length === 0) throw AppError.badRequest('Aucune ligne valide dans le fichier CSV');

    return this.prisma.$transaction(async (tx) => {
      const importRecord = await tx.bankStatementImport.create({
        data: {
          bankAccountId:  params.bankAccountId,
          filename:       'import.csv',
          fileFormat:     'csv',
          periodStart:    periodStart!,
          periodEnd:      periodEnd!,
          totalCredits, totalDebits,
          nbTransactions: toCreate.length,
          status:         'completed',
          importedById:   userId,
          processedAt:    new Date(),
        },
      });

      await tx.bankTransaction.createMany({
        data: toCreate.map(t => ({ ...t, importId: importRecord.id })),
      });

      await tx.bankAccount.update({
        where: { id: params.bankAccountId },
        data:  { currentBalance: { increment: totalCredits - totalDebits } },
      });

      return {
        importId:   importRecord.id,
        nbImported: toCreate.length,
        nbSkipped:  skipped,
        totalCredits, totalDebits,
        periodStart: periodStart!,
        periodEnd:   periodEnd!,
      };
    });
  }

  // ── Nouveau pipeline import : DETECT → PREVIEW → CONFIRM ───────────────────

  async detectImportFormat(
    fileBuffer: Buffer,
    bankAccountId: string,
    filename: string,
    encodingHint?: DetectFormatInput['encoding'],
  ) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id: bankAccountId, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');

    const content    = decodeBuffer(fileBuffer, encodingHint ?? 'auto');
    const fileFormat = detectFileFormat(filename, content);

    if (fileFormat === 'ofx' || fileFormat === 'mt940') {
      return {
        profileId: fileFormat, profileName: fileFormat === 'ofx' ? 'OFX / QFX' : 'MT940 SWIFT',
        delimiter: ',' as const, encoding: encodingHint ?? 'auto',
        dateFormat: 'YYYY-MM-DD', numberFormat: { thousands: '', decimal: '.' },
        columnMapping: { date: 'auto', label: 'auto' },
        confidence: 95, source: 'verified' as const,
        verificationNote: `Format ${fileFormat.toUpperCase()} — structure auto-interprétée`,
        headerRow: 0, fileFormat,
      };
    }

    const override = await this.prisma.bankProfileOverride.findUnique({ where: { bankAccountId } });
    const fmt      = autoDetectFormat(content, override?.profileData ?? undefined);
    return { ...fmt, fileFormat };
  }

  async previewImport(
    fileBuffer: Buffer,
    bankAccountId: string,
    filename: string,
    encodingHint?: DetectFormatInput['encoding'],
    formatOverride?: DetectedFormat,
  ): Promise<{ importId: string; preview: ImportPreview }> {
    const account = await this.prisma.bankAccount.findFirst({ where: { id: bankAccountId, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');

    const [dbOverride, existingHashes] = await Promise.all([
      this.prisma.bankProfileOverride.findUnique({ where: { bankAccountId } }),
      this.prisma.bankTransaction.findMany({
        where:  { bankAccountId, contentHash: { not: null } },
        select: { contentHash: true },
      }),
    ]);
    const hashSet = new Set(existingHashes.map(h => h.contentHash!));

    const result = parseStatementFile(
      fileBuffer, filename, bankAccountId,
      formatOverride ?? dbOverride?.profileData ?? undefined,
      encodingHint ?? 'auto',
    );

    const uniqueTxns    = result.transactions.filter(t => !hashSet.has(t.contentHash));
    const duplicateRows = result.transactions.length - uniqueTxns.length;

    const detectedFormat: DetectedFormat = formatOverride ?? result.detectedFormat ?? {
      profileId:    result.fileFormat,
      profileName:  result.fileFormat === 'ofx' ? 'OFX / QFX' : 'MT940 SWIFT',
      delimiter:    ',' as const,
      encoding:     encodingHint ?? 'auto',
      dateFormat:   'YYYY-MM-DD',
      numberFormat: { thousands: '', decimal: '.' },
      columnMapping: { date: 'auto', label: 'auto' },
      confidence:   95, source: 'verified' as const, headerRow: 0,
    };

    const preview: ImportPreview = {
      detectedFormat,
      totalRows:          result.transactions.length + result.errors.length,
      validRows:          uniqueTxns.length,
      errorRows:          result.errors.length,
      duplicateRows,
      sampleTransactions: uniqueTxns,
      sampleRows:         uniqueTxns.slice(0, 5),
      errors:             result.errors,
      dateRange: {
        min: uniqueTxns.reduce<Date | null>((m, t) => !m || t.transactionDate < m ? t.transactionDate : m, null),
        max: uniqueTxns.reduce<Date | null>((m, t) => !m || t.transactionDate > m ? t.transactionDate : m, null),
      },
      totalDebits:  uniqueTxns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0),
      totalCredits: uniqueTxns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
    };

    const periodStart = preview.dateRange.min ?? new Date();
    const periodEnd   = preview.dateRange.max ?? new Date();

    const importRecord = await this.prisma.bankStatementImport.create({
      data: {
        bankAccountId, filename,
        fileFormat:     result.fileFormat === 'unknown' ? 'csv' : result.fileFormat,
        periodStart, periodEnd,
        totalCredits:   preview.totalCredits,
        totalDebits:    preview.totalDebits,
        nbTransactions: preview.validRows,
        status:         'pending',
        previewData:    preview as any,
        detectedFormat: detectedFormat as any,
      },
    });

    return { importId: importRecord.id, preview };
  }

  async confirmImport(importId: string, userId: string): Promise<{
    nbImported: number; nbSkipped: number; nbDuplicates: number; status: string; jobId?: string;
  }> {
    const importRecord = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!importRecord) throw AppError.notFound('Import introuvable');
    if (importRecord.status !== 'pending') throw AppError.conflict('Cet import a déjà été traité');

    const preview = importRecord.previewData as unknown as ImportPreview;
    if (!preview) throw AppError.badRequest('Données de prévisualisation manquantes — relancez la phase PREVIEW');

    const existingHashes = await this.prisma.bankTransaction.findMany({
      where:  { bankAccountId: importRecord.bankAccountId, contentHash: { not: null } },
      select: { contentHash: true },
    });
    const hashSet     = new Set(existingHashes.map(h => h.contentHash!));
    const transactions = preview.sampleTransactions.filter(t => !hashSet.has(t.contentHash));
    const nbDuplicates = preview.duplicateRows;

    if (transactions.length === 0) {
      await this.prisma.bankStatementImport.update({
        where: { id: importId },
        data:  { status: 'completed', processedAt: new Date(), importedById: userId, nbTransactions: 0 },
      });
      return { nbImported: 0, nbSkipped: preview.errorRows, nbDuplicates, status: 'completed' };
    }

    // Async si > 200 lignes
    if (transactions.length > 200) {
      const lines = transactions.map(t => ({
        bankAccountId:   importRecord.bankAccountId,
        transactionDate: t.transactionDate.toISOString(),
        valueDate:       t.valueDate?.toISOString(),
        label: t.label, amount: t.amount, type: t.type,
        reference: t.reference, balanceAfter: t.balanceAfter,
        contentHash: t.contentHash, source: 'csv_import', importId, createdById: userId,
      }));

      const job = await this.bankImportQueue.add('process', {
        importId, bankAccountId: importRecord.bankAccountId, lines,
      });

      await this.prisma.bankStatementImport.update({
        where: { id: importId },
        data:  { status: 'processing', jobId: job.id ?? null, importedById: userId },
      });

      return { nbImported: 0, nbSkipped: preview.errorRows, nbDuplicates, status: 'processing', jobId: job.id };
    }

    // Sync si ≤ 200 lignes
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.bankTransaction.createMany({
        data: transactions.map(t => ({
          bankAccountId:   importRecord.bankAccountId,
          transactionDate: t.transactionDate,
          valueDate:       t.valueDate ?? undefined,
          label:           t.label,
          amount:          t.amount,
          type:            t.type,
          reference:       t.reference ?? undefined,
          balanceAfter:    t.balanceAfter ?? undefined,
          contentHash:     t.contentHash,
          source:          'csv_import',
          importId, createdById: userId,
        })),
        skipDuplicates: true,
      });

      const delta = transactions.reduce((acc, t) => acc + (t.type === 'credit' ? t.amount : -t.amount), 0);

      await Promise.all([
        tx.bankAccount.update({
          where: { id: importRecord.bankAccountId },
          data:  { currentBalance: { increment: delta } },
        }),
        tx.bankStatementImport.update({
          where: { id: importId },
          data:  { status: 'completed', processedAt: new Date(), importedById: userId,
                   nbTransactions: created.count, nbUnmatched: created.count },
        }),
      ]);

      await this.prisma.bankProfileOverride.updateMany({
        where: { bankAccountId: importRecord.bankAccountId },
        data:  { verifiedCount: { increment: 1 }, isVerified: true },
      });

      return { nbImported: created.count, nbSkipped: preview.errorRows, nbDuplicates, status: 'completed' };
    });
  }

  async rollbackImport(importId: string): Promise<{ deleted: number }> {
    const importRecord = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!importRecord) throw AppError.notFound('Import introuvable');

    if (importRecord.status === 'pending') {
      await this.prisma.bankStatementImport.delete({ where: { id: importId } });
      return { deleted: 0 };
    }
    if (importRecord.status !== 'completed') throw AppError.conflict('Seul un import complété peut être annulé');

    return this.prisma.$transaction(async (tx) => {
      const txns = await tx.bankTransaction.findMany({
        where:  { importId, reconciliationStatus: 'pending' },
        select: { id: true, type: true, amount: true },
      });

      if (txns.length > 0) {
        const balanceDelta = txns.reduce((acc, t) => acc + (t.type === 'credit' ? -Number(t.amount) : Number(t.amount)), 0);
        await tx.bankAccount.update({
          where: { id: importRecord.bankAccountId },
          data:  { currentBalance: { increment: balanceDelta } },
        });
      }

      const deleted = await tx.bankTransaction.deleteMany({ where: { importId, reconciliationStatus: 'pending' } });
      await tx.bankStatementImport.update({ where: { id: importId }, data: { status: 'cancelled' } });
      return { deleted: deleted.count };
    });
  }

  async getImportStatus(importId: string) {
    const record = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!record) throw AppError.notFound('Import introuvable');

    let progress = 100;
    if (record.status === 'processing' && record.jobId) {
      try {
        const job = await this.bankImportQueue.getJob(record.jobId);
        if (job) progress = (job.progress as number) ?? 0;
      } catch { /* job terminé */ }
    }

    return {
      importId: record.id, status: record.status, progress,
      nbTransactions: record.nbTransactions, nbMatched: record.nbMatched,
      nbUnmatched: record.nbUnmatched, processedAt: record.processedAt,
      errorMessage: record.errorMessage,
    };
  }

  async getImportConfig(accountId: string) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id: accountId, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');
    const override = await this.prisma.bankProfileOverride.findUnique({ where: { bankAccountId: accountId } });
    return {
      accountId,
      hasOverride:   !!override,
      isVerified:    override?.isVerified   ?? false,
      verifiedCount: override?.verifiedCount ?? 0,
      profileData:   override?.profileData  ?? null,
    };
  }

  async saveProfileOverride(bankAccountId: string, profileData: DetectedFormat, userId: string) {
    return this.prisma.bankProfileOverride.upsert({
      where:  { bankAccountId },
      create: { bankAccountId, profileData: profileData as any, createdById: userId, verifiedCount: 1, isVerified: false },
      update: { profileData: profileData as any, verifiedCount: { increment: 1 } },
    });
  }

  // ── Subset Sum ──────────────────────────────────────────────────────────────

  async findSubsetMatches(transactionId: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!t) throw AppError.notFound('Transaction introuvable');

    const amount    = Number(t.amount);
    const tolerance = Math.max(1, amount * 0.001);
    const dateFrom  = new Date(t.transactionDate); dateFrom.setDate(dateFrom.getDate() - 10);
    const dateTo    = new Date(t.transactionDate); dateTo.setDate(dateTo.getDate() + 10);

    const [payments, supplierPayments, expenses] = await Promise.all([
      this.prisma.payment.findMany({
        where:  { deletedAt: null, bankTransactionId: null, paymentDate: { gte: dateFrom, lte: dateTo } },
        select: { id: true, amount: true, paymentDate: true, reference: true },
        take:   20,
      }),
      this.prisma.supplierPayment.findMany({
        where:  { deletedAt: null, bankTransactionId: null, paymentDate: { gte: dateFrom, lte: dateTo } },
        select: { id: true, amount: true, paymentDate: true, reference: true },
        take:   20,
      }),
      this.prisma.expense.findMany({
        where:  { deletedAt: null, bankTransactionId: null, expenseDate: { gte: dateFrom, lte: dateTo } },
        select: { id: true, amountTtc: true, expenseDate: true, title: true },
        take:   20,
      }),
    ]);

    const candidates: SubsetCandidate[] = [
      ...payments.map(p          => ({ id: `payment:${p.id}`,          amount: Number(p.amount),    label: p.reference ?? '',   date: p.paymentDate })),
      ...supplierPayments.map(s  => ({ id: `supplier_payment:${s.id}`, amount: Number(s.amount),    label: s.reference ?? '',   date: s.paymentDate })),
      ...expenses.map(e          => ({ id: `expense:${e.id}`,          amount: Number(e.amountTtc), label: e.title,             date: e.expenseDate })),
    ];

    const matches = subsetSum(candidates, amount, tolerance, 6, 5);
    return { transaction: t, candidates: candidates.length, matches };
  }

  // ── Auto-match Hungarian ────────────────────────────────────────────────────

  async getAutoMatchBatch(reconciliationId: string, applyHighConfidence: boolean) {
    const r = await this.prisma.bankReconciliation.findUnique({ where: { id: reconciliationId } });
    if (!r) throw AppError.notFound('Session de rapprochement introuvable');

    const pendingTxns = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'pending',
               transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
    });
    if (pendingTxns.length === 0) return { applied: 0, suggestions: [] };

    const [payments, supplierPayments, expenses] = await Promise.all([
      this.prisma.payment.findMany({ where: { deletedAt: null, bankTransactionId: null, paymentDate: { gte: r.periodStart, lte: r.periodEnd } }, take: 100 }),
      this.prisma.supplierPayment.findMany({ where: { deletedAt: null, bankTransactionId: null, paymentDate: { gte: r.periodStart, lte: r.periodEnd } }, take: 100 }),
      this.prisma.expense.findMany({ where: { deletedAt: null, bankTransactionId: null, expenseDate: { gte: r.periodStart, lte: r.periodEnd } }, take: 100 }),
    ]);

    type Candidate = { entityType: string; entityId: string; amount: number; date: Date; label: string };
    const candidates: Candidate[] = [
      ...payments.map(p        => ({ entityType: 'payment',          entityId: p.id, amount: Number(p.amount),    date: p.paymentDate, label: '' })),
      ...supplierPayments.map(s => ({ entityType: 'supplier_payment', entityId: s.id, amount: Number(s.amount),   date: s.paymentDate, label: '' })),
      ...expenses.map(e         => ({ entityType: 'expense',          entityId: e.id, amount: Number(e.amountTtc), date: e.expenseDate, label: e.title })),
    ];
    if (candidates.length === 0) return { applied: 0, suggestions: [] };

    const costMatrix = pendingTxns.map(tx =>
      candidates.map(c => {
        const detail = computeScore({ entityAmount: c.amount, entityDate: c.date, entityLabel: c.label,
                                      txAmount: Number(tx.amount), txDate: tx.transactionDate, txLabel: tx.label });
        return 100 - detail.total;
      })
    );

    const assignment = hungarian(costMatrix);
    const high: Array<{ txId: string; entityType: string; entityId: string; score: number }> = [];
    const medium: typeof high = [];

    for (let i = 0; i < pendingTxns.length; i++) {
      const j = assignment[i];
      if (j === undefined || j < 0 || j >= candidates.length) continue;
      const tx = pendingTxns[i]!;
      const c  = candidates[j]!;
      const detail = computeScore({ entityAmount: c.amount, entityDate: c.date, entityLabel: c.label,
                                    txAmount: Number(tx.amount), txDate: tx.transactionDate, txLabel: tx.label });
      if (detail.total >= 80)      high.push({ txId: tx.id, entityType: c.entityType, entityId: c.entityId, score: detail.total });
      else if (detail.total >= 50) medium.push({ txId: tx.id, entityType: c.entityType, entityId: c.entityId, score: detail.total });
    }

    let applied = 0;
    if (applyHighConfidence && high.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const m of high) {
          await tx.bankTransaction.update({
            where: { id: m.txId },
            data:  { reconciliationStatus: 'reconciled', reconciledAt: new Date(),
                     matchedEntityType: m.entityType, matchedEntityId: m.entityId },
          });
        }
      });
      applied = high.length;
    }

    return { applied, high, medium };
  }

  // ── Apprentissage automatique ────────────────────────────────────────────────

  async learnMatchingRule(transactionId: string, entityType: string, entityId: string, userId: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!t) return;

    const tokens = t.label.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
    if (tokens.length === 0) return;

    const labelContains = tokens.sort((a, b) => b.length - a.length)[0]!.slice(0, 255);

    const existing = await this.prisma.bankMatchingRule.findFirst({
      where: { bankAccountId: t.bankAccountId, labelContains, entityType },
    });

    if (existing) {
      await this.prisma.bankMatchingRule.update({
        where: { id: existing.id },
        data:  { confidence: { increment: 1 }, entityId, amountMin: Number(t.amount) * 0.9, amountMax: Number(t.amount) * 1.1 },
      });
    } else {
      await this.prisma.bankMatchingRule.create({
        data: {
          bankAccountId: t.bankAccountId,
          labelContains, entityType, entityId,
          amountMin:   Number(t.amount) * 0.9,
          amountMax:   Number(t.amount) * 1.1,
          confidence:  1, isActive: true, isAutoApply: false,
          createdById: userId,
        },
      });
    }
  }

  // ── CRUD Règles de matching ──────────────────────────────────────────────────

  async listMatchingRules(bankAccountId?: string) {
    return this.prisma.bankMatchingRule.findMany({
      where:   { ...(bankAccountId ? { bankAccountId } : {}), isActive: true },
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createMatchingRule(data: {
    bankAccountId?: string; labelContains: string; entityType: string;
    entityId?: string; category?: string; amountMin?: number; amountMax?: number; isAutoApply?: boolean;
  }, userId: string) {
    return this.prisma.bankMatchingRule.create({
      data: {
        bankAccountId: data.bankAccountId ?? undefined,
        labelContains: data.labelContains,
        entityType:    data.entityType,
        entityId:      data.entityId   ?? undefined,
        category:      data.category   ?? undefined,
        amountMin:     data.amountMin  ?? undefined,
        amountMax:     data.amountMax  ?? undefined,
        isAutoApply:   data.isAutoApply ?? false,
        confidence:    1, createdById: userId,
      },
    });
  }

  async updateMatchingRule(id: string, data: {
    labelContains?: string; isActive?: boolean; isAutoApply?: boolean;
    amountMin?: number; amountMax?: number;
  }) {
    return this.prisma.bankMatchingRule.update({ where: { id }, data });
  }

  async deleteMatchingRule(id: string) {
    return this.prisma.bankMatchingRule.update({ where: { id }, data: { isActive: false } });
  }
}
```

---

## 5. Code complet — BankController

```typescript
// src/modules/bank/bank.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UploadedFile,
  UseInterceptors, Header, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BankService } from './bank.service';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Permission } from '../../core/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  createBankAccountSchema, updateBankAccountSchema,
  createTransactionSchema, reconcileTransactionSchema,
  openReconciliationSchema, importCsvSchema,
  detectFormatSchema, confirmImportSchema, saveProfileOverrideSchema,
} from './bank.schema';
import type { JwtPayload } from '../../core/interfaces/jwt-payload.interface';
import { AppError } from '../../core/errors/app-error';

const fileUpload = { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } };

@Controller('bank')
export class BankController {
  constructor(private readonly bank: BankService) {}

  // ── Résumé ──────────────────────────────────────────────────────────────────

  @Get('summary')
  @Permission('bank:read')
  async getBankSummary() {
    return this.bank.getBankSummary();
  }

  // ── Comptes ─────────────────────────────────────────────────────────────────

  @Get('accounts')
  @Permission('bank:read')
  async listAccounts() {
    return this.bank.listAccounts();
  }

  @Post('accounts')
  @Permission('bank:manage')
  @HttpCode(HttpStatus.CREATED)
  async createAccount(
    @Body(new ZodValidationPipe(createBankAccountSchema)) body: any,
  ) {
    return this.bank.createAccount(body);
  }

  // IMPORTANT : cette route doit être déclarée AVANT @Get('accounts/:id')
  // pour éviter que ":id" capture "accounts/xyz/import-config"
  // En pratique, NestJS gère les segments différents (3 vs 2),
  // mais la convention est de mettre les routes spécifiques d'abord.
  @Get('accounts/:id/import-config')
  @Permission('bank:read')
  async getImportConfig(@Param('id') id: string) {
    return this.bank.getImportConfig(id);
  }

  @Get('accounts/:id')
  @Permission('bank:read')
  async getAccount(@Param('id') id: string) {
    return this.bank.getAccountById(id);
  }

  @Put('accounts/:id')
  @Permission('bank:manage')
  async updateAccount(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBankAccountSchema)) body: any,
  ) {
    return this.bank.updateAccount(id, body);
  }

  @Delete('accounts/:id')
  @Permission('bank:manage')
  async deleteAccount(@Param('id') id: string) {
    await this.bank.deleteAccount(id);
    return { message: 'Compte bancaire supprimé' };
  }

  // ── Transactions ─────────────────────────────────────────────────────────────

  // Sous-routes spécifiques AVANT @Get('transactions/:id')
  @Get('transactions/:id/suggestions')
  @Permission('bank:read')
  async getSuggestions(@Param('id') id: string) {
    return this.bank.getSuggestions(id);
  }

  @Get('transactions/:id/subset-matches')
  @Permission('bank:read')
  async getSubsetMatches(@Param('id') id: string) {
    return this.bank.findSubsetMatches(id);
  }

  @Post('transactions/:id/reconcile')
  @Permission('bank:reconcile')
  async reconcileTransaction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reconcileTransactionSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.reconcileTransaction(id, body, user.id);
  }

  @Post('transactions/:id/unmatch')
  @Permission('bank:reconcile')
  async unmatchTransaction(@Param('id') id: string) {
    return this.bank.unmatchTransaction(id);
  }

  @Post('transactions/:id/ignore')
  @Permission('bank:reconcile')
  async ignoreTransaction(@Param('id') id: string) {
    return this.bank.ignoreTransaction(id);
  }

  @Get('transactions')
  @Permission('bank:read')
  @SkipResponseWrapper()
  async listTransactions(
    @Query('page')       page       = '1',
    @Query('limit')      limit      = '20',
    @Query('accountId')  accountId?: string,
    @Query('type')       type?:      string,
    @Query('dateFrom')   dateFrom?:  string,
    @Query('dateTo')     dateTo?:    string,
    @Query('reconciled') reconciledStr?: string,
    @Query('search')     search?:    string,
  ) {
    const p         = Math.max(1, parseInt(page));
    const l         = Math.min(100, Math.max(1, parseInt(limit)));
    const reconciled = reconciledStr === 'true' ? true : reconciledStr === 'false' ? false : undefined;
    const { data, total } = await this.bank.listTransactions({ page: p, limit: l, accountId, type, dateFrom, dateTo, reconciled, search });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  @Post('transactions')
  @Permission('bank:manage')
  @HttpCode(HttpStatus.CREATED)
  async createTransaction(
    @Body(new ZodValidationPipe(createTransactionSchema)) body: any,
  ) {
    return this.bank.createTransaction(body);
  }

  @Get('transactions/:id')
  @Permission('bank:read')
  async getTransaction(@Param('id') id: string) {
    return this.bank.getTransactionById(id);
  }

  // ── Rapprochements ───────────────────────────────────────────────────────────

  // Sous-routes AVANT @Get('reconciliations/:id')
  @Get('reconciliations/:id/report')
  @Permission('bank:read')
  async getReconciliationReport(@Param('id') id: string) {
    return this.bank.getReconciliationReport(id);
  }

  @Post('reconciliations/:id/auto-match')
  @Permission('bank:auto-match')
  async autoMatch(
    @Param('id') id: string,
    @Body() body: { applyHighConfidence?: boolean },
  ) {
    return this.bank.getAutoMatchBatch(id, body?.applyHighConfidence === true);
  }

  @Post('reconciliations/:id/complete')
  @Permission('bank:reconcile')
  async completeReconciliation(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.completeReconciliation(id, user.id);
  }

  @Get('reconciliations')
  @Permission('bank:read')
  @SkipResponseWrapper()
  async listReconciliations(
    @Query('page')      page      = '1',
    @Query('limit')     limit     = '20',
    @Query('accountId') accountId?: string,
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const { data, total } = await this.bank.listReconciliations({ page: p, limit: l, accountId });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  @Post('reconciliations')
  @Permission('bank:reconcile')
  @HttpCode(HttpStatus.CREATED)
  async openReconciliation(
    @Body(new ZodValidationPipe(openReconciliationSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.openReconciliation(body, user.id);
  }

  @Get('reconciliations/:id')
  @Permission('bank:read')
  async getReconciliation(@Param('id') id: string) {
    return this.bank.getReconciliationById(id);
  }

  // ── Import — nouveau pipeline (routes statiques AVANT /:id) ─────────────────

  @Post('import/detect')
  @Permission('bank:import-parse')
  @UseInterceptors(FileInterceptor('file', fileUpload))
  async detectFormat(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(detectFormatSchema)) body: any,
  ) {
    if (!file) throw AppError.badRequest('Fichier requis');
    return this.bank.detectImportFormat(file.buffer, body.bankAccountId, file.originalname, body.encoding);
  }

  @Post('import/preview')
  @Permission('bank:import-parse')
  @UseInterceptors(FileInterceptor('file', fileUpload))
  async previewImport(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { bankAccountId: string; encoding?: string },
  ) {
    if (!file) throw AppError.badRequest('Fichier requis');
    return this.bank.previewImport(file.buffer, body.bankAccountId, file.originalname, body.encoding as any);
  }

  @Post('import/confirm')
  @Permission('bank:import-confirm')
  async confirmImport(
    @Body(new ZodValidationPipe(confirmImportSchema)) body: { importId: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.confirmImport(body.importId, user.id);
  }

  @Get('import/:id/status')
  @Permission('bank:import-confirm')
  async getImportStatus(@Param('id') id: string) {
    return this.bank.getImportStatus(id);
  }

  @Delete('import/:id')
  @Permission('bank:import-confirm')
  async rollbackImport(@Param('id') id: string) {
    return this.bank.rollbackImport(id);
  }

  // Route dépréciée — headers @Deprecated
  @Post('import')
  @Permission('bank:import-confirm')
  @Header('Deprecation', 'true')
  @Header('Sunset', '2026-12-31')
  @UseInterceptors(FileInterceptor('file', fileUpload))
  @HttpCode(HttpStatus.CREATED)
  async importCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(importCsvSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw AppError.badRequest('Fichier CSV requis');
    const csvContent = file.buffer.toString('utf-8');
    return this.bank.importCsv(csvContent, body, user.id);
  }

  // ── Profils ──────────────────────────────────────────────────────────────────

  @Post('profiles/override')
  @Permission('bank:import-parse')
  async saveProfileOverride(
    @Body(new ZodValidationPipe(saveProfileOverrideSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.saveProfileOverride(body.bankAccountId, body.profileData, user.id);
  }

  // ── Règles de matching ───────────────────────────────────────────────────────

  @Get('matching-rules')
  @Permission('bank:read')
  async listMatchingRules(@Query('bankAccountId') bankAccountId?: string) {
    return this.bank.listMatchingRules(bankAccountId);
  }

  @Post('matching-rules')
  @Permission('bank:rules')
  @HttpCode(HttpStatus.CREATED)
  async createMatchingRule(
    @Body() body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.createMatchingRule(body, user.id);
  }

  @Put('matching-rules/:id')
  @Permission('bank:rules')
  async updateMatchingRule(@Param('id') id: string, @Body() body: any) {
    return this.bank.updateMatchingRule(id, body);
  }

  @Delete('matching-rules/:id')
  @Permission('bank:rules')
  async deleteMatchingRule(@Param('id') id: string) {
    await this.bank.deleteMatchingRule(id);
    return { message: 'Règle désactivée' };
  }
}
```

---

## 6. Code complet — BankImportProcessor

```typescript
// src/modules/bank/bank-import.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { BANK_IMPORT_QUEUE } from '../../jobs/constants';

interface ImportLine {
  bankAccountId:   string;
  transactionDate: string;  // ISO string
  valueDate?:      string;
  label:           string;
  amount:          number;
  type:            'debit' | 'credit';
  reference?:      string;
  balanceAfter?:   number;
  contentHash:     string;
  source:          string;
  importId:        string;
  createdById:     string;
}

interface BankImportJobData {
  importId:      string;
  bankAccountId: string;
  lines:         ImportLine[];
}

@Processor(BANK_IMPORT_QUEUE)
export class BankImportProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<BankImportJobData>): Promise<void> {
    const { importId, bankAccountId, lines } = job.data;

    const BATCH_SIZE = 100;
    let totalImported = 0;

    try {
      // Traitement par batch pour éviter les timeouts Prisma
      for (let i = 0; i < lines.length; i += BATCH_SIZE) {
        const batch = lines.slice(i, i + BATCH_SIZE);

        // Vérifier les doublons dans chaque batch
        const hashes = batch.map(l => l.contentHash);
        const existing = await this.prisma.bankTransaction.findMany({
          where:  { bankAccountId, contentHash: { in: hashes } },
          select: { contentHash: true },
        });
        const existingSet = new Set(existing.map(e => e.contentHash!));

        const toCreate = batch
          .filter(l => !existingSet.has(l.contentHash))
          .map(l => ({
            bankAccountId:   l.bankAccountId,
            transactionDate: new Date(l.transactionDate),
            valueDate:       l.valueDate ? new Date(l.valueDate) : undefined,
            label:           l.label,
            amount:          l.amount,
            type:            l.type,
            reference:       l.reference   ?? undefined,
            balanceAfter:    l.balanceAfter ?? undefined,
            contentHash:     l.contentHash,
            source:          l.source,
            importId:        l.importId,
            createdById:     l.createdById,
          }));

        if (toCreate.length > 0) {
          const result = await this.prisma.bankTransaction.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
          totalImported += result.count;
        }

        // Mettre à jour la progression
        const progress = Math.round(((i + BATCH_SIZE) / lines.length) * 100);
        await job.updateProgress(Math.min(progress, 99));
      }

      // Calculer le delta de solde
      const delta = lines.reduce((acc, l) => acc + (l.type === 'credit' ? l.amount : -l.amount), 0);

      await this.prisma.$transaction([
        this.prisma.bankAccount.update({
          where: { id: bankAccountId },
          data:  { currentBalance: { increment: delta } },
        }),
        this.prisma.bankStatementImport.update({
          where: { id: importId },
          data:  {
            status:         'completed',
            processedAt:    new Date(),
            nbTransactions: totalImported,
            nbUnmatched:    totalImported,
          },
        }),
      ]);

      await job.updateProgress(100);

    } catch (error) {
      await this.prisma.bankStatementImport.update({
        where: { id: importId },
        data:  {
          status:       'failed',
          errorMessage: error instanceof Error ? error.message : 'Erreur inconnue',
        },
      });
      throw error; // Re-lancer pour que BullMQ marque le job comme failed
    }
  }
}
```

---

## 7. Code complet — BankModule

```typescript
// src/modules/bank/bank.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BankService } from './bank.service';
import { BankController } from './bank.controller';
import { BankImportProcessor } from './bank-import.processor';
import { BANK_IMPORT_QUEUE } from '../../jobs/constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: BANK_IMPORT_QUEUE }),
  ],
  controllers: [BankController],
  providers:   [BankService, BankImportProcessor],
  exports:     [BankService],
})
export class BankModule {}
```

---

## 8. Mise à jour AppModule

```typescript
// src/app.module.ts — ajouter dans imports[]
import { BankModule } from './modules/bank/bank.module';

@Module({
  imports: [
    // ... modules existants phases 1-4 ...
    BankModule,
  ],
})
export class AppModule {}
```

---

## 9. Schémas Zod — bank.schema.ts (inchangé, copier tel quel)

```typescript
// src/modules/bank/bank.schema.ts — COPIER DEPUIS EXPRESS SANS MODIFICATION
import { z } from 'zod';

export const createBankAccountSchema = z.object({
  name:              z.string().min(2).max(255),
  bankName:          z.string().min(1).max(255),
  accountNumber:     z.string().max(100).optional().nullable(),
  branchName:        z.string().max(255).optional().nullable(),
  iban:              z.string().max(50).optional().nullable(),
  swiftBic:          z.string().max(20).optional().nullable(),
  currency:          z.string().length(3).default('XAF'),
  openingBalance:    z.number().default(0),
  isDefault:         z.boolean().default(false),
  accountingAccount: z.string().max(20).optional().nullable(),
  color:             z.string().length(7).optional().nullable(),
  notes:             z.string().optional().nullable(),
});

export const updateBankAccountSchema = createBankAccountSchema.partial();
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;

export const createTransactionSchema = z.object({
  bankAccountId:   z.string().uuid(),
  transactionDate: z.coerce.date(),
  label:           z.string().min(1).max(500),
  amount:          z.number().refine((n) => n !== 0, 'Le montant ne peut pas être zéro'),
  type:            z.enum(['debit', 'credit']),
  reference:       z.string().max(255).optional().nullable(),
  category:        z.string().max(100).optional().nullable(),
  notes:           z.string().optional().nullable(),
});

export const reconcileTransactionSchema = z.object({
  matchedEntityType: z.enum(['payment', 'supplier_payment', 'expense']),
  matchedEntityId:   z.string().uuid(),
});

export const openReconciliationSchema = z.object({
  bankAccountId:  z.string().uuid(),
  periodStart:    z.coerce.date(),
  periodEnd:      z.coerce.date(),
  openingBalance: z.number().default(0),
  notes:          z.string().optional().nullable(),
});

export const importCsvSchema = z.object({
  bankAccountId:   z.string().uuid(),
  dateColumn:      z.string().default('date'),
  labelColumn:     z.string().default('libelle'),
  debitColumn:     z.string().default('debit'),
  creditColumn:    z.string().default('credit'),
  referenceColumn: z.string().optional(),
  dateFormat:      z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('DD/MM/YYYY'),
  delimiter:       z.enum([',', ';', '\t']).default(';'),
});

export const detectFormatSchema = z.object({
  bankAccountId: z.string().uuid(),
  encoding:      z.enum(['auto', 'utf-8', 'win1252', 'iso-8859-1', 'utf-16le']).optional().default('auto'),
});

export const previewImportSchema = z.object({
  bankAccountId: z.string().uuid(),
  encoding:      z.enum(['auto', 'utf-8', 'win1252', 'iso-8859-1', 'utf-16le']).optional().default('auto'),
});

export const confirmImportSchema = z.object({
  importId: z.string().uuid(),
});

export const saveProfileOverrideSchema = z.object({
  bankAccountId: z.string().uuid(),
  profileData:   z.record(z.any()),
});

export type CreateBankAccountInput  = z.infer<typeof createBankAccountSchema>;
export type CreateTransactionInput  = z.infer<typeof createTransactionSchema>;
export type ReconcileInput          = z.infer<typeof reconcileTransactionSchema>;
export type OpenReconciliationInput = z.infer<typeof openReconciliationSchema>;
export type ImportCsvInput          = z.infer<typeof importCsvSchema>;
export type DetectFormatInput       = z.infer<typeof detectFormatSchema>;
```

---

## 10. Table récapitulative des pièges

| Piège | Cause | Solution |
|---|---|---|
| `@UploadedFile()` retourne `undefined` | FileInterceptor non appliqué OU `multipart/form-data` absent du content-type côté client | Toujours utiliser `@UseInterceptors(FileInterceptor('file', fileUpload))` + vérifier le content-type |
| Headers `@Header()` ne s'appliquent pas | Ordre des décorateurs : `@Header` doit être AVANT `@UseInterceptors` | Ordre : `@Post`, `@Permission`, `@Header`, `@UseInterceptors` |
| `query.reconciled` toujours `undefined` | NestJS passe les query params comme strings | Convertir manuellement : `reconciledStr === 'true' ? true : reconciledStr === 'false' ? false : undefined` |
| `BankImportProcessor` jamais déclenché | Oublié dans `providers[]` de `BankModule` | Ajouter `BankImportProcessor` aux providers |
| `job.progress` lecture échoue | `getJob(record.jobId)` peut throw si le job est déjà supprimé | Entourer de `try/catch` avec fallback `progress = 100` |
| `parseStatementFile` introuvable | Import de `bank.parsers.ts` manquant | Ce fichier est **copié tel quel** depuis Express, pas transformé en service |
| `iconv-lite` non installé | Dépendance manquante dans le nouveau projet NestJS | `pnpm add iconv-lite` |
| Route `import/:id/status` capturée par `import/confirm` | Confusion méthode HTTP | `GET import/:id/status` vs `POST import/confirm` — méthodes différentes, pas de conflit |
| `BullModule.registerQueue` sans `BANK_IMPORT_QUEUE` dans `BankModule` | Module non enregistré | Le `@InjectQueue()` dans BankService échoue à l'injection si `BullModule.registerQueue` absent |

---

## 11. Ordre des fichiers à créer

```
src/modules/bank/
├── bank.schema.ts        # Copier depuis Express sans modification
├── bank.matching.ts      # Copier depuis Express sans modification
├── bank.profiles.ts      # Copier depuis Express sans modification
├── bank.parsers.ts       # Copier depuis Express sans modification
├── bank.service.ts       # Réécrire avec this.prisma + @InjectQueue
├── bank.controller.ts    # Réécrire avec décorateurs NestJS
├── bank-import.processor.ts  # NOUVEAU — traitement async des gros imports
└── bank.module.ts        # NOUVEAU
```

**Nota bene** : Les 4 premiers fichiers (schema, matching, profiles, parsers) sont **copiés tels quels**.
Ils n'ont aucune dépendance NestJS et fonctionnent parfaitement en modules TypeScript purs.
C'est l'avantage d'avoir séparé la logique algorithmique depuis le début.
