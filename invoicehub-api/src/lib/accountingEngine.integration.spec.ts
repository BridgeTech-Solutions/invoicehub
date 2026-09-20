/**
 * Batterie de tests du MOTEUR COMPTABLE (accountingEngine) — exécutés contre une
 * VRAIE base PostgreSQL, chaque scénario dans une transaction annulée (rollback).
 *
 * Pourquoi le rollback plutôt qu'un nettoyage : le moteur crée des écritures, des
 * séquences de numérotation, des codes de lettrage et s'appuie sur des verrous
 * consultatifs + des triggers d'immuabilité. Une transaction annulée garantit une
 * isolation totale SANS rien persister ni rien supprimer en base.
 *
 * Deux familles :
 *  1. « Golden » : entrée connue → lignes d'écriture attendues (comptes + montants).
 *  2. Invariants : propriétés vraies pour TOUTE écriture (équilibre, annulation nette
 *     nulle, idempotence, pas de double comptage acompte/solde, lettrage).
 *
 * La suite s'auto-désactive si DATABASE_URL est absent (CI sans base).
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  onInvoiceIssued, onInvoiceCancelled, onPaymentReceived, onPaymentDeleted,
} from './accountingEngine';

// ── Chargement de .env (le projet n'embarque pas dotenv en dépendance directe) ──
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const RUN = !!process.env['DATABASE_URL'];
const TVA = 19.25;
const r2  = (n: number) => Math.round(n * 100) / 100;

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

(RUN ? describe : describe.skip)('accountingEngine — moteur comptable (PostgreSQL réel)', () => {
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);

  let officeId: string;
  let userId:   string;
  let entryDate: Date;
  // Comptes réellement configurés en base (on teste le ROUTAGE, pas des numéros en dur)
  let S: {
    collectedTaxAccount: string; deductibleTaxAccount: string; pendingTvaAccount: string;
    defaultClientAccount: string; defaultSalesGoodsAccount: string; defaultSalesServiceAccount: string;
    defaultBankAccount: string;
  };

  let seq = 0;
  const nextNo = (p: string) => `__T_${RUN_ID}__${p}_${++seq}`;

  beforeAll(async () => {
    await prisma.$connect();
    userId   = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id;
    officeId = (await prisma.agencyOffice.findFirstOrThrow({ select: { id: true } })).id;

    const period = await prisma.fiscalPeriod.findFirst({ where: { status: 'open' }, orderBy: { startDate: 'asc' } });
    if (!period) throw new Error('Aucune période comptable ouverte — impossible de tester le moteur.');
    entryDate = new Date(period.startDate);

    const cs = await prisma.companySettings.findFirstOrThrow();
    S = {
      collectedTaxAccount:        cs.collectedTaxAccount,
      deductibleTaxAccount:       cs.deductibleTaxAccount,
      pendingTvaAccount:          (cs as any).pendingTvaAccount ?? '4438',
      defaultClientAccount:       cs.defaultClientAccount,
      defaultSalesGoodsAccount:   cs.defaultSalesGoodsAccount,
      defaultSalesServiceAccount: cs.defaultSalesServiceAccount,
      defaultBankAccount:         cs.defaultBankAccount,
    };
  });

  afterAll(async () => { await prisma.$disconnect(); });

  // ── Harnais rollback : exécute fn dans une transaction TOUJOURS annulée ────────
  class Rollback extends Error {}
  async function inRollback(fn: (tx: Tx) => Promise<void>): Promise<void> {
    let captured: unknown;
    try {
      await prisma.$transaction(async (tx) => {
        try { await fn(tx); } catch (e) { captured = e; }
        throw new Rollback(); // annule TOUT ce que fn a écrit
      }, { timeout: 30_000, maxWait: 10_000 });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e; // erreur d'infra transaction
    }
    if (captured) throw captured; // remonte l'échec d'assertion / du moteur
  }

  // ── Builders (dans la transaction) ─────────────────────────────────────────────
  async function mkClient(tx: Tx, name = 'Client Test'): Promise<string> {
    const c = await tx.client.create({ data: { name: `${name} ${RUN_ID}`, type: 'company', city: 'Douala', createdById: userId } });
    return c.id;
  }

  interface LineSpec { ht: number; productId?: string | null; }
  async function mkInvoice(tx: Tx, opts: {
    clientId: string; lines: LineSpec[]; type?: string; status?: string;
    parentInvoiceId?: string | null; totalTtcOverride?: number;
  }): Promise<{ id: string; totalTtc: number; totalHt: number; totalTax: number }> {
    const built = opts.lines.map((l, i) => {
      const subtotalHt = r2(l.ht);
      const taxAmount  = r2(subtotalHt * TVA / 100);
      const totalTtc   = r2(subtotalHt + taxAmount);
      return { sortOrder: i, designation: `Ligne ${i}`, unit: 'piece', quantity: 1, unitPriceHt: subtotalHt,
        taxRate: TVA, subtotalHt, netHt: subtotalHt, taxAmount, totalTtc, productId: l.productId ?? null };
    });
    const totalHt  = r2(built.reduce((s, l) => s + l.netHt, 0));
    const totalTax = r2(built.reduce((s, l) => s + l.taxAmount, 0));
    const totalTtc = opts.totalTtcOverride ?? r2(totalHt + totalTax);
    const inv = await tx.invoice.create({
      data: {
        number: nextNo('FAC'), officeId, clientId: opts.clientId, createdById: userId,
        type: (opts.type ?? 'standard') as any, status: (opts.status ?? 'issued') as any,
        issueDate: entryDate, dueDate: entryDate, subject: 'Test moteur', currency: 'XAF',
        subtotalHt: totalHt, totalHt, totalTax, totalTtc,
        amountDue: totalTtc, balanceDue: totalTtc, amountPaid: 0,
        parentInvoiceId: opts.parentInvoiceId ?? null,
        lines: { create: built },
      },
    });
    return { id: inv.id, totalTtc, totalHt, totalTax };
  }

  async function mkProduct(tx: Tx, type: 'product' | 'service'): Promise<string> {
    const p = await tx.product.create({ data: { name: nextNo('PROD'), type: type as any, createdById: userId } });
    return p.id;
  }

  async function mkPayment(tx: Tx, invoiceId: string, amount: number, remainingBalance: number): Promise<string> {
    const p = await tx.payment.create({ data: { invoiceId, amount: r2(amount), paymentDate: entryDate, createdById: userId } });
    await tx.invoice.update({ where: { id: invoiceId }, data: { balanceDue: r2(remainingBalance), amountPaid: { increment: r2(amount) } } });
    return p.id;
  }

  // ── Lecture / agrégats d'écritures ───────────────────────────────────────────
  // On somme le LEDGER PHYSIQUE COMPLET (toutes statuts confondus). Une extourne
  // SYSCOHADA poste l'inverse et l'écriture d'origine reste au journal : le solde
  // d'un compte = somme de TOUTES ses lignes (originale + contre-passation), qui se
  // neutralisent. Filtrer les 'cancelled' fausserait le solde (on garderait la
  // contre-passation sans l'originale qu'elle annule).
  async function entriesForInvoice(tx: Tx, invoiceId: string, extraPaymentIds: string[] = []) {
    return tx.journalEntry.findMany({
      where: {
        OR: [
          { sourceType: { in: ['invoice', 'invoice_reversal'] }, sourceId: invoiceId },
          { sourceType: { in: ['payment', 'payment_reversal'] }, sourceId: { in: extraPaymentIds } },
        ],
      },
      include: { lines: true },
      orderBy: { entryNumber: 'asc' },
    });
  }
  function netByAccount(entries: { lines: { accountNumber: string; debit: any; credit: any }[] }[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const e of entries) for (const l of e.lines) m.set(l.accountNumber, r2((m.get(l.accountNumber) ?? 0) + Number(l.debit) - Number(l.credit)));
    return m;
  }
  function assertBalanced(entries: { totalDebit: any; totalCredit: any; lines: { debit: any; credit: any }[] }[]) {
    for (const e of entries) {
      const d = r2(e.lines.reduce((s, l) => s + Number(l.debit), 0));
      const c = r2(e.lines.reduce((s, l) => s + Number(l.credit), 0));
      expect(d).toBeCloseTo(c, 2);                        // Σdébit = Σcrédit (lignes)
      expect(r2(Number(e.totalDebit))).toBeCloseTo(d, 2); // en-tête cohérent
      expect(r2(Number(e.totalCredit))).toBeCloseTo(c, 2);
    }
  }

  // ═══════════════════════════ GOLDEN ═══════════════════════════════════════════

  it('golden — facture de SERVICES : Dr 411 / Cr 70x services / Cr 443x TVA', async () => {
    await inRollback(async (tx) => {
      const clientId = await mkClient(tx);
      const inv = await mkInvoice(tx, { clientId, lines: [{ ht: 1_000_000 }] }); // service (pas de productId)
      await onInvoiceIssued(inv.id, tx);

      const entries = await entriesForInvoice(tx, inv.id);
      expect(entries).toHaveLength(1);
      assertBalanced(entries);
      const net = netByAccount(entries);
      expect(net.get(S.defaultClientAccount)).toBeCloseTo(1_192_500, 2);        // Dr TTC
      expect(net.get(S.defaultSalesServiceAccount)).toBeCloseTo(-1_000_000, 2); // Cr HT
      expect(net.get(S.collectedTaxAccount)).toBeCloseTo(-192_500, 2);          // Cr TVA
    });
  });

  it('golden — facture de MARCHANDISES : ventes routées vers le compte marchandises', async () => {
    await inRollback(async (tx) => {
      const clientId  = await mkClient(tx);
      const productId = await mkProduct(tx, 'product');
      const inv = await mkInvoice(tx, { clientId, lines: [{ ht: 500_000, productId }] });
      await onInvoiceIssued(inv.id, tx);

      const net = netByAccount(await entriesForInvoice(tx, inv.id));
      expect(net.get(S.defaultSalesGoodsAccount)).toBeCloseTo(-500_000, 2);
      expect(net.get(S.defaultSalesServiceAccount) ?? 0).toBe(0); // rien en services
      expect(net.get(S.collectedTaxAccount)).toBeCloseTo(-96_250, 2);
    });
  });

  // ═══════════════════════════ INVARIANTS ═══════════════════════════════════════

  it('invariant — toute écriture est équilibrée (Σdébit = Σcrédit)', async () => {
    await inRollback(async (tx) => {
      const clientId = await mkClient(tx);
      const inv = await mkInvoice(tx, { clientId, lines: [{ ht: 333_333 }, { ht: 777_777 }] });
      await onInvoiceIssued(inv.id, tx);
      const pId = await mkPayment(tx, inv.id, r2(inv.totalTtc / 3), r2(inv.totalTtc * 2 / 3));
      await onPaymentReceived(pId, tx);
      assertBalanced(await entriesForInvoice(tx, inv.id, [pId]));
    });
  });

  it('invariant — émission puis annulation : solde net NUL sur chaque compte', async () => {
    await inRollback(async (tx) => {
      const clientId = await mkClient(tx);
      const inv = await mkInvoice(tx, { clientId, lines: [{ ht: 640_000 }] });
      await onInvoiceIssued(inv.id, tx);
      await onInvoiceCancelled(inv.id, tx);

      const entries = await entriesForInvoice(tx, inv.id);
      expect(entries.length).toBeGreaterThanOrEqual(2); // vente + avoir
      assertBalanced(entries);
      for (const [account, net] of netByAccount(entries)) {
        expect(net).toBeCloseTo(0, 2); // chaque compte est soldé
        void account;
      }
    });
  });

  it('invariant — idempotence : deux appels du hook ne créent qu’UNE écriture', async () => {
    await inRollback(async (tx) => {
      const clientId = await mkClient(tx);
      const inv = await mkInvoice(tx, { clientId, lines: [{ ht: 1_000_000 }] });
      await onInvoiceIssued(inv.id, tx);
      await onInvoiceIssued(inv.id, tx); // rejoué (retry, double event outbox…)

      const count = await tx.journalEntry.count({ where: { sourceType: 'invoice', sourceId: inv.id, status: { not: 'cancelled' } } });
      expect(count).toBe(1);

      // idem pour un paiement rejoué
      const pId = await mkPayment(tx, inv.id, inv.totalTtc, 0);
      await onPaymentReceived(pId, tx);
      await onPaymentReceived(pId, tx);
      const pCount = await tx.journalEntry.count({ where: { sourceType: 'payment', sourceId: pId, entryKind: 'settlement', status: { not: 'cancelled' } } });
      expect(pCount).toBe(1);
    });
  });

  it('invariant — cycle acompte → solde : CA total = commande, sans double comptage', async () => {
    await inRollback(async (tx) => {
      const clientId = await mkClient(tx);
      const ORDER_HT = 1_000_000;                 // commande HT
      const orderTtc = r2(ORDER_HT * (1 + TVA / 100));
      const acompteTtc = r2(orderTtc * 0.3);      // acompte 30 %

      // Acompte : lignes au montant PLEIN de la commande, totalTtc = part de l'acompte
      const acompte = await mkInvoice(tx, { clientId, lines: [{ ht: ORDER_HT }], type: 'acompte', totalTtcOverride: acompteTtc });
      await onInvoiceIssued(acompte.id, tx);

      // Solde : lignes pleines aussi, totalTtc = commande pleine, rattaché à l'acompte
      const solde = await mkInvoice(tx, { clientId, lines: [{ ht: ORDER_HT }], type: 'solde', parentInvoiceId: acompte.id, totalTtcOverride: orderTtc });
      await onInvoiceIssued(solde.id, tx);

      const entries = await tx.journalEntry.findMany({
        where: { sourceType: 'invoice', sourceId: { in: [acompte.id, solde.id] }, status: { not: 'cancelled' } },
        include: { lines: true },
      });
      assertBalanced(entries);
      const net = netByAccount(entries);
      // CA reconnu = commande HT (ni plus — double comptage — ni moins)
      expect(-(net.get(S.defaultSalesServiceAccount) ?? 0)).toBeCloseTo(ORDER_HT, 1);
      expect(-(net.get(S.collectedTaxAccount) ?? 0)).toBeCloseTo(r2(ORDER_HT * TVA / 100), 1);
      // Total facturé au client = TTC de la commande
      expect(net.get(S.defaultClientAccount)).toBeCloseTo(orderTtc, 1);
    });
  });

  it('invariant — paiement soldant : lettrage 411 émission ↔ règlement', async () => {
    await inRollback(async (tx) => {
      const clientId = await mkClient(tx);
      const inv = await mkInvoice(tx, { clientId, lines: [{ ht: 800_000 }] });
      await onInvoiceIssued(inv.id, tx);
      const pId = await mkPayment(tx, inv.id, inv.totalTtc, 0); // solde intégral
      await onPaymentReceived(pId, tx);

      const lines = (await entriesForInvoice(tx, inv.id, [pId])).flatMap(e => e.lines).filter(l => l.accountNumber === S.defaultClientAccount);
      const lettered = lines.filter(l => !!l.letteringCode);
      expect(lettered.length).toBeGreaterThanOrEqual(2);           // au moins 411 débit + 411 crédit
      const codes = new Set(lettered.map(l => l.letteringCode));
      expect(codes.size).toBe(1);                                  // même code de lettrage
    });
  });

  // ═══════════════════════════ TVA SUR ENCAISSEMENT ═════════════════════════════

  it('TVA sur encaissement — services : 4438 à l’émission, transfert au prorata puis solde', async () => {
    await inRollback(async (tx) => {
      const cs = await tx.companySettings.findFirstOrThrow();
      await tx.companySettings.update({ where: { id: cs.id }, data: { tvaOnCollection: true, pendingTvaAccount: S.pendingTvaAccount } });

      const clientId = await mkClient(tx);
      const inv = await mkInvoice(tx, { clientId, lines: [{ ht: 1_000_000 }] }); // service
      await onInvoiceIssued(inv.id, tx);

      // Émission : TVA en 4438, RIEN en 4431
      let net = netByAccount(await entriesForInvoice(tx, inv.id));
      expect(net.get(S.pendingTvaAccount)).toBeCloseTo(-192_500, 2);
      expect(net.get(S.collectedTaxAccount) ?? 0).toBe(0);

      // Paiement 1 (50 %) → transfert proratisé 4438 → 4431
      const half = r2(inv.totalTtc / 2);
      const p1 = await mkPayment(tx, inv.id, half, r2(inv.totalTtc - half));
      await onPaymentReceived(p1, tx);
      const t1 = await tx.journalEntry.findFirstOrThrow({ where: { sourceType: 'payment', sourceId: p1, entryKind: 'tva_collection' }, include: { lines: true } });
      expect(r2(Number(t1.totalCredit))).toBeCloseTo(96_250, 2);

      // Solde → transfert du reliquat, 4438 totalement soldé
      const p2 = await mkPayment(tx, inv.id, r2(inv.totalTtc - half), 0);
      await onPaymentReceived(p2, tx);

      net = netByAccount(await entriesForInvoice(tx, inv.id, [p1, p2]));
      expect(net.get(S.pendingTvaAccount)).toBeCloseTo(0, 2);           // 4438 soldé
      expect(net.get(S.collectedTaxAccount)).toBeCloseTo(-192_500, 2);  // TVA devenue exigible en totalité
    });
  });

  it('TVA sur encaissement — suppression du paiement : le transfert 4438→4431 est contre-passé', async () => {
    await inRollback(async (tx) => {
      const cs = await tx.companySettings.findFirstOrThrow();
      await tx.companySettings.update({ where: { id: cs.id }, data: { tvaOnCollection: true, pendingTvaAccount: S.pendingTvaAccount } });

      const clientId = await mkClient(tx);
      const inv = await mkInvoice(tx, { clientId, lines: [{ ht: 1_000_000 }] });
      await onInvoiceIssued(inv.id, tx);
      const pId = await mkPayment(tx, inv.id, inv.totalTtc, 0);
      await onPaymentReceived(pId, tx);
      await tx.payment.update({ where: { id: pId }, data: { deletedAt: new Date() } });
      await onPaymentDeleted(pId, tx);

      const net = netByAccount(await entriesForInvoice(tx, inv.id, [pId]));
      // Après extourne : la TVA services repart en attente (4438), 4431 revient à 0
      expect(net.get(S.collectedTaxAccount) ?? 0).toBeCloseTo(0, 2);
      expect(net.get(S.pendingTvaAccount)).toBeCloseTo(-192_500, 2);
    });
  });
});
