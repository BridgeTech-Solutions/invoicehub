/**
 * Fixture de QA — écran d'auto-rapprochement bancaire.
 *
 * POURQUOI
 * Le chemin nominal de l'auto-rapprochement est impossible à exercer sur des
 * données ordinaires : il faut des contreparties dont le montant, la date ET le
 * libellé concordent au point d'atteindre le seuil des 90 %. Sans ce jeu de
 * données, l'écran ne peut être validé qu'à l'état vide — c'est précisément ce qui
 * avait laissé passer plusieurs défauts.
 *
 * CALIBRAGE — barème de `computeScore` (src/modules/bank/bank.matching.ts) :
 *   montant exact (45) + même jour (30) + libellé identique   (15) = 90 → APPLIQUÉ
 *   montant exact (45) + même jour (30) + libellé divergent    (1) = 76 → À CONFIRMER
 * Soit 3 correspondances haute confiance et 2 à confirmer.
 *
 * Ce que la fixture permet de vérifier :
 *   • les ≥ 90 % sont appliquées, les 70–89 % seulement proposées ;
 *   • la contrepartie est liée DES DEUX CÔTÉS (`expense.bankTransactionId`
 *     renseigné) — sans quoi un même justificatif peut être rapproché deux fois ;
 *   • l'écran de résultat distingue rapprochées / à confirmer.
 *
 * USAGE
 *   pnpm qa:seed-automatch            crée le jeu (repart d'un état propre)
 *   pnpm qa:seed-automatch --clean    supprime tout
 *
 * Toutes les données portent le préfixe `__DEMO_AUTOMATCH__`, ce qui rend le
 * nettoyage exact : rien d'autre n'est touché.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

for (const line of fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
}

const prisma = new PrismaClient();
const TAG    = '__DEMO_AUTOMATCH__';
const CLEAN  = process.argv.includes('--clean');
const utc    = (s: string) => new Date(`${s}T00:00:00.000Z`);

// Ce script FABRIQUE des comptes bancaires, des mouvements et des dépenses. Il n'a
// rien à faire sur une base de production, où il polluerait la comptabilité de
// données fictives. Le nettoyage (--clean) reste toujours autorisé, pour pouvoir
// rattraper une exécution accidentelle.
//
// `--force` existe parce que le .env de développement de ce projet déclare
// NODE_ENV=production : sans échappatoire, la fixture serait inutilisable là où on
// en a justement besoin. Le refus par défaut garde sa valeur — il oblige à un geste
// délibéré au lieu de laisser passer une exécution distraite.
const FORCE = process.argv.includes('--force');
if (process.env['NODE_ENV'] === 'production' && !CLEAN && !FORCE) {
  console.error(
    '\n✗ Refus : fixture de QA lancée avec NODE_ENV=production.\n' +
    '  Ce script crée des données fictives dans la base pointée par DATABASE_URL :\n' +
    `  ${(process.env['DATABASE_URL'] ?? '(non défini)').replace(/(:\/\/[^:]+:)[^@]*@/, '$1***@')}\n` +
    '\n  • Si cette base est bien un environnement de test : relancez avec --force.\n' +
    '  • Pour supprimer un jeu déjà en place : --clean.\n',
  );
  process.exit(1);
}

async function clean() {
  const accounts = await prisma.bankAccount.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const ids = accounts.map(a => a.id);
  await prisma.expense.deleteMany({ where: { number: { startsWith: TAG } } });
  if (ids.length) {
    await prisma.bankTransaction.deleteMany({ where: { bankAccountId: { in: ids } } });
    await prisma.bankReconciliation.deleteMany({ where: { bankAccountId: { in: ids } } });
    await prisma.bankStatementImport.deleteMany({ where: { bankAccountId: { in: ids } } });
    await prisma.bankMatchingRule.deleteMany({ where: { bankAccountId: { in: ids } } });
    await prisma.bankAccount.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(`nettoyage : ${ids.length} compte(s) de démonstration supprimé(s).`);
}

async function seed() {
  await clean(); // repartir d'un état propre

  const user     = await prisma.user.findFirstOrThrow({ select: { id: true } });
  const office   = await prisma.agencyOffice.findFirstOrThrow({ select: { id: true } });
  const category = await prisma.expenseCategory.findFirstOrThrow({ select: { id: true } });

  const account = await prisma.bankAccount.create({
    data: {
      name: `${TAG} Compte démo auto-matching`, bankName: 'BGFI Démo',
      currency: 'XAF', openingBalance: 5_000_000, currentBalance: 5_000_000,
    },
  });

  // Libellé identique → 90 pts (appliqué) · libellé divergent → ~77 pts (à confirmer)
  const rows = [
    { amount: 125_000, date: '2026-04-05', txLabel: 'ACHAT FOURNITURES BUREAU',          expTitle: 'ACHAT FOURNITURES BUREAU',          tier: 'haute' },
    { amount: 340_000, date: '2026-04-08', txLabel: 'REGLEMENT PRESTATAIRE INFORMATIQUE', expTitle: 'REGLEMENT PRESTATAIRE INFORMATIQUE', tier: 'haute' },
    { amount:  92_500, date: '2026-04-11', txLabel: 'ABONNEMENT FIBRE ENTREPRISE',       expTitle: 'ABONNEMENT FIBRE ENTREPRISE',       tier: 'haute' },
    { amount:  87_500, date: '2026-04-12', txLabel: 'CARBURANT VEHICULE SOCIETE',        expTitle: 'ZZZZ WWWW QQQQ',                    tier: 'moyenne' },
    { amount:  56_000, date: '2026-04-15', txLabel: 'FRAIS DE MISSION DOUALA',           expTitle: 'KKKK JJJJ HHHH',                    tier: 'moyenne' },
  ];

  let seq = 0, totalDebit = 0;
  for (const r of rows) {
    await prisma.bankTransaction.create({
      data: {
        bankAccountId: account.id, transactionDate: utc(r.date),
        label: r.txLabel, amount: r.amount, type: 'debit', source: 'manual',
      },
    });
    await prisma.expense.create({
      data: {
        number: `${TAG}EXP${++seq}`, officeId: office.id, categoryId: category.id, createdById: user.id,
        title: r.expTitle, expenseDate: utc(r.date), amountTtc: r.amount,
      },
    });
    totalDebit += r.amount;
  }

  await prisma.bankAccount.update({
    where: { id: account.id },
    data:  { currentBalance: 5_000_000 - totalDebit },
  });

  const rec = await prisma.bankReconciliation.create({
    data: {
      bankAccountId: account.id,
      periodStart: utc('2026-04-01'), periodEnd: utc('2026-04-30'),
      openingBalance: 5_000_000, closingBalanceStatement: 0,
      closingBalanceSystem: 5_000_000 - totalDebit,
      status: 'in_progress', createdById: user.id,
    },
  });

  console.log(`\ncompte      : ${account.id}`);
  console.log(`rapprochement : ${rec.id}`);
  console.log(`\n${rows.filter(r => r.tier === 'haute').length} correspondances attendues ≥ 90 % (appliquées)`);
  console.log(`${rows.filter(r => r.tier === 'moyenne').length} correspondances attendues 70–89 % (à confirmer)`);
  console.log(`\nÉcran : http://localhost:3001/bank/reconciliations/${rec.id}\n`);
}

(CLEAN ? clean() : seed())
  .catch((e) => { console.error('✗', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
