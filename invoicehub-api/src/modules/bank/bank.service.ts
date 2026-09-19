// src/modules/bank/bank.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { BANK_IMPORT_QUEUE } from '../../jobs/constants';
import {
  CreateBankAccountInput, UpdateBankAccountInput,
  CreateTransactionInput, ReconcileInput, OpenReconciliationInput,
  DetectFormatInput,
} from './bank.schema';
import {
  decodeBuffer, autoDetectFormat, parseStatementFile,
  detectFileFormat, computeContentHash,
  DetectedFormat, ImportPreview, FileFormat,
} from './bank.parsers';
import type { BankProfile } from './bank.profiles';
import {
  computeScore, subsetSum, hungarian, SubsetCandidate, ruleLabelMatches,
} from './bank.matching';
import * as accountingEngine from '../../lib/accountingEngine';

export interface BankImportJobData {
  importId:      string;
  bankAccountId: string;
  // Les lignes ne transitent plus par le job : le worker les relit depuis previewData.
  userId?:       string | null;
}

@Injectable()
export class BankService {
  private readonly logger = new Logger(BankService.name);

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
      this.prisma.bankReconciliation.count({ where: { status: 'in_progress' } }),
      // Seuls les imports RÉELLEMENT terminés comptent : `importedAt` a un
      // `@default(now())` posé dès la prévisualisation, donc compter dessus gonflait
      // le KPI à chaque clic de preview (imports « pending » abandonnés compris).
      this.prisma.bankStatementImport.count({ where: { status: 'completed', processedAt: { gte: startOfMonth } } }),
    ]);

    // On n'additionne JAMAIS des devises différentes : total par devise…
    const totalsByCurrency = Object.values(
      accounts.reduce<Record<string, { currency: string; total: number; count: number }>>((acc, a) => {
        const cur = a.currency ?? 'XAF';
        (acc[cur] ??= { currency: cur, total: 0, count: 0 });
        acc[cur].total += Number(a.currentBalance ?? 0);
        acc[cur].count += 1;
        return acc;
      }, {}),
    ).sort((a, b) => b.total - a.total);

    // …et un total « principal » toujours cohérent (XAF si présent, sinon la devise dominante).
    const totalBalance =
      (totalsByCurrency.find((t) => t.currency === 'XAF') ?? totalsByCurrency[0])?.total ?? 0;

    return {
      totalBalance,
      totalsByCurrency,
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
          accountType:       data.accountType ?? undefined,
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

    // Le solde d'ouverture est figé dès qu'il existe au moins un mouvement (sinon il
    // désynchroniserait le solde courant et fausserait les rapprochements). On
    // l'autorise tant que le compte n'a aucune transaction, en resynchronisant alors
    // le solde courant. Sinon on l'ignore / le rejette.
    const { openingBalance, ...rest } = data;
    const updateData: Record<string, unknown> = { ...rest };

    if (openingBalance !== undefined && Number(openingBalance) !== Number(account.openingBalance)) {
      const movements = await this.prisma.bankTransaction.count({ where: { bankAccountId: id } });
      if (movements > 0) {
        throw AppError.conflict(
          "Le solde d'ouverture ne peut plus être modifié : ce compte a déjà des mouvements.",
        );
      }
      updateData['openingBalance'] = openingBalance;
      updateData['currentBalance'] = openingBalance; // aucun mouvement → resynchronisation
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.bankAccount.updateMany({
          where: { isDefault: true, deletedAt: null, id: { not: id } },
          data:  { isDefault: false },
        });
      }
      return tx.bankAccount.update({ where: { id }, data: updateData });
    });
  }

  async deleteAccount(id: string) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');
    if (Number(account.currentBalance) !== 0) {
      throw AppError.conflict('Impossible de supprimer un compte avec un solde non nul');
    }

    // Garde-fou d'intégrité : pas de suppression pendant un rapprochement en cours.
    const openRecon = await this.prisma.bankReconciliation.count({
      where: { bankAccountId: id, status: 'in_progress' },
    });
    if (openRecon > 0) {
      throw AppError.conflict(
        'Impossible de supprimer ce compte : un rapprochement est en cours. Terminez-le d\'abord.',
      );
    }

    // Suppression LOGIQUE (soft-delete via `deletedAt`) : l'historique des mouvements
    // est conservé en base. Bloquer la suppression d'un compte à solde nul au motif
    // de « préserver l'historique » n'avait pas de sens — le soft-delete le préserve
    // déjà. On autorise donc la suppression dès lors que le solde est nul et qu'aucun
    // rapprochement n'est en cours.
    await this.prisma.bankAccount.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  private static readonly RECON_STATUSES = ['pending', 'reconciled', 'unmatched', 'ignored'] as const;

  async listTransactions(params: {
    page: number; limit: number;
    accountId?: string; type?: string;
    dateFrom?: string; dateTo?: string;
    reconciled?: boolean; status?: string; search?: string;
  }) {
    const { page, limit, accountId, type, dateFrom, dateTo, reconciled, status, search } = params;
    const where: Record<string, unknown> = {};
    if (accountId) where['bankAccountId'] = accountId;
    if (type) {
      if (type !== 'debit' && type !== 'credit')
        throw AppError.badRequest('Type de mouvement invalide (attendu : debit ou credit).', 'INVALID_TYPE');
      where['type'] = type;
    }
    // `status` (enum complet) prime sur le booléen `reconciled` (rétro-compat des
    // liens du tableau de bord). Un statut inconnu est ignoré plutôt que de vider
    // la liste. Le booléen ne pouvait exprimer que pending/reconciled — d'où les
    // onglets « Non identifiées » / « Ignorées » qui retombaient sur « en attente ».
    if (status && (BankService.RECON_STATUSES as readonly string[]).includes(status)) {
      where['reconciliationStatus'] = status;
    } else if (typeof reconciled === 'boolean') {
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
        // `transactionDate` est une date au jour près : sans départage, l'ordre des
        // mouvements d'une même journée n'est pas stable → risque de doublons ou
        // d'oublis entre pages. `createdAt` (précis) fige l'ordre.
        orderBy:  [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
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
    // Pas de saisie sur une trésorerie hors service (cohérent avec payExpense).
    if (!account.isActive) throw AppError.badRequest('Ce compte est désactivé : aucune saisie possible.', 'ACCOUNT_INACTIVE');

    const delta = data.type === 'credit' ? data.amount : -data.amount;

    // Date calendaire figée à minuit UTC : une date construite à minuit local
    // reculerait d'un jour au Cameroun (UTC+1) et fausserait le fenêtrage du
    // matching. On ne garde que l'année/mois/jour (cf. mémoire dates-calendaires).
    const d = new Date(data.transactionDate);
    const txDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

    // Empreinte de contenu : mêmes règles que l'import → protège des saisies
    // manuelles en double via la contrainte unique [bankAccountId, contentHash].
    const contentHash = computeContentHash(data.bankAccountId, txDate, data.amount, data.type, data.label);

    // Solde résultant après ce mouvement (renseigne balanceAfter, jusque-là null
    // en saisie manuelle).
    const balanceAfter = Number(account.currentBalance) + delta;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const transaction = await tx.bankTransaction.create({
          data: {
            bankAccountId:   data.bankAccountId,
            transactionDate: txDate,
            label:           data.label,
            amount:          data.amount,
            type:            data.type,
            balanceAfter,
            contentHash,
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
    } catch (e) {
      // Violation de la contrainte d'unicité → doublon (même compte, date, montant,
      // sens, libellé).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw AppError.conflict('Une transaction identique existe déjà sur ce compte (même date, montant et libellé).', 'DUPLICATE_TRANSACTION');
      throw e;
    }
  }

  /**
   * Supprime une saisie MANUELLE (jamais un mouvement importé, qui relève de
   * l'annulation d'import) et rétablit le solde du compte. Refuse une transaction
   * rapprochée : il faut d'abord la dé-rapprocher (sinon on romprait le lien vers
   * la contrepartie métier et on fausserait le rapprochement).
   */
  async deleteTransaction(id: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('Transaction introuvable');
    if (t.importId)
      throw AppError.badRequest('Cette transaction provient d’un import : annulez l’import correspondant.', 'IMPORTED_TRANSACTION');
    if (t.reconciliationStatus === 'reconciled')
      throw AppError.conflict('Dé-rapprochez la transaction avant de la supprimer.', 'RECONCILED_TRANSACTION');

    // Sens inverse de la création : on retire l'effet du mouvement sur le solde.
    const delta = t.type === 'credit' ? -Number(t.amount) : Number(t.amount);
    await this.prisma.$transaction(async (tx) => {
      await tx.bankAccount.update({
        where: { id: t.bankAccountId },
        data:  { currentBalance: { increment: delta } },
      });
      await tx.bankTransaction.delete({ where: { id } });
    });
    return { success: true };
  }

  // ── Règles de matching apprises ──────────────────────────────────────────────

  // Une règle ne pèse dans le score qu'à partir de ce niveau de confiance. Les
  // règles créées à la main démarrent directement à ce seuil (voir
  // createMatchingRule) → elles agissent immédiatement, sans attendre 3 renforts.
  private static readonly RULE_TRUST_THRESHOLD = 3;

  /** Règles actives applicables à une transaction : celles du compte ET les globales. */
  private _activeRulesForAccount(bankAccountId: string) {
    return this.prisma.bankMatchingRule.findMany({
      where: { isActive: true, OR: [{ bankAccountId }, { bankAccountId: null }] },
    });
  }

  /**
   * Règle la plus pertinente qui « se déclenche » pour une transaction et un
   * candidat donnés. Le motif est comparé au LIBELLÉ BANCAIRE (et non au libellé
   * fabriqué du candidat — bug corrigé), la plage de montant à celui de la
   * transaction. On exige le bon type d'entité et une confiance suffisante ;
   * le bonus est renforcé si la règle vise précisément cette entité.
   */
  private _firingRule(
    rules: Array<{ confidence: number; entityType: string; entityId: string | null; labelContains: string; amountMin: unknown; amountMax: unknown; isAutoApply: boolean; id: string }>,
    txLabel: string, txAmount: number, entityType: string, entityId: string,
    opts: { autoApplyOnly?: boolean } = {},
  ): { ruleId: string; bonus: number; isAutoApply: boolean } | null {
    let best: { ruleId: string; bonus: number; isAutoApply: boolean } | null = null;
    for (const r of rules) {
      if (r.confidence < BankService.RULE_TRUST_THRESHOLD) continue;
      if (opts.autoApplyOnly && !r.isAutoApply) continue;
      if (r.entityType !== entityType) continue;
      if (!ruleLabelMatches(r.labelContains, txLabel)) continue;
      const amountOk = (r.amountMin == null || txAmount >= Number(r.amountMin))
                    && (r.amountMax == null || txAmount <= Number(r.amountMax));
      if (!amountOk) continue;
      const bonus = r.entityId && r.entityId === entityId ? 15 : 12;
      if (!best || bonus > best.bonus) best = { ruleId: r.id, bonus, isAutoApply: r.isAutoApply };
    }
    return best;
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
        include: { invoice: { select: { number: true, client: { select: { name: true } } } } },
        take: 5,
      }),
      this.prisma.supplierPayment.findMany({
        where: {
          deletedAt: null, bankTransactionId: null,
          amount:      { gte: amount - tolerance, lte: amount + tolerance },
          paymentDate: { gte: dateFrom, lte: dateTo },
        },
        include: { supplierInvoice: { select: { supplierInvoiceNumber: true, supplier: { select: { name: true } } } } },
        take: 5,
      }),
      this.prisma.expense.findMany({
        where: {
          deletedAt: null, bankTransactionId: null,
          amountTtc:   { gte: amount - tolerance, lte: amount + tolerance },
          expenseDate: { gte: dateFrom, lte: dateTo },
        },
        select: {
          id: true, number: true, title: true, amountTtc: true, expenseDate: true,
          beneficiaryName: true, supplier: { select: { name: true } },
        },
        take: 5,
      }),
      this._activeRulesForAccount(tx0.bankAccountId),
    ]);

    // Sens du mouvement : un crédit (entrée d'argent) ne se rapproche que d'un
    // encaissement client ; un débit (sortie) que d'une dépense ou d'un paiement
    // fournisseur. On écarte donc les contreparties de sens opposé.
    const isCredit                 = tx0.type === 'credit';
    const relevantPayments         = isCredit ? payments : [];
    const relevantSupplierPayments = isCredit ? [] : supplierPayments;
    const relevantExpenses         = isCredit ? [] : expenses;

    const score = (
      entityType: string, entityId: string,
      entityAmount: number, entityDate: Date, entityLabel: string,
      entityRef?: string | null, entityParty?: string | null, entityDocNumber?: string | null,
    ) =>
      computeScore({
        entityAmount, entityDate, entityLabel, entityRef, entityParty, entityDocNumber,
        txAmount:  amount,
        txDate:    tx0.transactionDate,
        txLabel:   tx0.label,
        txRef:     tx0.reference,
        // Bonus fondé sur le libellé bancaire réel + le type/l'entité du candidat.
        ruleBonus: this._firingRule(matchingRules, tx0.label, amount, entityType, entityId)?.bonus ?? 0,
      });

    const suggestions: Array<{
      entityType: string; entityId: string; label: string;
      amount: number; date: Date; score: number; scoreDetail: object;
    }> = [];

    for (const p of relevantPayments) {
      const lbl    = `Paiement FAC ${p.invoice?.number ?? ''} — ${Number(p.amount).toLocaleString('fr-FR')} XAF`;
      const detail = score('payment', p.id, Number(p.amount), p.paymentDate, lbl, p.reference, p.invoice?.client?.name, p.invoice?.number);
      suggestions.push({ entityType: 'payment', entityId: p.id, label: lbl, amount: Number(p.amount), date: p.paymentDate, score: detail.total, scoreDetail: detail });
    }
    for (const sp of relevantSupplierPayments) {
      const lbl    = `Paiement fournisseur ${sp.supplierInvoice?.supplierInvoiceNumber ?? ''} — ${Number(sp.amount).toLocaleString('fr-FR')} XAF`;
      const detail = score('supplier_payment', sp.id, Number(sp.amount), sp.paymentDate, lbl, sp.reference, sp.supplierInvoice?.supplier?.name, sp.supplierInvoice?.supplierInvoiceNumber);
      suggestions.push({ entityType: 'supplier_payment', entityId: sp.id, label: lbl, amount: Number(sp.amount), date: sp.paymentDate, score: detail.total, scoreDetail: detail });
    }
    for (const e of relevantExpenses) {
      const lbl    = `Dépense ${e.number} — ${e.title}`;
      const detail = score('expense', e.id, Number(e.amountTtc), e.expenseDate, lbl, null, e.beneficiaryName ?? e.supplier?.name, e.number);
      suggestions.push({ entityType: 'expense', entityId: e.id, label: lbl, amount: Number(e.amountTtc), date: e.expenseDate, score: detail.total, scoreDetail: detail });
    }

    suggestions.sort((a, b) => b.score - a.score);

    // Mouvement sans contrepartie métier plausible : proposer, le cas échéant, la
    // création automatique d'une contrepartie de frais bancaires / agios (débit
    // uniquement, libellé reconnu). Simple suggestion — jamais appliquée seule.
    const bestScore = suggestions[0]?.score ?? 0;
    let feeSuggestion: {
      account: string; accountLabel: string; categoryName: string;
      amount: number; label: string; ceiling: number; overCeiling: boolean;
    } | null = null;
    if (tx0.type === 'debit') {
      const detected = this.classifyBankFee(tx0.label);
      // On ne propose la contrepartie que si aucune vraie contrepartie ne domine
      // (sinon on privilégie le rapprochement d'une dépense/paiement existant).
      if (detected && bestScore < 80) {
        const ceiling = await this._bankFeeCeiling(tx0.bankAccountId);
        feeSuggestion = {
          account:      detected.account,
          accountLabel: detected.accountLabel,
          categoryName: detected.categoryName,
          amount:       amount,
          label:        tx0.label,
          ceiling,
          overCeiling:  amount > ceiling,
        };
      }
    }

    return { transaction: tx0, suggestions: suggestions.slice(0, 10), feeSuggestion };
  }

  // ── Contrepartie automatique de frais bancaires (SYSCOHADA) ─────────────────

  /**
   * Règles de reconnaissance d'un mouvement de frais bancaire à partir du libellé,
   * avec imputation SYSCOHADA :
   *  - 671 « Intérêts des emprunts et dettes » (charges financières) → agios,
   *    intérêts débiteurs, découvert, escompte ;
   *  - 627 « Services bancaires et assimilés » → frais de tenue de compte,
   *    commissions, cartes, virements, abonnements.
   * L'ordre compte : les agios (671) sont testés avant les frais génériques (627).
   */
  private static readonly BANK_FEE_RULES: ReadonlyArray<{
    test: RegExp; account: string; accountLabel: string; categoryName: string;
  }> = [
    {
      test:         /AGIOS?|INT[ÉE]R[ÊE]T|D[ÉE]COUVERT|ESCOMPTE/i,
      account:      '671',
      accountLabel: 'Intérêts des emprunts et dettes',
      categoryName: 'Agios et intérêts bancaires',
    },
    {
      test:         /FRAIS|COMMISSION|COTISATION|TENUE DE COMPTE|ABONNEMENT|CARTE|SMS|CHANGE|SERVICE[S]? BANCAIRE/i,
      account:      '627',
      accountLabel: 'Services bancaires et assimilés',
      categoryName: 'Frais bancaires',
    },
  ];

  private classifyBankFee(label: string) {
    if (!label) return null;
    for (const rule of BankService.BANK_FEE_RULES) {
      if (rule.test.test(label)) return rule;
    }
    return null;
  }

  /**
   * Plafond de sécurité d'une contrepartie de frais, en devise du compte. Appris de
   * l'historique des contreparties déjà créées sur ce compte (× 1,5) et borné par un
   * plancher par défaut. Au-delà, la création exige une confirmation explicite —
   * garde-fou contre l'imputation en « frais » d'un gros débit qui n'en est pas un.
   */
  private async _bankFeeCeiling(bankAccountId: string): Promise<number> {
    const DEFAULT_CEILING = 50_000; // XAF
    const agg = await this.prisma.expense.aggregate({
      where: { bankAccountId, autoBankFee: true, deletedAt: null },
      _max:  { amountTtc: true },
    });
    const maxPast = Number(agg._max.amountTtc ?? 0);
    return Math.max(DEFAULT_CEILING, Math.round(maxPast * 1.5));
  }

  /**
   * Crée la contrepartie comptable d'un mouvement de frais bancaire : une dépense
   * déjà « payée » (le débit bancaire prouve le paiement), l'écriture SYSCOHADA
   * associée (Dr 627/671 [+ 445x si TVA] / Cr 521 banque, en brouillon), puis le
   * rapprochement de la transaction. Réservé aux débits, sous confirmation humaine
   * (endpoint dédié) et plafonné. La dépense est marquée `autoBankFee` pour une
   * annulation propre au désappariement.
   */
  async createFeeCounterpart(
    transactionId: string,
    userId: string,
    opts: { taxRate?: number; account?: string; categoryName?: string; allowOverCeiling?: boolean } = {},
  ) {
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const tx0 = await this.prisma.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!tx0) throw AppError.notFound('Transaction introuvable');

    // Garde-fous
    if (tx0.type !== 'debit')
      throw AppError.badRequest('Une contrepartie de frais ne se crée que sur un débit (sortie d’argent).', 'FEE_NOT_DEBIT');
    if (tx0.reconciliationStatus === 'reconciled' || tx0.matchedEntityId)
      throw AppError.conflict('Cette transaction est déjà rapprochée.', 'ALREADY_RECONCILED');

    const amountTtc = Number(tx0.amount);
    if (!(amountTtc > 0)) throw AppError.badRequest('Montant de transaction invalide.', 'INVALID_AMOUNT');

    // Classification SYSCOHADA (surchargée si l'appelant impose un compte).
    const detected     = this.classifyBankFee(tx0.label);
    const account      = opts.account      ?? detected?.account      ?? '627';
    const accountLabel = detected?.accountLabel ?? 'Services bancaires et assimilés';
    const categoryName = opts.categoryName ?? detected?.categoryName ?? 'Frais bancaires';

    // Plafond de sécurité — franchissable seulement sur confirmation explicite.
    const ceiling = await this._bankFeeCeiling(tx0.bankAccountId);
    if (amountTtc > ceiling && !opts.allowOverCeiling)
      throw AppError.conflict(
        `Montant (${amountTtc.toLocaleString('fr-FR')}) supérieur au plafond de frais habituel (${ceiling.toLocaleString('fr-FR')}). Confirmez pour forcer.`,
        'FEE_AMOUNT_EXCEEDS_CEILING',
      );

    // TVA : agios/intérêts (671) exonérés ; services bancaires (627) peuvent porter
    // une TVA récupérable. Défaut 0 (sans TVA), surchargeable via opts.taxRate.
    const taxRate   = opts.taxRate ?? 0;
    const amountHt  = round2(amountTtc / (1 + taxRate / 100));
    const taxAmount = round2(amountTtc - amountHt);

    // Bureau (mono-entreprise) — même résolution que createExpense.
    const office = await this.prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } });
    if (!office) throw AppError.badRequest('Aucun bureau disponible');

    // Numéro de dépense atomique et sans trou — même fonction que le module dépenses.
    const [num] = await this.prisma.$queryRaw<[{ fn_next_document_number: string }]>`
      SELECT fn_next_document_number(${office.id}::uuid, 'expense'::"document_type")
    `;

    const feeResult = await this.prisma.$transaction(async (tx) => {
      // Catégorie (« Frais bancaires » / « Agios et intérêts bancaires ») résolue par
      // nom, créée au besoin avec son compte SYSCOHADA.
      let category = await tx.expenseCategory.findFirst({
        where:  { name: categoryName, deletedAt: null },
        select: { id: true },
      });
      if (!category) {
        category = await tx.expenseCategory.create({
          data: {
            name:                   categoryName,
            accountingAccount:      account,
            accountingAccountLabel: accountLabel,
            icon:                   'landmark',
            createdById:            userId,
          },
          select: { id: true },
        });
      }

      const now = new Date();
      const expense = await tx.expense.create({
        data: {
          number:            num.fn_next_document_number,
          officeId:          office.id,
          categoryId:        category.id,
          title:             tx0.label.slice(0, 500),
          description:       `Contrepartie automatique du mouvement bancaire du ${new Date(tx0.transactionDate).toLocaleDateString('fr-FR')}.`,
          expenseDate:       tx0.transactionDate,
          amountHt,
          taxRate,
          taxAmount,
          amountTtc,
          paidAmount:        amountTtc,
          paymentMethod:     'virement',
          status:            'paid',
          paidAt:            now,
          bankAccountId:     tx0.bankAccountId,
          accountingAccount: account,
          autoBankFee:       true,
          createdById:       userId,
          paidById:          userId,
          statusHistory: {
            create: [{ newStatus: 'paid', previousStatus: null, changedById: userId, reason: 'Contrepartie frais bancaires (auto)' }],
          },
        },
      });

      // Écriture SYSCOHADA (brouillon) : Dr 627/671 [+ 445x] / Cr 521 banque.
      await accountingEngine.onExpensePaid(expense.id, tx);

      // Lien + rapprochement de la transaction.
      await tx.expense.update({ where: { id: expense.id }, data: { bankTransactionId: transactionId } });
      const updatedTx = await tx.bankTransaction.update({
        where: { id: transactionId },
        data: {
          reconciliationStatus: 'reconciled',
          reconciledAt:         now,
          reconciledById:       userId,
          matchedEntityType:    'expense',
          matchedEntityId:      expense.id,
        },
      });

      return { expense, transaction: updatedTx };
    });

    // La transaction vient d'être rapprochée → compteurs de l'import à jour.
    await this._refreshImportCounters(tx0.importId);
    return feeResult;
  }

  // ── Réconciliation d'une transaction ────────────────────────────────────────

  /**
   * Lie la contrepartie métier (paiement / paiement fournisseur / dépense) à la
   * transaction bancaire, et renvoie le nombre de lignes effectivement liées.
   *
   * Le filtre `bankTransactionId: null` rend l'opération atomique : si la
   * contrepartie a déjà été rattachée à une autre transaction, on renvoie 0 et
   * l'appelant doit renoncer au rapprochement. C'est ce qui empêche un même
   * paiement d'être rapproché de deux mouvements bancaires distincts.
   */
  private async _linkMatchedEntity(
    tx: Prisma.TransactionClient,
    transactionId: string,
    entityType: string,
    entityId: string,
    reconciledAt: Date,
    userId?: string,
  ): Promise<number> {
    if (entityType === 'payment') {
      const r = await tx.payment.updateMany({
        where: { id: entityId, deletedAt: null, bankTransactionId: null },
        data:  { bankTransactionId: transactionId, reconciledAt, reconciledById: userId ?? undefined },
      });
      return r.count;
    }
    if (entityType === 'supplier_payment') {
      const r = await tx.supplierPayment.updateMany({
        where: { id: entityId, deletedAt: null, bankTransactionId: null },
        data:  { bankTransactionId: transactionId, reconciledAt, reconciledById: userId ?? undefined },
      });
      return r.count;
    }
    if (entityType === 'expense') {
      const r = await tx.expense.updateMany({
        where: { id: entityId, deletedAt: null, bankTransactionId: null },
        data:  { bankTransactionId: transactionId },
      });
      return r.count;
    }
    return 0;
  }

  async reconcileTransaction(id: string, data: ReconcileInput, userId?: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('Transaction introuvable');
    if (t.reconciliationStatus === 'reconciled') throw AppError.conflict('Transaction déjà rapprochée');

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const linked = await this._linkMatchedEntity(
        tx, id, data.matchedEntityType, data.matchedEntityId, now, userId,
      );
      if (linked === 0) {
        throw AppError.conflict(
          'Cette contrepartie est déjà rapprochée d’un autre mouvement bancaire (ou introuvable).',
        );
      }

      return tx.bankTransaction.update({
        where: { id },
        data: {
          reconciliationStatus: 'reconciled',
          reconciledAt:         now,
          reconciledById:       userId ?? undefined,
          matchedEntityType:    data.matchedEntityType,
          matchedEntityId:      data.matchedEntityId,
        },
      });
    });

    // Apprentissage automatique
    if (userId) {
      this.learnMatchingRule(id, data.matchedEntityType, data.matchedEntityId, userId).catch(() => {});
    }

    // Compteurs de l'import d'origine (nbMatched / nbUnmatched) tenus à jour.
    await this._refreshImportCounters(t.importId);

    return updated;
  }

  /**
   * Recalcule nbMatched / nbUnmatched d'un import à partir de l'état réel de ses
   * transactions. Idempotent, appelé après chaque changement de statut de
   * rapprochement — quel que soit le chemin (manuel, auto, dé-rapprochement).
   * Cosmétique : n'échoue jamais le rapprochement si la mise à jour rate.
   */
  private async _refreshImportCounters(importId: string | null | undefined): Promise<void> {
    if (!importId) return;
    try {
      const [matched, pending] = await Promise.all([
        this.prisma.bankTransaction.count({ where: { importId, reconciliationStatus: 'reconciled' } }),
        this.prisma.bankTransaction.count({ where: { importId, reconciliationStatus: 'pending' } }),
      ]);
      await this.prisma.bankStatementImport.updateMany({
        where: { id: importId },
        data:  { nbMatched: matched, nbUnmatched: pending },
      });
    } catch { /* compteur d'affichage — best-effort */ }
  }

  async unmatchTransaction(id: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('Transaction introuvable');

    // Réactivation d'une transaction ignorée : aucun lien à défaire, on la
    // repasse simplement « en attente ». (Le bouton « Réactiver » de l'UI passe
    // par ici ; il échouait auparavant faute de ce cas.)
    if (t.reconciliationStatus === 'ignored') {
      const res = await this.prisma.bankTransaction.update({
        where: { id },
        data:  { reconciliationStatus: 'pending' },
      });
      await this._refreshImportCounters(t.importId);
      return res;
    }
    if (t.reconciliationStatus !== 'reconciled') throw AppError.badRequest('Transaction non rapprochée');

    const result = await this.prisma.$transaction(async (tx) => {
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
        const linkedExpense = await tx.expense.findUnique({
          where:  { id: t.matchedEntityId },
          select: { id: true, autoBankFee: true },
        });
        if (linkedExpense?.autoBankFee) {
          // Contrepartie créée automatiquement : on la supprime entièrement, avec
          // son écriture comptable brouillon, plutôt que de laisser une dépense
          // orpheline. Les lignes d'écriture partent en cascade.
          await tx.journalEntry.deleteMany({
            where: { sourceType: 'expense', sourceId: linkedExpense.id, status: 'draft' },
          });
          await tx.expense.delete({ where: { id: linkedExpense.id } });
        } else {
          await tx.expense.updateMany({
            where: { id: t.matchedEntityId, bankTransactionId: id },
            data:  { bankTransactionId: null },
          });
        }
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

    await this._refreshImportCounters(t.importId);
    return result;
  }

  async ignoreTransaction(id: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('Transaction introuvable');
    // On n'ignore pas une transaction rapprochée : cela laisserait la contrepartie
    // (paiement/dépense) liée à un mouvement « ignoré » → lien orphelin. Il faut
    // d'abord la dé-rapprocher.
    if (t.reconciliationStatus === 'reconciled')
      throw AppError.conflict('Dé-rapprochez la transaction avant de l’ignorer.', 'RECONCILED_TRANSACTION');
    if (t.reconciliationStatus === 'ignored') return t; // déjà ignorée — idempotent
    const res = await this.prisma.bankTransaction.update({ where: { id }, data: { reconciliationStatus: 'ignored' } });
    await this._refreshImportCounters(t.importId);
    return res;
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
        orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
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

  /**
   * Soldes d'une session de rapprochement. Le solde SYSTÈME est recalculé à la
   * volée (solde d'ouverture du compte + mouvements jusqu'à la fin de période) et
   * non lu depuis le snapshot figé à l'ouverture — sinon un relevé importé après
   * l'ouverture le fausserait. Mutualisé par le rapport et la clôture.
   */
  private async _reconciliationBalances(
    client: Prisma.TransactionClient,
    r: { bankAccountId: string; periodStart: Date; periodEnd: Date; openingBalance: Prisma.Decimal | number },
  ) {
    const [reconciledTxns, account, movements] = await Promise.all([
      client.bankTransaction.findMany({
        where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'reconciled',
                 transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
        select: { type: true, amount: true },
      }),
      client.bankAccount.findUnique({ where: { id: r.bankAccountId }, select: { openingBalance: true } }),
      client.bankTransaction.groupBy({
        by:    ['type'],
        where: { bankAccountId: r.bankAccountId, transactionDate: { lte: r.periodEnd } },
        _sum:  { amount: true },
      }),
    ]);

    let totalCredits = 0, totalDebits = 0;
    for (const t of reconciledTxns) {
      if (t.type === 'credit') totalCredits += Number(t.amount);
      else totalDebits += Number(t.amount);
    }

    // Solde système recalculé à la fin de période (indépendant du snapshot)
    let sysCredits = 0, sysDebits = 0;
    for (const g of movements) {
      if (g.type === 'credit') sysCredits += Number(g._sum.amount ?? 0);
      else sysDebits += Number(g._sum.amount ?? 0);
    }
    const closingBalanceSystem    = Number(account?.openingBalance ?? 0) + sysCredits - sysDebits;
    const closingBalanceStatement = Number(r.openingBalance) + totalCredits - totalDebits;
    const gap                     = closingBalanceStatement - closingBalanceSystem;

    return {
      totalCredits, totalDebits,
      closingBalanceStatement, closingBalanceSystem, gap,
      isBalanced:      Math.abs(gap) < 1,
      reconciledCount: reconciledTxns.length,
    };
  }

  async getReconciliationReport(id: string) {
    const r = await this.prisma.bankReconciliation.findUnique({
      where:   { id },
      include: { bankAccount: { select: { id: true, name: true, currency: true } } },
    });
    if (!r) throw AppError.notFound('Session de rapprochement introuvable');

    const [bal, pendingCount, ignoredCount] = await Promise.all([
      this._reconciliationBalances(this.prisma, r),
      this.prisma.bankTransaction.count({
        where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'pending',
                 transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
      }),
      this.prisma.bankTransaction.count({
        where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'ignored',
                 transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
      }),
    ]);

    return {
      reconciliation:          r,
      openingBalance:          Number(r.openingBalance),
      totalCredits:            bal.totalCredits,
      totalDebits:             bal.totalDebits,
      closingBalanceStatement: bal.closingBalanceStatement,
      closingBalanceSystem:    bal.closingBalanceSystem,
      gap:                     bal.gap,
      isBalanced:              bal.isBalanced,
      reconciledCount:         bal.reconciledCount,
      pendingCount, ignoredCount,
    };
  }

  async completeReconciliation(id: string, userId: string, force = false) {
    const r = await this.prisma.bankReconciliation.findUnique({ where: { id } });
    if (!r) throw AppError.notFound('Session de rapprochement introuvable');
    if (r.status !== 'in_progress') throw AppError.badRequest('Session déjà clôturée');

    return this.prisma.$transaction(async (tx) => {
      const bal = await this._reconciliationBalances(tx, r);

      // Garde-fou : pas de clôture d'un rapprochement déséquilibré sans
      // confirmation explicite (le front rappelle avec force=true).
      if (!bal.isBalanced && !force) {
        throw AppError.conflict(
          `Le rapprochement n'est pas équilibré : écart de ${bal.gap.toLocaleString('fr-FR')} XAF ` +
          'entre le relevé et le système. Confirmez la clôture pour continuer malgré l\'écart.',
          'RECONCILIATION_UNBALANCED',
        );
      }

      const now = new Date();
      const [updated] = await Promise.all([
        tx.bankReconciliation.update({
          where: { id },
          data: {
            status:                  'completed',
            completedAt:             now,
            completedById:           userId,
            closingBalanceStatement: bal.closingBalanceStatement,
            closingBalanceSystem:    bal.closingBalanceSystem,
            isBalanced:              bal.isBalanced,
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

  // ── Nouveau pipeline import : DETECT → PREVIEW → CONFIRM ───────────────────

  // Plafond dur du nombre de lignes d'un relevé : au-delà, le previewData JSONB et
  // sa relecture en mémoire à la confirmation deviennent trop lourds. Le multer
  // limite déjà le fichier à 5 Mo ; ceci borne aussi le nombre de lignes.
  private static readonly MAX_IMPORT_ROWS = 10_000;

  /**
   * Contrôle de continuité du solde d'un relevé : pour deux lignes consécutives
   * portant chacune un solde après opération, vérifie que
   * `solde_préc + montant_signé ≈ solde_courant`. Une rupture signale une ligne
   * manquante/dupliquée ou un montant erroné. Retourne des avertissements lisibles
   * (jamais bloquant : on informe, on ne recale pas le solde à l'aveugle).
   */
  private _balanceContinuityWarnings(
    txns: Array<{ transactionDate: Date; amount: number; type: 'debit' | 'credit'; balanceAfter?: number | null; label?: string }>,
    max = 5,
  ): string[] {
    const warnings: string[] = [];
    for (let i = 1; i < txns.length && warnings.length < max; i++) {
      const prev = txns[i - 1]!, cur = txns[i]!;
      if (prev.balanceAfter == null || cur.balanceAfter == null) continue;
      const signed   = cur.type === 'credit' ? cur.amount : -cur.amount;
      const expected = Number(prev.balanceAfter) + signed;
      if (Math.abs(expected - Number(cur.balanceAfter)) > 0.01) {
        warnings.push(
          `Rupture de solde ligne ${i + 1} (${cur.label ?? ''}) : attendu ${expected.toLocaleString('fr-FR')}, relevé ${Number(cur.balanceAfter).toLocaleString('fr-FR')}.`,
        );
      }
    }
    return warnings;
  }

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
        confidenceScore: 95, needsMapping: false,
        headers: null, sampleRows: null, profileCandidates: [],
      };
    }

    const [override, dbProfiles] = await Promise.all([
      this.prisma.bankProfileOverride.findUnique({ where: { bankAccountId } }),
      this.prisma.bankImportProfile.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, source: true, columnMapping: true, dateFormat: true, numberFormat: true, delimiter: true, encoding: true, amountSign: true, directionValues: true, skipRowsContaining: true },
      }),
    ]);

    const extraProfiles = (dbProfiles as any[]).map(p => ({
      id:           p.id,
      name:         p.name,
      source:       p.source,
      columns:      p.columnMapping as any,
      dateFormat:   p.dateFormat,
      numberFormat: p.numberFormat as any,
      encoding:     p.encoding,
      delimiter:    p.delimiter,
      amountSign:   p.amountSign,
      directionValues: p.directionValues as any,
      skipRowsContaining: p.skipRowsContaining as any,
      _dbId:     p.id,
      _dbName:   p.name,
      _dbSource: p.source,
    })) as Array<BankProfile & { _dbId: string; _dbName: string; _dbSource: string }>;

    const fmt              = autoDetectFormat(content, override?.profileData ?? undefined, extraProfiles);
    const confidenceScore  = fmt.confidence;
    // Un override enregistré court-circuite le mapping manuel — SAUF si la confiance
    // s'effondre (< 40 %), signe que le fichier a changé de structure et que le
    // mapping mémorisé ne colle plus : on redemande alors un mapping plutôt que de
    // parser en silence avec un profil périmé (0 ligne ou lignes fausses).
    const needsMapping     = confidenceScore < 80 && (!override || confidenceScore < 40);

    this.logger.debug(`detectImportFormat: confidence=${confidenceScore}% needsMapping=${needsMapping} override=${override ? 'oui' : 'non'} profilesDB=${dbProfiles.length}`);

    return {
      format:            fileFormat,
      detectedBank:      fmt.profileName ?? null,
      confidence:        confidenceScore >= 80 ? 'high' : confidenceScore >= 50 ? 'medium' : 'low',
      confidenceScore,
      warnings:          [],
      needsMapping,
      headers:           fmt.headers ?? null,
      sampleRows:        fmt.sampleRows ?? null,
      profileCandidates: fmt.profileCandidates ?? [],
      detectedMapping:   { ...fmt, fileFormat, needsMapping },
    };
  }

  async previewImport(
    fileBuffer: Buffer,
    bankAccountId: string,
    filename: string,
    encodingHint?: DetectFormatInput['encoding'],
    formatOverride?: DetectedFormat,
    columnMappingOverride?: object,
  ): Promise<{ importId: string; rows: any[]; totalRows: number; skippedRows: number; duplicates: number; parseErrors: Array<{ row: number; message: string }>; periodStart: string | null; periodEnd: string | null; format: any; detectedBank: string | null; balanceWarnings: string[] }> {
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

    // Si l'utilisateur a mappé les colonnes manuellement dans le ColumnMapper,
    // on construit le formatOverride AVANT de parser — sinon parseStatementFile
    // utilise l'auto-détection et produit 0 lignes pour un format inconnu.
    let resolvedFormatOverride: DetectedFormat | undefined = formatOverride ?? (dbOverride?.profileData as unknown as DetectedFormat | undefined) ?? undefined;

    if (columnMappingOverride && typeof columnMappingOverride === 'object') {
      const cm = columnMappingOverride as any;
      resolvedFormatOverride = {
        profileId:    null,
        profileName:  'Mapping manuel',
        delimiter:    cm.delimiter    ?? ';',
        encoding:     cm.encoding     ?? encodingHint ?? 'utf-8',
        dateFormat:   cm.dateFormat   ?? 'DD/MM/YYYY',
        numberFormat: cm.numberFormat ?? { thousands: ' ', decimal: ',' },
        columnMapping: {
          date:         cm.columnMapping?.date         ?? '',
          label:        cm.columnMapping?.label        ?? '',
          debit:        cm.columnMapping?.debit,
          credit:       cm.columnMapping?.credit,
          amount:       cm.columnMapping?.amount,
          direction:    cm.columnMapping?.direction,
          reference:    cm.columnMapping?.reference,
          balanceAfter: cm.columnMapping?.balanceAfter,
          valueDate:    cm.columnMapping?.valueDate,
        },
        headerRow: cm.headerRow ?? 0,
        confidence: 100,
        source: 'user' as const,
      };
    }

    const result = parseStatementFile(
      fileBuffer, filename, bankAccountId,
      resolvedFormatOverride,
      encodingHint ?? 'auto',
    );

    // Plafond dur : au-delà, refuser plutôt que de stocker un previewData énorme.
    const totalParsed = result.transactions.length + result.errors.length;
    if (totalParsed > BankService.MAX_IMPORT_ROWS)
      throw AppError.badRequest(
        `Relevé trop volumineux (${totalParsed} lignes, maximum ${BankService.MAX_IMPORT_ROWS}). Découpez-le par période.`,
        'IMPORT_TOO_LARGE',
      );

    const uniqueTxns    = result.transactions.filter(t => !hashSet.has(t.contentHash));
    const duplicateRows = result.transactions.length - uniqueTxns.length;

    // Contrôle de cohérence du solde du relevé (ordre du fichier conservé).
    const balanceWarnings = this._balanceContinuityWarnings(result.transactions as any);

    let detectedFormat: DetectedFormat = resolvedFormatOverride ?? result.detectedFormat ?? {
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

    // Purge des prévisualisations non confirmées de ce compte : sans cela, chaque
    // preview (remapping, réessai) laissait un import « pending » orphelin en base.
    await this.prisma.bankStatementImport.deleteMany({ where: { bankAccountId, status: 'pending' } });

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

    this.logger.debug(`previewImport: ${result.transactions.length} transactions, ${result.errors.length} erreurs, ${duplicateRows} doublons`);

    return {
      importId:    importRecord.id,
      rows:        uniqueTxns.map((t: any) => ({
        date:      t.transactionDate instanceof Date ? t.transactionDate.toISOString().split('T')[0] : t.transactionDate,
        label:     t.label,
        debit:     t.type === 'debit'  ? t.amount : null,
        credit:    t.type === 'credit' ? t.amount : null,
        balance:   t.balanceAfter ?? null,
        reference: t.reference   ?? null,
      })),
      totalRows:   preview.totalRows   ?? 0,
      skippedRows: preview.errorRows   ?? 0,
      duplicates:  duplicateRows,
      parseErrors: result.errors.slice(0, 5),
      periodStart: preview.dateRange.min ? (preview.dateRange.min as Date).toISOString().split('T')[0] : null,
      periodEnd:   preview.dateRange.max ? (preview.dateRange.max as Date).toISOString().split('T')[0] : null,
      format:      (result.fileFormat === 'unknown' ? 'csv' : result.fileFormat) as any,
      detectedBank: detectedFormat.profileName ?? null,
      balanceWarnings,
    };
  }

  async confirmImport(importId: string, userId: string): Promise<{
    nbImported: number; nbSkipped: number; nbDuplicates: number; status: string; jobId?: string;
  }> {
    const importRecord = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!importRecord) throw AppError.notFound('Import introuvable');
    if (importRecord.status !== 'pending') throw AppError.conflict('Cet import a déjà été traité');

    // Compteur d'usage du profil partagé réellement utilisé pour cet import (au lieu
    // de dépendre d'un appel séparé côté front, facile à oublier). Un profileId en
    // UUID désigne un profil de la base (les profils intégrés ont un id textuel).
    const usedProfileId = (importRecord.detectedFormat as any)?.profileId;
    if (typeof usedProfileId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usedProfileId)) {
      await this.prisma.bankImportProfile.updateMany({
        where: { id: usedProfileId, deletedAt: null },
        data:  { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      }).catch(() => { /* compteur best-effort */ });
    }

    const preview = importRecord.previewData as unknown as ImportPreview;
    if (!preview) throw AppError.badRequest('Données de prévisualisation manquantes — relancez la phase PREVIEW');

    const existingHashes = await this.prisma.bankTransaction.findMany({
      where:  { bankAccountId: importRecord.bankAccountId, contentHash: { not: null } },
      select: { contentHash: true },
    });
    const hashSet = new Set(existingHashes.map(h => h.contentHash!));

    // Déduplication en DEUX temps :
    //   1. contre la base (lignes déjà importées) ;
    //   2. À L'INTÉRIEUR DU FICHIER lui-même.
    // Le point 2 est indispensable au solde : `createMany({ skipDuplicates: true })`
    // écarte silencieusement les lignes de même empreinte, si bien que le nombre de
    // lignes créées est inférieur au nombre de lignes soumises. Calculer le delta de
    // solde sur les lignes soumises créait des mouvements fantômes — constaté sur un
    // relevé contenant trois retraits identiques : 1 transaction créée, 3 comptées
    // au solde, soit 10 000 XAF de dérive.
    const seenHashes   = new Set<string>();
    const transactions = preview.sampleTransactions.filter((t) => {
      if (hashSet.has(t.contentHash) || seenHashes.has(t.contentHash)) return false;
      seenHashes.add(t.contentHash);
      return true;
    });
    const nbDuplicates = preview.duplicateRows;

    // `previewData` transite par une colonne JSONB : les Date en reviennent sous
    // forme de chaînes ISO. Sans cette re-normalisation, la branche asynchrone
    // (> 200 lignes) plantait sur `t.transactionDate.toISOString is not a function`,
    // rendant tout relevé de plus de 200 lignes impossible à importer.
    const asDate = (v: Date | string | null | undefined): Date | undefined =>
      v == null ? undefined : (v instanceof Date ? v : new Date(v));

    if (transactions.length === 0) {
      await this.prisma.bankStatementImport.update({
        where: { id: importId },
        data:  { status: 'completed', processedAt: new Date(), importedById: userId, nbTransactions: 0 },
      });
      return { nbImported: 0, nbSkipped: preview.errorRows, nbDuplicates, status: 'completed' };
    }

    // Async si > 200 lignes.
    // On ne fait PAS transiter les lignes par Redis : elles sont déjà persistées dans
    // `previewData` (colonne JSONB de l'import). Le worker les relit depuis la base à
    // partir de l'`importId` — évite un payload de job de plusieurs Mo (les lignes
    // transitaient sinon 3 fois : parse → previewData → Redis → worker).
    if (transactions.length > 200) {
      const job = await this.bankImportQueue.add('process', {
        importId, bankAccountId: importRecord.bankAccountId, userId,
      });

      await this.prisma.bankStatementImport.update({
        where: { id: importId },
        data:  { status: 'processing', jobId: job.id ?? null, importedById: userId },
      });

      // Apprentissage de l'override : le parsing a réussi (preview OK), on marque le
      // mapping du compte comme vérifié — comme le fait le chemin synchrone. Sans ça,
      // les gros relevés (> 200 lignes, async) n'apprenaient jamais leur format.
      await this.prisma.bankProfileOverride.updateMany({
        where: { bankAccountId: importRecord.bankAccountId },
        data:  { verifiedCount: { increment: 1 }, isVerified: true },
      });

      return { nbImported: 0, nbSkipped: preview.errorRows, nbDuplicates, status: 'processing', jobId: job.id };
    }

    // Sync si ≤ 200 lignes
    return this.prisma.$transaction(async (tx) => {
      // Verrou consultatif PAR COMPTE : sérialise les confirmations concurrentes sur
      // le même compte. Sans lui, deux imports au périmètre chevauchant confirmés en
      // même temps voyaient chacun `fresh` vide, puis `createMany({ skipDuplicates })`
      // n'en créait qu'un jeu — mais le delta de solde, calculé sur `toCreate`, était
      // compté DEUX fois → dérive. Sous le verrou, aucune insertion concurrente entre
      // la lecture `fresh` et le `createMany` : toCreate == lignes réellement créées.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${importRecord.bankAccountId}))`;

      // Re-dédup DANS la transaction, contre l'état courant de la base.
      const fresh   = await tx.bankTransaction.findMany({
        where:  { bankAccountId: importRecord.bankAccountId, contentHash: { in: transactions.map(t => t.contentHash) } },
        select: { contentHash: true },
      });
      const freshSet = new Set(fresh.map(f => f.contentHash!));
      const toCreate = transactions.filter(t => !freshSet.has(t.contentHash));

      const created = await tx.bankTransaction.createMany({
        data: toCreate.map(t => ({
          bankAccountId:   importRecord.bankAccountId,
          transactionDate: asDate(t.transactionDate)!,
          valueDate:       asDate(t.valueDate),
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

      const delta = toCreate.reduce((acc, t) => acc + (t.type === 'credit' ? t.amount : -t.amount), 0);

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

  async rollbackImport(importId: string): Promise<{ deleted: number; kept: number }> {
    const importRecord = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!importRecord) throw AppError.notFound('Import introuvable');

    if (importRecord.status === 'pending') {
      await this.prisma.bankStatementImport.delete({ where: { id: importId } });
      return { deleted: 0, kept: 0 };
    }
    // On autorise l'annulation d'un import `completed`, mais aussi `failed` et
    // `processing` : un worker qui a planté peut laisser un import « zombie » avec
    // des transactions déjà créées mais un statut non finalisé. Sans ce cas, l'import
    // restait ni annulable ni rejouable. `cancelled` est déjà annulé.
    if (!['completed', 'failed', 'processing'].includes(importRecord.status))
      throw AppError.conflict('Cet import ne peut pas être annulé dans son état actuel.');

    // Pour un import encore en file/actif : retirer le job pour stopper les insertions
    // à venir (best-effort — un lot déjà en cours peut se terminer, le nettoyage
    // ci-dessous s'en charge).
    if (importRecord.status === 'processing' && importRecord.jobId) {
      try {
        const job = await this.bankImportQueue.getJob(importRecord.jobId);
        await job?.remove();
      } catch { /* job déjà terminé/retiré */ }
    }

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
      // Les transactions déjà rapprochées ne sont PAS supprimées (on ne casse pas un
      // rapprochement) : on les recense pour que l'appelant informe l'utilisateur.
      const kept = await tx.bankTransaction.count({ where: { importId } });
      await tx.bankStatementImport.update({ where: { id: importId }, data: { status: 'cancelled' } });
      return { deleted: deleted.count, kept };
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

  async listImports(page = 1, limit = 20) {
    // On n'affiche pas les imports « pending » : ce sont des prévisualisations non
    // confirmées (souvent abandonnées ou remplacées), pas des imports réels.
    const where = { status: { not: 'pending' as const } };
    const [data, total] = await Promise.all([
      this.prisma.bankStatementImport.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { importedAt: 'desc' },
        include: { bankAccount: { select: { id: true, name: true } } },
      }),
      this.prisma.bankStatementImport.count({ where }),
    ]);
    return { data, total };
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

    // Sens du mouvement : un crédit (entrée) ne se compose que d'encaissements
    // clients ; un débit (sortie) que de dépenses / paiements fournisseurs. On ne
    // mélange jamais les deux (une somme « paiement client + dépense » n'a aucun
    // sens comptable) — même règle que getSuggestions.
    const isCredit = t.type === 'credit';
    const candidates: SubsetCandidate[] = isCredit
      ? payments.map(p => ({ id: `payment:${p.id}`, amount: Number(p.amount), label: p.reference ?? '', date: p.paymentDate }))
      : [
          ...supplierPayments.map(s => ({ id: `supplier_payment:${s.id}`, amount: Number(s.amount),    label: s.reference ?? '', date: s.paymentDate })),
          ...expenses.map(e         => ({ id: `expense:${e.id}`,          amount: Number(e.amountTtc), label: e.title,           date: e.expenseDate })),
        ];

    const matches = subsetSum(candidates, amount, tolerance, 6, 5);
    return { transaction: t, candidates: candidates.length, matches };
  }

  // ── Auto-match Hungarian ────────────────────────────────────────────────────

  /**
   * Rapprochement automatique d'une session.
   *
   * Applique uniquement les correspondances à haute confiance (≥ 90 %) et renvoie
   * les 70–89 % comme suggestions à confirmer. L'ancien paramètre
   * `highConfidenceOnly` a été retiré : son défaut était inversé (un appel sans
   * corps activait le mode étendu, qui appliquait automatiquement les 70 %).
   */
  async getAutoMatchBatch(reconciliationId: string, userId?: string) {
    const r = await this.prisma.bankReconciliation.findUnique({ where: { id: reconciliationId } });
    if (!r) throw AppError.notFound('Session de rapprochement introuvable');

    const pendingTxns = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'pending',
               transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
    });
    // Forme de réponse STABLE sur tous les chemins de sortie. Les sorties anticipées
    // renvoyaient `{ applied, suggestions }` — une clé qui n'existe nulle part
    // ailleurs — au lieu de `{ applied, skipped, high, medium }`. Le client recevait
    // donc un objet aux champs absents selon qu'il y avait ou non des candidats.
    const emptyResult = () => ({ applied: 0, skipped: [], high: [], medium: [] });

    if (pendingTxns.length === 0) return emptyResult();

    const [payments, supplierPayments, expenses] = await Promise.all([
      this.prisma.payment.findMany({
        where:   { deletedAt: null, bankTransactionId: null, paymentDate: { gte: r.periodStart, lte: r.periodEnd } },
        include: { invoice: { select: { number: true, client: { select: { name: true } } } } },
        take: 100,
      }),
      this.prisma.supplierPayment.findMany({
        where:   { deletedAt: null, bankTransactionId: null, paymentDate: { gte: r.periodStart, lte: r.periodEnd } },
        include: { supplierInvoice: { select: { supplierInvoiceNumber: true, supplier: { select: { name: true } } } } },
        take: 100,
      }),
      this.prisma.expense.findMany({
        where:   { deletedAt: null, bankTransactionId: null, expenseDate: { gte: r.periodStart, lte: r.periodEnd } },
        include: { supplier: { select: { name: true } } },
        take: 100,
      }),
    ]);

    type Candidate = { entityType: string; entityId: string; amount: number; date: Date; label: string; party?: string | null; docNumber?: string | null };
    const candidates: Candidate[] = [
      ...payments.map(p        => ({ entityType: 'payment',          entityId: p.id, amount: Number(p.amount),    date: p.paymentDate, label: '',      party: p.invoice?.client?.name,             docNumber: p.invoice?.number })),
      ...supplierPayments.map(s => ({ entityType: 'supplier_payment', entityId: s.id, amount: Number(s.amount),   date: s.paymentDate, label: '',      party: s.supplierInvoice?.supplier?.name,   docNumber: s.supplierInvoice?.supplierInvoiceNumber })),
      ...expenses.map(e         => ({ entityType: 'expense',          entityId: e.id, amount: Number(e.amountTtc), date: e.expenseDate, label: e.title, party: e.beneficiaryName ?? e.supplier?.name, docNumber: e.number })),
    ];
    if (candidates.length === 0) return emptyResult();

    // Règles apprises/manuelles applicables (compte + globales) — désormais prises
    // en compte dans l'auto-match, pas seulement dans les suggestions interactives.
    const rules = await this._activeRulesForAccount(r.bankAccountId);

    const costMatrix = pendingTxns.map(tx =>
      candidates.map(c => {
        const detail = computeScore({ entityAmount: c.amount, entityDate: c.date, entityLabel: c.label,
                                      entityParty: c.party, entityDocNumber: c.docNumber,
                                      txAmount: Number(tx.amount), txDate: tx.transactionDate, txLabel: tx.label,
                                      ruleBonus: this._firingRule(rules, tx.label, Number(tx.amount), c.entityType, c.entityId)?.bonus ?? 0 });
        return 100 - detail.total;
      })
    );

    const assignment = hungarian(costMatrix);

    // Auto-application = seuil de confiance ET marge de sécurité. Le meilleur
    // candidat doit non seulement dépasser 90 %, mais DEVANCER NETTEMENT le 2e
    // meilleur candidat de la MÊME transaction. Sinon (deux paiements de même
    // montant/date), le choix est ambigu → on le renvoie « à confirmer » plutôt
    // que de risquer un faux positif comptable.
    const AUTO_MATCH_MIN_SCORE = 90;
    const AUTO_MATCH_MARGIN    = 8;
    // Une règle « application auto » (isAutoApply) de confiance abaisse le seuil
    // d'auto-application à 75 % — sans jamais lever l'exigence de marge (le choix
    // doit rester non ambigu). C'est ce qui donne enfin un effet au drapeau.
    const AUTO_APPLY_RULE_MIN  = 75;

    const high: Array<{ txId: string; entityType: string; entityId: string; score: number; margin?: number; ruleId?: string }> = [];
    const medium: typeof high = [];

    for (let i = 0; i < pendingTxns.length; i++) {
      const j = assignment[i];
      if (j === undefined || j < 0 || j >= candidates.length) continue;
      const tx = pendingTxns[i]!;
      const c  = candidates[j]!;
      const score = computeScore({ entityAmount: c.amount, entityDate: c.date, entityLabel: c.label,
                                   entityParty: c.party, entityDocNumber: c.docNumber,
                                   txAmount: Number(tx.amount), txDate: tx.transactionDate, txLabel: tx.label,
                                   ruleBonus: this._firingRule(rules, tx.label, Number(tx.amount), c.entityType, c.entityId)?.bonus ?? 0 }).total;

      // 2e meilleur score parmi les AUTRES candidats de cette transaction
      const rowScores  = costMatrix[i]!.map(cost => 100 - cost);
      const secondBest = rowScores.reduce((max, s, k) => (k !== j && s > max ? s : max), 0);
      const margin     = Math.round(score - secondBest);

      // Règle qui se déclenche pour ce couple (pour le compteur d'usage) et, le
      // cas échéant, règle « auto-apply » qui autorise l'application dès 75 %.
      const firing    = this._firingRule(rules, tx.label, Number(tx.amount), c.entityType, c.entityId);
      const autoApply = this._firingRule(rules, tx.label, Number(tx.amount), c.entityType, c.entityId, { autoApplyOnly: true });

      const item = { txId: tx.id, entityType: c.entityType, entityId: c.entityId, score, margin, ruleId: firing?.ruleId };
      const passesStandard = score >= AUTO_MATCH_MIN_SCORE && margin >= AUTO_MATCH_MARGIN;
      const passesRule     = !!autoApply && score >= AUTO_APPLY_RULE_MIN && margin >= AUTO_MATCH_MARGIN;
      if (passesStandard || passesRule) {
        high.push(item);          // clairement LE meilleur (ou règle auto-apply) → appliqué
      } else if (score >= 70) {
        medium.push(item);        // bon mais ambigu (marge faible) ou moyen → à confirmer
      }
    }

    // Seule la haute confiance (≥ 90 %) est appliquée automatiquement : montant
    // exact + même jour + libellé concordant. Les 70–89 % sont RENVOYÉES comme
    // suggestions à confirmer, jamais appliquées : 70 points, c'est typiquement
    // « bon montant (45) + date à ±2 j (22) + vague écho de libellé (3) ». Avec
    // plusieurs paiements du même montant dans la semaine — acomptes, abonnements —
    // le choix relève du tirage au sort, ce qui est inacceptable en comptabilité.
    const toApply = high;

    // On lie la contrepartie AVANT de marquer la transaction rapprochée, et on
    // renonce si la liaison échoue. Auparavant seule la transaction bancaire était
    // mise à jour : le paiement gardait `bankTransactionId: null`, restait donc
    // candidat pour d'autres mouvements (les requêtes filtrent là-dessus) et
    // pouvait être rapproché plusieurs fois. `unmatchTransaction` ne le nettoyait
    // pas non plus, faute de lien.
    let applied = 0;
    const skipped: Array<{ txId: string; entityType: string; entityId: string; reason: string }> = [];
    const appliedTxIds: string[] = [];

    if (toApply.length > 0) {
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        for (const m of toApply) {
          const linked = await this._linkMatchedEntity(tx, m.txId, m.entityType, m.entityId, now, userId);
          if (linked === 0) {
            skipped.push({ ...m, reason: 'contrepartie déjà rapprochée' });
            continue;
          }
          await tx.bankTransaction.update({
            where: { id: m.txId },
            data:  { reconciliationStatus: 'reconciled', reconciledAt: now,
                     reconciledById: userId ?? undefined,
                     matchedEntityType: m.entityType, matchedEntityId: m.entityId },
          });
          // Compteur d'usage réel de la règle ayant contribué à ce rapprochement.
          if (m.ruleId) {
            await tx.bankMatchingRule.update({
              where: { id: m.ruleId },
              data:  { usageCount: { increment: 1 } },
            });
          }
          applied++;
          appliedTxIds.push(m.txId);
        }
      });
    }

    // Compteurs nbMatched/nbUnmatched des imports concernés par ce lot.
    if (appliedTxIds.length > 0) {
      const rows = await this.prisma.bankTransaction.findMany({
        where:  { id: { in: appliedTxIds }, importId: { not: null } },
        select: { importId: true },
      });
      const importIds = [...new Set(rows.map(r => r.importId!))];
      for (const impId of importIds) await this._refreshImportCounters(impId);
    }

    // `high`   : appliquées (déduire `skipped` pour les contreparties déjà liées)
    // `medium` : NON appliquées — suggestions 70–89 % à confirmer manuellement
    return { applied, skipped, high, medium };
  }

  // ── Apprentissage automatique ────────────────────────────────────────────────

  async learnMatchingRule(transactionId: string, entityType: string, entityId: string, userId: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!t) return;

    const tokens = t.label.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
    if (tokens.length === 0) return;

    const labelContains = tokens.sort((a, b) => b.length - a.length)[0]!.slice(0, 255);
    const amount = Number(t.amount);
    const loBand = amount * 0.9;
    const hiBand = amount * 1.1;

    const existing = await this.prisma.bankMatchingRule.findFirst({
      where: { bankAccountId: t.bankAccountId, labelContains, entityType },
    });

    if (existing) {
      // On ÉLARGIT la plage de montants (min des min / max des max) au lieu de la
      // remplacer : un tiers à montant variable garde une fourchette cohérente.
      const newMin = Math.min(existing.amountMin != null ? Number(existing.amountMin) : loBand, loBand);
      const newMax = Math.max(existing.amountMax != null ? Number(existing.amountMax) : hiBand, hiBand);
      await this.prisma.bankMatchingRule.update({
        where: { id: existing.id },
        data:  { confidence: { increment: 1 }, entityId, amountMin: newMin, amountMax: newMax },
      });
    } else {
      // La contrainte unique (compte + libellé + type) rend l'opération sûre face
      // aux rapprochements concurrents : en cas de course, le create échoue en
      // P2002 et l'on renforce la règle déjà créée par l'autre transaction.
      try {
        await this.prisma.bankMatchingRule.create({
          data: {
            bankAccountId: t.bankAccountId,
            labelContains, entityType, entityId,
            amountMin: loBand, amountMax: hiBand,
            confidence: 1, isActive: true, isAutoApply: false,
            createdById: userId,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          await this.prisma.bankMatchingRule.updateMany({
            where: { bankAccountId: t.bankAccountId, labelContains, entityType },
            data:  { confidence: { increment: 1 }, entityId },
          });
        } else throw e;
      }
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
    bankAccountId?: string | null; labelContains: string; entityType: string;
    entityId?: string | null; category?: string | null; amountMin?: number | null; amountMax?: number | null; autoApply?: boolean;
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
        isAutoApply:   data.autoApply  ?? false,
        // Une règle créée à la main est fiable d'emblée : elle démarre au seuil de
        // confiance, sinon elle n'aurait aucun effet avant 3 renforts.
        confidence:    BankService.RULE_TRUST_THRESHOLD, createdById: userId,
      },
    });
  }

  async updateMatchingRule(id: string, data: {
    bankAccountId?: string | null; labelContains?: string; entityType?: string;
    entityId?: string | null; category?: string | null; amountMin?: number | null; amountMax?: number | null;
    autoApply?: boolean; isActive?: boolean;
  }) {
    // Allow-list : `autoApply` (API) -> `isAutoApply` (colonne). On ne passe à
    // Prisma que des champs réellement présents sur le modèle.
    const d: Prisma.BankMatchingRuleUpdateInput = {};
    if (data.labelContains !== undefined) d.labelContains = data.labelContains;
    if (data.entityType    !== undefined) d.entityType    = data.entityType;
    if (data.entityId      !== undefined) d.entityId      = data.entityId ?? null;
    if (data.category      !== undefined) d.category      = data.category ?? null;
    if (data.amountMin     !== undefined) d.amountMin     = data.amountMin ?? null;
    if (data.amountMax     !== undefined) d.amountMax     = data.amountMax ?? null;
    if (data.autoApply     !== undefined) d.isAutoApply   = data.autoApply;
    if (data.isActive      !== undefined) d.isActive      = data.isActive;
    return this.prisma.bankMatchingRule.update({ where: { id }, data: d });
  }

  async deleteMatchingRule(id: string) {
    return this.prisma.bankMatchingRule.update({ where: { id }, data: { isActive: false } });
  }

  // ── Profils d'import partagés ────────────────────────────────────────────────

  async listImportProfiles(userId?: string) {
    // Visibilité : un profil est visible s'il est public OU s'il appartient au
    // demandeur. Sans ce filtre, le champ `isPublic` était mort (tout le monde
    // voyait tout). Sans userId (contexte système), on ne rend que les publics.
    return this.prisma.bankImportProfile.findMany({
      where: {
        deletedAt: null,
        OR: [
          { isPublic: true },
          ...(userId ? [{ createdById: userId }] : []),
        ],
      },
      orderBy: [{ source: 'asc' }, { name: 'asc' }],
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async getImportProfileById(id: string, userId?: string) {
    const profile = await this.prisma.bankImportProfile.findFirst({
      where: { id, deletedAt: null },
    });
    // Même règle de visibilité que la liste : on ne divulgue pas un profil privé
    // d'autrui (on renvoie « introuvable » pour ne pas révéler son existence).
    if (!profile || (!profile.isPublic && userId && profile.createdById !== userId)) {
      throw AppError.notFound('Profil d\'import introuvable');
    }
    return profile;
  }

  async createImportProfile(data: {
    name: string; bankName?: string; country?: string;
    fileFormat?: string; encoding?: string; delimiter?: string;
    dateFormat?: string; numberFormat: object; columnMapping: object;
    directionValues?: object; amountSign?: string;
    skipRowsContaining?: string[]; skipFirstRows?: number; isPublic?: boolean; notes?: string;
  }, userId: string) {
    // Unicité du nom (parmi les profils vivants) : évite deux profils homonymes
    // impossibles à distinguer dans la liste de sélection.
    const clash = await this.prisma.bankImportProfile.findFirst({
      where:  { name: data.name, deletedAt: null },
      select: { id: true },
    });
    if (clash) throw AppError.conflict(`Un profil d'import nommé « ${data.name} » existe déjà.`, 'PROFILE_NAME_TAKEN');

    return this.prisma.bankImportProfile.create({
      data: {
        name:               data.name,
        bankName:           data.bankName           ?? undefined,
        country:            data.country            ?? undefined,
        source:             'user',
        fileFormat:         data.fileFormat          ?? 'csv',
        encoding:           data.encoding            ?? 'utf-8',
        delimiter:          data.delimiter           ?? ';',
        dateFormat:         data.dateFormat          ?? 'DD/MM/YYYY',
        numberFormat:       data.numberFormat,
        columnMapping:      data.columnMapping,
        directionValues:    data.directionValues     ?? undefined,
        amountSign:         data.amountSign          ?? undefined,
        skipRowsContaining: data.skipRowsContaining  ?? undefined,
        skipFirstRows:      data.skipFirstRows        ?? 0,
        isPublic:           data.isPublic             ?? false,
        notes:              data.notes               ?? undefined,
        createdById:        userId,
      },
    });
  }

  async updateImportProfile(id: string, data: Partial<{
    name: string; bankName: string; country: string;
    fileFormat: string; encoding: string; delimiter: string;
    dateFormat: string; numberFormat: object; columnMapping: object;
    directionValues: object; amountSign: string;
    skipRowsContaining: string[]; skipFirstRows: number; isPublic: boolean; notes: string;
  }>) {
    const profile = await this.prisma.bankImportProfile.findFirst({ where: { id, deletedAt: null } });
    if (!profile) throw AppError.notFound('Profil d\'import introuvable');
    if (data.name && data.name !== profile.name) {
      const clash = await this.prisma.bankImportProfile.findFirst({
        where:  { name: data.name, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (clash) throw AppError.conflict(`Un profil d'import nommé « ${data.name} » existe déjà.`, 'PROFILE_NAME_TAKEN');
    }
    return this.prisma.bankImportProfile.update({ where: { id }, data });
  }

  async deleteImportProfile(id: string) {
    const profile = await this.prisma.bankImportProfile.findFirst({ where: { id, deletedAt: null } });
    if (!profile) throw AppError.notFound('Profil d\'import introuvable');
    await this.prisma.bankImportProfile.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async incrementImportProfileUsage(id: string) {
    await this.prisma.bankImportProfile.updateMany({
      where: { id, deletedAt: null },
      data:  { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }
}
