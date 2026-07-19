/**
 * Tests d'intégration du BankService — exécutés contre une VRAIE base PostgreSQL.
 *
 * Sûreté : toutes les données créées sont préfixées par un identifiant de run unique
 * et supprimées dans `afterAll`. Aucune donnée préexistante n'est lue en écriture ni
 * supprimée : les nettoyages ne portent QUE sur les identifiants créés par ce fichier.
 *
 * La suite s'auto-désactive si DATABASE_URL est absent (CI sans base).
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { BankService } from './bank.service';

// ── Chargement de .env (le projet n'embarque pas dotenv en dépendance directe) ──
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]!]) {
      process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

const RUN = !!process.env['DATABASE_URL'];
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

// File BullMQ simulée : Redis n'est pas requis pour ces scénarios (< 200 lignes)
const queueMock = {
  add:    jest.fn(async () => ({ id: 'job-test' })),
  getJob: jest.fn(async () => null),
};

(RUN ? describe : describe.skip)('BankService — intégration (PostgreSQL réel)', () => {
  const prisma  = new PrismaClient();
  const service = new BankService(prisma as any, queueMock as any);

  const RUN_ID = randomUUID().slice(0, 8);
  const tag    = (s: string) => `__TEST_${RUN_ID}__${s}`;

  // Traçabilité pour le nettoyage : on ne supprime que ça.
  const createdAccountIds: string[] = [];
  const createdImportIds:  string[] = [];
  const createdExpenseIds: string[] = [];
  let userId: string;
  let officeId: string;
  let categoryId: string;
  let expenseSeq = 0;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.findFirst({ select: { id: true } });
    if (!user) throw new Error('Aucun utilisateur en base — impossible de satisfaire les FK');
    userId = user.id;

    // Référentiel existant, lu seulement (jamais modifié)
    officeId   = (await prisma.agencyOffice.findFirstOrThrow({ select: { id: true } })).id;
    categoryId = (await prisma.expenseCategory.findFirstOrThrow({ select: { id: true } })).id;
  });

  /**
   * Contrepartie réelle pour les rapprochements. `reconcileTransaction` refuse
   * désormais une contrepartie introuvable ou déjà liée : les UUID fictifs ne
   * suffisent plus, ce qui est précisément la garantie anti-double-rapprochement.
   */
  async function makeExpense(amountTtc: number, expenseDate: Date) {
    const e = await prisma.expense.create({
      data: {
        number: `__TEST_${RUN_ID}__EXP${++expenseSeq}`,
        officeId, categoryId, createdById: userId,
        title: tag('dépense'), expenseDate, amountTtc,
      },
      select: { id: true },
    });
    createdExpenseIds.push(e.id);
    return e;
  }

  afterAll(async () => {
    try {
      if (createdExpenseIds.length) {
        await prisma.expense.deleteMany({ where: { id: { in: createdExpenseIds } } });
      }
      if (createdAccountIds.length) {
        // Ordre imposé par les FK (bank_transactions.bank_account_id = Restrict)
        await prisma.bankTransaction.deleteMany({ where: { bankAccountId: { in: createdAccountIds } } });
        await prisma.bankStatementImport.deleteMany({ where: { bankAccountId: { in: createdAccountIds } } });
        await prisma.bankReconciliation.deleteMany({ where: { bankAccountId: { in: createdAccountIds } } });
        await prisma.bankMatchingRule.deleteMany({ where: { bankAccountId: { in: createdAccountIds } } });
        await prisma.bankProfileOverride.deleteMany({ where: { bankAccountId: { in: createdAccountIds } } });
        await prisma.bankAccount.deleteMany({ where: { id: { in: createdAccountIds } } });
      }
      if (createdImportIds.length) {
        await prisma.bankStatementImport.deleteMany({ where: { id: { in: createdImportIds } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  /** Crée un compte de test isolé et l'enregistre pour le nettoyage. */
  async function makeAccount(openingBalance = 0, name = 'compte') {
    const acc = await service.createAccount({
      name: tag(name), bankName: 'Banque de test', currency: 'XAF',
      openingBalance, isDefault: false,
    } as any);
    createdAccountIds.push(acc.id);
    return acc;
  }

  const balanceOf = async (id: string) =>
    Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id } })).currentBalance);

  // ── Soldes ────────────────────────────────────────────────────────────────

  describe('soldes', () => {
    it('initialise currentBalance au solde d’ouverture', async () => {
      const acc = await makeAccount(1_000_000);
      expect(Number(acc.currentBalance)).toBe(1_000_000);
      expect(Number(acc.openingBalance)).toBe(1_000_000);
    });

    it('un crédit incrémente et un débit décrémente le solde', async () => {
      const acc = await makeAccount(1_000_000);

      await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-03-10'),
        label: 'VIREMENT CLIENT', amount: 500_000, type: 'credit',
      } as any);
      expect(await balanceOf(acc.id)).toBe(1_500_000);

      await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-03-12'),
        label: 'ACHAT FOURNITURE', amount: 200_000, type: 'debit',
      } as any);
      expect(await balanceOf(acc.id)).toBe(1_300_000);
    });

    it('refuse la suppression d’un compte au solde non nul, l’accepte à zéro', async () => {
      const acc = await makeAccount(50_000);
      await expect(service.deleteAccount(acc.id)).rejects.toThrow(/solde non nul/i);

      await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-03-10'),
        label: 'RETRAIT SOLDE', amount: 50_000, type: 'debit',
      } as any);
      expect(await balanceOf(acc.id)).toBe(0);

      await expect(service.deleteAccount(acc.id)).resolves.toBeUndefined();
      const deleted = await prisma.bankAccount.findUniqueOrThrow({ where: { id: acc.id } });
      expect(deleted.deletedAt).not.toBeNull(); // soft-delete
    });

    it('fige le solde d’ouverture dès qu’il existe un mouvement', async () => {
      const acc = await makeAccount(100_000);

      // Aucun mouvement → modification autorisée + resynchronisation
      const updated = await service.updateAccount(acc.id, { openingBalance: 300_000 } as any);
      expect(Number(updated.openingBalance)).toBe(300_000);
      expect(Number(updated.currentBalance)).toBe(300_000);

      await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-03-10'),
        label: 'MOUVEMENT', amount: 1_000, type: 'credit',
      } as any);

      await expect(
        service.updateAccount(acc.id, { openingBalance: 999_000 } as any),
      ).rejects.toThrow(/ne peut plus être modifié/i);
    });
  });

  // ── Rapprochement ─────────────────────────────────────────────────────────

  describe('rapprochement', () => {
    it('cycle complet : ouverture → rapprochement → rapport équilibré → clôture', async () => {
      const acc = await makeAccount(1_000_000);

      const credit = await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-03-10'),
        label: 'ENCAISSEMENT CLIENT', amount: 500_000, type: 'credit',
      } as any);
      const debit = await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-03-12'),
        label: 'PAIEMENT FOURNISSEUR', amount: 200_000, type: 'debit',
      } as any);

      const rec = await service.openReconciliation({
        bankAccountId: acc.id, periodStart: d('2026-03-01'), periodEnd: d('2026-03-31'),
        openingBalance: 1_000_000,
      } as any, userId);
      expect(rec.status).toBe('in_progress');
      // Photographie du solde système au moment de l'ouverture
      expect(Number(rec.closingBalanceSystem)).toBe(1_300_000);

      // Rapprochement des deux mouvements sur des contreparties réelles
      for (const t of [credit, debit]) {
        const exp  = await makeExpense(Number(t.amount), t.transactionDate);
        const done = await service.reconcileTransaction(
          t.id, { matchedEntityType: 'expense', matchedEntityId: exp.id } as any, userId,
        );
        expect(done.reconciliationStatus).toBe('reconciled');
        expect(done.reconciledAt).not.toBeNull();

        // La contrepartie est bien liée en retour (fin du demi-rapprochement)
        const linked = await prisma.expense.findUniqueOrThrow({ where: { id: exp.id } });
        expect(linked.bankTransactionId).toBe(t.id);
      }

      const report = await service.getReconciliationReport(rec.id);
      expect(report.totalCredits).toBe(500_000);
      expect(report.totalDebits).toBe(200_000);
      expect(report.closingBalanceStatement).toBe(1_300_000); // 1 000 000 + 500 000 − 200 000
      expect(report.closingBalanceSystem).toBe(1_300_000);
      expect(report.gap).toBe(0);
      expect(report.isBalanced).toBe(true);
      expect(report.reconciledCount).toBe(2);
      expect(report.pendingCount).toBe(0);

      const completed = await service.completeReconciliation(rec.id, userId);
      expect(completed.status).toBe('completed');
      expect(completed.isBalanced).toBe(true);
      expect(Number(completed.closingBalanceStatement)).toBe(1_300_000);

      // La date de dernier rapprochement remonte sur le compte
      const acc2 = await prisma.bankAccount.findUniqueOrThrow({ where: { id: acc.id } });
      expect(acc2.lastReconciledDate).not.toBeNull();

      // Idempotence : une session clôturée ne se reclôture pas
      await expect(service.completeReconciliation(rec.id, userId)).rejects.toThrow(/déjà clôturée/i);
    });

    it('détecte un écart quand tous les mouvements ne sont pas rapprochés', async () => {
      const acc = await makeAccount(1_000_000);
      const credit = await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-04-10'),
        label: 'ENCAISSEMENT', amount: 400_000, type: 'credit',
      } as any);
      await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-04-11'),
        label: 'NON RAPPROCHE', amount: 150_000, type: 'credit',
      } as any);

      const rec = await service.openReconciliation({
        bankAccountId: acc.id, periodStart: d('2026-04-01'), periodEnd: d('2026-04-30'),
        openingBalance: 1_000_000,
      } as any, userId);

      const exp = await makeExpense(400_000, credit.transactionDate);
      await service.reconcileTransaction(
        credit.id, { matchedEntityType: 'expense', matchedEntityId: exp.id } as any, userId,
      );

      const report = await service.getReconciliationReport(rec.id);
      expect(report.closingBalanceStatement).toBe(1_400_000); // seul le mouvement rapproché compte
      expect(report.closingBalanceSystem).toBe(1_550_000);
      expect(report.gap).toBe(-150_000);
      expect(report.isBalanced).toBe(false);
      expect(report.pendingCount).toBe(1);
    });

    it('interdit le double rapprochement et permet le dé-rapprochement', async () => {
      const acc = await makeAccount(0);
      const t = await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-03-10'),
        label: 'MOUVEMENT', amount: 10_000, type: 'credit',
      } as any);
      const exp     = await makeExpense(10_000, d('2026-03-10'));
      const payload = { matchedEntityType: 'expense', matchedEntityId: exp.id } as any;

      await service.reconcileTransaction(t.id, payload, userId);
      await expect(service.reconcileTransaction(t.id, payload, userId)).rejects.toThrow(/déjà rapprochée/i);

      const un = await service.unmatchTransaction(t.id);
      expect(un.reconciliationStatus).toBe('pending');
      expect(un.matchedEntityId).toBeNull();
      expect(un.reconciledAt).toBeNull();

      // Le dé-rapprochement libère aussi la contrepartie
      const released = await prisma.expense.findUniqueOrThrow({ where: { id: exp.id } });
      expect(released.bankTransactionId).toBeNull();

      await expect(service.unmatchTransaction(t.id)).rejects.toThrow(/non rapprochée/i);
    });

    // Régression : c'est LE risque comptable que la liaison de contrepartie ferme.
    it('refuse de rapprocher deux mouvements sur la même contrepartie', async () => {
      const acc = await makeAccount(0);
      const t1 = await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-03-10'),
        label: 'VIREMENT A', amount: 75_000, type: 'debit',
      } as any);
      const t2 = await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-03-11'),
        label: 'VIREMENT B', amount: 75_000, type: 'debit',
      } as any);

      const exp = await makeExpense(75_000, d('2026-03-10'));
      const payload = { matchedEntityType: 'expense', matchedEntityId: exp.id } as any;

      await service.reconcileTransaction(t1.id, payload, userId);

      // Même dépense, autre mouvement du même montant → doit être refusé
      await expect(service.reconcileTransaction(t2.id, payload, userId))
        .rejects.toThrow(/déjà rapprochée d’un autre mouvement/i);

      const t2After = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: t2.id } });
      expect(t2After.reconciliationStatus).toBe('pending'); // rien n'a été écrit

      const stillLinkedToT1 = await prisma.expense.findUniqueOrThrow({ where: { id: exp.id } });
      expect(stillLinkedToT1.bankTransactionId).toBe(t1.id);
    });

    it('refuse une contrepartie introuvable', async () => {
      const acc = await makeAccount(0);
      const t = await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-03-10'),
        label: 'MOUVEMENT ORPHELIN', amount: 5_000, type: 'credit',
      } as any);

      await expect(service.reconcileTransaction(
        t.id, { matchedEntityType: 'expense', matchedEntityId: randomUUID() } as any, userId,
      )).rejects.toThrow(/introuvable/i);

      const after = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: t.id } });
      expect(after.reconciliationStatus).toBe('pending');
    });

    it('ignoreTransaction sort le mouvement du périmètre', async () => {
      const acc = await makeAccount(0);
      const t = await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-03-10'),
        label: 'FRAIS BANCAIRES', amount: 2_500, type: 'debit',
      } as any);
      const ignored = await service.ignoreTransaction(t.id);
      expect(ignored.reconciliationStatus).toBe('ignored');
    });
  });

  // ── Import : preview → confirm → rollback ────────────────────────────────

  describe('import de relevé', () => {
    const CSV = [
      'Date;Libellé;Débit;Crédit',
      '15/03/2026;VIREMENT CLIENT ALPHA;;1 500 000',
      '16/03/2026;ACHAT FOURNITURE BETA;250 000;',
      '17/03/2026;FRAIS TENUE DE COMPTE;5 000;',
    ].join('\n');

    it('previewImport parse le CSV et crée un import en attente', async () => {
      const acc = await makeAccount(1_000_000);
      const preview = await service.previewImport(
        Buffer.from(CSV, 'utf-8'), acc.id, 'releve.csv',
      );
      createdImportIds.push(preview.importId);

      // Régression du bug de mapping : un CSV valide ne doit JAMAIS produire 0 ligne
      expect(preview.rows).toHaveLength(3);
      expect(preview.totalRows).toBe(3);
      expect(preview.duplicates).toBe(0);
      expect(preview.parseErrors).toHaveLength(0);
      expect(preview.periodStart).toBe('2026-03-15');
      expect(preview.periodEnd).toBe('2026-03-17');

      const credit = preview.rows.find(r => r.credit !== null)!;
      expect(credit.credit).toBe(1_500_000);
      expect(credit.label).toBe('VIREMENT CLIENT ALPHA');

      const rec = await prisma.bankStatementImport.findUniqueOrThrow({ where: { id: preview.importId } });
      expect(rec.status).toBe('pending');
      expect(Number(rec.totalCredits)).toBe(1_500_000);
      expect(Number(rec.totalDebits)).toBe(255_000);
    });

    it('confirmImport crée les mouvements et met le solde à jour, rollbackImport annule tout', async () => {
      const acc = await makeAccount(1_000_000);

      const preview = await service.previewImport(Buffer.from(CSV, 'utf-8'), acc.id, 'releve.csv');
      createdImportIds.push(preview.importId);

      const confirmed = await service.confirmImport(preview.importId, userId);
      expect(confirmed.status).toBe('completed');
      expect(confirmed.nbImported).toBe(3);

      // Solde = 1 000 000 + 1 500 000 − 255 000
      expect(await balanceOf(acc.id)).toBe(2_245_000);
      expect(await prisma.bankTransaction.count({ where: { importId: preview.importId } })).toBe(3);

      const rolled = await service.rollbackImport(preview.importId);
      expect(rolled.deleted).toBe(3);
      expect(await balanceOf(acc.id)).toBe(1_000_000); // solde restauré
      expect(await prisma.bankTransaction.count({ where: { importId: preview.importId } })).toBe(0);

      const rec = await prisma.bankStatementImport.findUniqueOrThrow({ where: { id: preview.importId } });
      expect(rec.status).toBe('cancelled');
    });

    it('détecte les doublons sur un second import du même relevé', async () => {
      const acc = await makeAccount(0);

      const p1 = await service.previewImport(Buffer.from(CSV, 'utf-8'), acc.id, 'releve.csv');
      createdImportIds.push(p1.importId);
      await service.confirmImport(p1.importId, userId);

      const p2 = await service.previewImport(Buffer.from(CSV, 'utf-8'), acc.id, 'releve.csv');
      createdImportIds.push(p2.importId);

      expect(p2.duplicates).toBe(3);
      expect(p2.rows).toHaveLength(0);

      const confirmed = await service.confirmImport(p2.importId, userId);
      expect(confirmed.nbImported).toBe(0);
    });

    it('refuse de confirmer deux fois le même import', async () => {
      const acc = await makeAccount(0);
      const p = await service.previewImport(Buffer.from(CSV, 'utf-8'), acc.id, 'releve.csv');
      createdImportIds.push(p.importId);

      await service.confirmImport(p.importId, userId);
      await expect(service.confirmImport(p.importId, userId)).rejects.toThrow(/déjà été traité/i);
    });

    // Régression : au-delà de 200 lignes, confirmImport bascule sur la file BullMQ.
    // Les Date de `previewData` reviennent de JSONB en chaînes ISO, et l'appel à
    // `.toISOString()` plantait — aucun relevé de plus de 200 lignes n'était importable.
    it('bascule sur la file au-delà de 200 lignes, avec des dates ISO valides', async () => {
      const acc = await makeAccount(0);

      let bigCsv = 'Date;Libellé;Débit;Crédit\n';
      for (let i = 1; i <= 250; i++) {
        const day = String((i % 28) + 1).padStart(2, '0');
        bigCsv += `${day}/03/2026;OPERATION NUMERO ${i};;${1000 + i}\n`;
      }

      const preview = await service.previewImport(Buffer.from(bigCsv, 'utf-8'), acc.id, 'gros-releve.csv');
      createdImportIds.push(preview.importId);
      expect(preview.rows).toHaveLength(250);

      queueMock.add.mockClear();
      const confirmed = await service.confirmImport(preview.importId, userId);

      expect(confirmed.status).toBe('processing');
      expect(confirmed.jobId).toBeDefined();
      expect(queueMock.add).toHaveBeenCalledTimes(1);

      // Le worker attend des chaînes ISO exploitables par `new Date(...)`
      const payload = (queueMock.add.mock.calls[0] as any[])[1];
      expect(payload.lines).toHaveLength(250);
      const first = payload.lines[0];
      expect(typeof first.transactionDate).toBe('string');
      expect(Number.isNaN(new Date(first.transactionDate).getTime())).toBe(false);
      expect(first.transactionDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const rec = await prisma.bankStatementImport.findUniqueOrThrow({ where: { id: preview.importId } });
      expect(rec.status).toBe('processing');
    });

    // Régression : un relevé peut légitimement contenir deux lignes identiques
    // (deux retraits DAB du même montant le même jour). `createMany({ skipDuplicates })`
    // n'en crée qu'une, mais le delta de solde était calculé sur toutes les lignes
    // soumises → mouvements fantômes. Constaté à 10 000 XAF de dérive sur 3 lignes.
    it('ne compte au solde que les lignes réellement créées (doublons internes au fichier)', async () => {
      const acc = await makeAccount(0);

      const csv = [
        'Date;Libellé;Débit;Crédit',
        '10/04/2026;VIREMENT UNIQUE;;100 000',
        '15/04/2026;RETRAIT DAB IDENTIQUE;5 000;',
        '15/04/2026;RETRAIT DAB IDENTIQUE;5 000;',
        '15/04/2026;RETRAIT DAB IDENTIQUE;5 000;',
      ].join('\n');

      const preview = await service.previewImport(Buffer.from(csv, 'utf-8'), acc.id, 'doublons.csv');
      createdImportIds.push(preview.importId);

      const confirmed = await service.confirmImport(preview.importId, userId);

      // Les trois retraits partagent la même empreinte : un seul est créé.
      expect(confirmed.nbImported).toBe(2);
      expect(await prisma.bankTransaction.count({ where: { importId: preview.importId } })).toBe(2);

      // Le solde suit les lignes créées, pas les lignes soumises.
      expect(await balanceOf(acc.id)).toBe(95_000); // 100 000 − 5 000, et non − 15 000
    });

    it('rollback d’un import encore en attente supprime simplement le brouillon', async () => {
      const acc = await makeAccount(0);
      const p = await service.previewImport(Buffer.from(CSV, 'utf-8'), acc.id, 'releve.csv');

      const rolled = await service.rollbackImport(p.importId);
      expect(rolled.deleted).toBe(0);
      expect(await prisma.bankStatementImport.findUnique({ where: { id: p.importId } })).toBeNull();
    });
  });

  // ── Auto-rapprochement ────────────────────────────────────────────────────

  describe('auto-rapprochement', () => {
    const SHAPE = ['applied', 'skipped', 'high', 'medium'];

    // Régression : les sorties anticipées renvoyaient `{ applied, suggestions }`,
    // une forme différente du chemin nominal, avec une clé inexistante ailleurs.
    // Le client recevait des champs absents selon qu'il y avait ou non des
    // candidats — invisible au typecheck comme aux tests unitaires, trouvé en
    // pilotant l'interface.
    it('renvoie la même forme sans aucun mouvement en attente', async () => {
      const acc = await makeAccount(0);
      const rec = await service.openReconciliation({
        bankAccountId: acc.id, periodStart: d('2026-09-01'), periodEnd: d('2026-09-30'),
        openingBalance: 0,
      } as any, userId);

      const res = await service.getAutoMatchBatch(rec.id, userId);
      expect(Object.keys(res).sort()).toEqual([...SHAPE].sort());
      expect(res.applied).toBe(0);
      expect(res.high).toEqual([]);
      expect(res.medium).toEqual([]);
      expect(res.skipped).toEqual([]);
    });

    it('renvoie la même forme quand aucune contrepartie n’est candidate', async () => {
      const acc = await makeAccount(0);
      await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-09-10'),
        label: 'MOUVEMENT SANS CONTREPARTIE', amount: 12_345, type: 'credit',
      } as any);

      const rec = await service.openReconciliation({
        bankAccountId: acc.id, periodStart: d('2026-09-01'), periodEnd: d('2026-09-30'),
        openingBalance: 0,
      } as any, userId);

      const res = await service.getAutoMatchBatch(rec.id, userId);
      expect(Object.keys(res).sort()).toEqual([...SHAPE].sort());
      expect(res.applied).toBe(0);
      // Les champs sont des tableaux, jamais `undefined` : le client itère dessus.
      expect(Array.isArray(res.medium)).toBe(true);
      expect(Array.isArray(res.skipped)).toBe(true);
    });
  });

  // ── Résumé ────────────────────────────────────────────────────────────────

  describe('résumé', () => {
    it('agrège soldes et mouvements en attente sans planter', async () => {
      const acc = await makeAccount(750_000);
      await service.createTransaction({
        bankAccountId: acc.id, transactionDate: d('2026-03-10'),
        label: 'EN ATTENTE', amount: 25_000, type: 'credit',
      } as any);

      const summary = await service.getBankSummary();
      expect(summary.accountsCount).toBeGreaterThanOrEqual(1);
      expect(typeof summary.totalBalance).toBe('number');

      const mine = summary.accounts.find(a => a.id === acc.id)!;
      expect(mine).toBeDefined();
      expect(mine.currentBalance).toBe(775_000);
      expect(mine.pendingCount).toBe(1);
    });
  });
});
