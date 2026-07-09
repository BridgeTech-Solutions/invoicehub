/**
 * Rattrapage comptable — TVA déductible des dépenses (SYSCOHADA).
 *
 * CONTEXTE
 * Avant le correctif de `accountingEngine.onExpensePaid`, les dépenses portant une
 * TVA (taxRate > 0) étaient comptabilisées à tort avec le TTC intégralement imputé
 * au compte de charge (classe 6) :
 *
 *     Dr 6xx  = TTC        Cr 5xx = TTC        ← ANCIEN (faux)
 *
 * La forme correcte isole la TVA déductible sur son compte 445x, comme pour les
 * factures fournisseurs :
 *
 *     Dr 6xx  = HT
 *     Dr 445x = TVA        Cr 5xx = TTC        ← NOUVEAU (correct)
 *
 * Ce script identifie les écritures fautives (sourceType='expense', 2 lignes, et
 * dépense liée avec taxAmount > 0) et les corrige :
 *   • statut `draft`               → réécriture SUR PLACE (ajout de la ligne TVA,
 *                                     charge ramenée au HT). Aucune extourne : un
 *                                     brouillon n'est pas définitif.
 *   • statut `validated`/`locked`  → EXTOURNE de l'écriture (contre-passation) puis
 *                                     REPASSAGE d'une écriture correcte en `draft`
 *                                     (à revalider par la DAF). Nécessite une période
 *                                     OUVERTE couvrant la date : sinon l'écriture est
 *                                     laissée telle quelle et signalée pour traitement
 *                                     manuel (rouvrir la période ou passer un OD).
 *   • statut `cancelled`           → ignorée.
 *
 * SÉCURITÉ
 *   • Dry-run par défaut : n'écrit RIEN, se contente de lister le plan d'action.
 *   • Passer `--apply` pour exécuter réellement.
 *   • Chaque correction est transactionnelle et équilibrée (partie double garantie).
 *
 * Usage :
 *   npx ts-node prisma/fix-expense-vat.ts            (dry-run — rapport seul)
 *   npx ts-node prisma/fix-expense-vat.ts --apply    (applique les corrections)
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const round2 = (n: number): number => Math.round(n * 100) / 100;

type Tx = Prisma.TransactionClient;

// Numérotation séquentielle `${journalCode}-${année}-00001` cohérente avec l'engine.
async function nextEntryNumber(tx: Tx, journalCode: string, date: Date): Promise<string> {
  const year   = date.getFullYear();
  const prefix = `${journalCode}-${year}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`jentry:${journalCode}:${year}`}))`;
  const last = await tx.journalEntry.findFirst({
    where: {
      journal:   { code: journalCode },
      entryDate: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) },
    },
    orderBy: { entryNumber: 'desc' },
    select:  { entryNumber: true },
  });
  let next = 1;
  if (last?.entryNumber) {
    const n = parseInt(last.entryNumber.replace(prefix, ''), 10);
    if (!isNaN(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(5, '0')}`;
}

interface Plan {
  entryId:      string;
  entryNumber:  string;
  status:       string;
  expenseNo:    string;
  chargeAccount: string;
  bankAccount:  string;
  vatAccount:   string;
  amountHt:     number;
  taxAmount:    number;
  amountTtc:    number;
  action:       'in_place' | 'reverse_repost' | 'manual';
  reason?:      string;
}

async function main() {
  console.log(`\n=== Rattrapage TVA dépenses — ${APPLY ? 'MODE APPLICATION' : 'DRY-RUN (aucune écriture)'} ===\n`);

  const settings = await prisma.companySettings.findFirst({
    select: { deductibleTaxAccount: true },
  });
  const vatAccount = settings?.deductibleTaxAccount ?? null;
  if (!vatAccount) {
    console.error('✖ Aucun compte de TVA déductible configuré (company_settings.deductibleTaxAccount). Abandon.');
    return;
  }

  // Candidates : écritures de dépense à 2 lignes (ancien format).
  const entries = await prisma.journalEntry.findMany({
    where:   { sourceType: 'expense' },
    include: { lines: { orderBy: { sortOrder: 'asc' } }, fiscalPeriod: { select: { id: true, status: true, startDate: true, endDate: true } }, journal: { select: { code: true } } },
    orderBy: { entryDate: 'asc' },
  });

  const plans: Plan[] = [];

  for (const e of entries) {
    if (e.status === 'cancelled') continue;
    if (e.lines.length !== 2) continue; // déjà éclatée (3 lignes) ou format inattendu

    const expense = e.sourceId
      ? await prisma.expense.findUnique({
          where:  { id: e.sourceId },
          select: { number: true, amountHt: true, taxAmount: true, amountTtc: true },
        })
      : null;
    if (!expense) continue;

    const taxAmount = round2(Number(expense.taxAmount));
    if (taxAmount <= 0.005) continue; // pas de TVA → l'écriture 2 lignes est correcte

    const amountHt  = round2(Number(expense.amountHt));
    const amountTtc = round2(Number(expense.amountTtc));

    const chargeLine = e.lines.find((l) => Number(l.debit)  > 0);
    const bankLine   = e.lines.find((l) => Number(l.credit) > 0);
    if (!chargeLine || !bankLine) continue;

    // Sécurité : ne corriger que si la charge est bien au TTC (ancien format).
    if (Math.abs(Number(chargeLine.debit) - amountTtc) > 0.01) continue;

    let action: Plan['action'];
    let reason: string | undefined;
    if (e.status === 'draft') {
      action = 'in_place';
    } else if (e.fiscalPeriod.status === 'open') {
      action = 'reverse_repost';
    } else {
      action = 'manual';
      reason = `écriture ${e.status} dans une période ${e.fiscalPeriod.status} — rouvrir la période ou passer un OD manuel`;
    }

    plans.push({
      entryId: e.id, entryNumber: e.entryNumber, status: e.status,
      expenseNo: expense.number, chargeAccount: chargeLine.accountNumber,
      bankAccount: bankLine.accountNumber, vatAccount,
      amountHt, taxAmount, amountTtc, action, reason,
    });
  }

  if (plans.length === 0) {
    console.log('✓ Aucune écriture de dépense à rattraper. Comptabilité déjà conforme.\n');
    return;
  }

  // Rapport
  console.log(`${plans.length} écriture(s) concernée(s) :\n`);
  for (const p of plans) {
    const tag = p.action === 'in_place' ? '[SUR PLACE]' : p.action === 'reverse_repost' ? '[EXTOURNE+REPASSE]' : '[MANUEL]';
    console.log(
      `  ${tag} ${p.entryNumber} (${p.status}) — DEP ${p.expenseNo} : ` +
      `charge ${p.chargeAccount} ${p.amountTtc}→${p.amountHt}, TVA ${p.vatAccount} +${p.taxAmount}` +
      (p.reason ? `\n        ⚠ ${p.reason}` : ''),
    );
  }
  const counts = plans.reduce((m, p) => ((m[p.action] = (m[p.action] ?? 0) + 1), m), {} as Record<string, number>);
  console.log(`\nRésumé : sur place=${counts.in_place ?? 0}, extourne+repasse=${counts.reverse_repost ?? 0}, manuel=${counts.manual ?? 0}`);

  if (!APPLY) {
    console.log('\nDry-run : relancez avec --apply pour exécuter.\n');
    return;
  }

  // Application
  let done = 0, skipped = 0;
  for (const p of plans) {
    if (p.action === 'manual') { skipped++; continue; }
    try {
      await prisma.$transaction(async (tx) => {
        if (p.action === 'in_place') {
          // Ramène la charge au HT et insère la ligne de TVA déductible.
          const charge = await tx.journalEntryLine.findFirst({
            where: { journalEntryId: p.entryId, accountNumber: p.chargeAccount, debit: { gt: 0 } },
          });
          if (!charge) throw new Error('ligne de charge introuvable');
          await tx.journalEntryLine.update({
            where: { id: charge.id },
            data:  { debit: new Prisma.Decimal(p.amountHt) },
          });
          await tx.journalEntryLine.create({
            data: {
              journalEntryId: p.entryId,
              sortOrder:      1,
              accountNumber:  p.vatAccount,
              label:          `TVA déductible — DEP ${p.expenseNo}`,
              debit:          new Prisma.Decimal(p.taxAmount),
              credit:         new Prisma.Decimal(0),
            },
          });
          // Les totaux d'en-tête (TTC) restent inchangés — l'écriture reste équilibrée.
        } else {
          // Extourne + repassage pour une écriture définitive.
          const original = await tx.journalEntry.findUnique({
            where: { id: p.entryId }, include: { lines: true, journal: { select: { code: true } } },
          });
          if (!original) throw new Error('écriture introuvable');
          const jcode = original.journal.code;
          const now   = new Date();

          // 1) Extourne (contre-passe l'ancienne écriture TTC).
          const revNo = await nextEntryNumber(tx, jcode, now);
          await tx.journalEntry.create({
            data: {
              journalId: original.journalId, fiscalPeriodId: original.fiscalPeriodId,
              entryDate: now, accountingDate: now, entryNumber: revNo,
              label: `Extourne (rattrapage TVA) — ${original.label}`,
              sourceType: 'expense_vat_fix_reversal', sourceId: original.sourceId,
              totalDebit: original.totalCredit, totalCredit: original.totalDebit, status: 'draft',
              lines: { create: original.lines.map((l, i) => ({
                sortOrder: i, accountNumber: l.accountNumber, label: `Extourne — ${l.label}`,
                debit: l.credit, credit: l.debit,
              })) },
            },
          });
          await tx.journalEntry.update({ where: { id: original.id }, data: { status: 'cancelled' } });

          // 2) Repassage correct (HT + TVA / banque), en brouillon à revalider.
          const newNo = await nextEntryNumber(tx, jcode, now);
          await tx.journalEntry.create({
            data: {
              journalId: original.journalId, fiscalPeriodId: original.fiscalPeriodId,
              entryDate: original.entryDate, accountingDate: original.accountingDate ?? original.entryDate,
              entryNumber: newNo, label: original.label,
              sourceType: 'expense', sourceId: original.sourceId,
              totalDebit: new Prisma.Decimal(p.amountTtc), totalCredit: new Prisma.Decimal(p.amountTtc), status: 'draft',
              lines: { create: [
                { sortOrder: 0, accountNumber: p.chargeAccount, label: `DEP ${p.expenseNo}`,               debit: new Prisma.Decimal(p.amountHt),  credit: new Prisma.Decimal(0) },
                { sortOrder: 1, accountNumber: p.vatAccount,    label: `TVA déductible — DEP ${p.expenseNo}`, debit: new Prisma.Decimal(p.taxAmount), credit: new Prisma.Decimal(0) },
                { sortOrder: 2, accountNumber: p.bankAccount,   label: `Paiement — DEP ${p.expenseNo}`,      debit: new Prisma.Decimal(0),           credit: new Prisma.Decimal(p.amountTtc) },
              ] },
            },
          });
        }
      });
      done++;
      console.log(`  ✓ ${p.entryNumber} corrigée (${p.action})`);
    } catch (err) {
      skipped++;
      console.error(`  ✖ ${p.entryNumber} échec : ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nTerminé : ${done} corrigée(s), ${skipped} ignorée(s)/en échec.`);
  console.log('⚠ Les écritures repassées sont en BROUILLON : la DAF doit les revalider.\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
