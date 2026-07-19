/**
 * Rattrapage — dates des transactions bancaires importées (décalage d'un jour).
 *
 * CONTEXTE
 * Avant le correctif de `bank.parsers.parseDate`, les dates de relevé étaient
 * construites avec `new Date(y, m, d)`, c'est-à-dire minuit en heure LOCALE. Sur un
 * serveur à l'est de UTC — le Cameroun est en UTC+1 — l'écriture dans une colonne
 * `@db.Date` reculait la date d'un jour :
 *
 *     CSV "01/04/2026"  →  new Date(2026,3,1) = 2026-03-31T23:00:00Z  →  stocké 2026-03-31
 *
 * Conséquences : dates fausses à l'affichage, ET filtrage par période des
 * rapprochements qui exclut les mouvements de début de période.
 *
 * SOURCE DE VÉRITÉ
 * On ne devine pas le décalage : chaque import conserve dans `previewData` le
 * `rawRow` de chaque ligne, donc la date TELLE QU'ÉCRITE DANS LE FICHIER d'origine.
 * Le script re-parse cette chaîne avec le parseur corrigé (construction UTC) et
 * compare à la valeur stockée. Une transaction déjà correcte est laissée intacte —
 * le script est donc idempotent et rejouable sans risque.
 *
 * CE QUI EST CORRIGÉ
 *   • bank_transactions.transaction_date et value_date
 *   • bank_transactions.content_hash — recalculé sur la date corrigée. INDISPENSABLE :
 *     l'empreinte intègre la date, donc sans ce recalcul un réimport du même relevé
 *     ne reconnaîtrait plus ses propres lignes et créerait des doublons.
 *   • bank_statement_imports.period_start / period_end — recalculés sur les dates
 *     corrigées.
 *
 * CE QUI N'EST PAS TOUCHÉ
 *   • `previewData` : c'est la trace d'audit de ce qui a été parsé à l'époque. On la
 *     conserve telle quelle. Elle ne sert pas à la déduplication des imports futurs.
 *   • Les transactions sans `importId` (saisie manuelle) : aucun `rawRow` de
 *     référence, donc aucune preuve de décalage. Elles passent par l'API avec une
 *     date ISO et ne sont pas concernées par le bug. Signalées, jamais modifiées.
 *
 * SÉCURITÉ
 *   • Dry-run par défaut : n'écrit RIEN, affiche le plan d'action.
 *   • `--apply` pour exécuter. Chaque import est corrigé dans UNE transaction.
 *   • Collision d'empreinte détectée avant écriture (contrainte unique
 *     [bankAccountId, contentHash]) : la ligne est signalée et laissée intacte.
 *   • Impact sur les rapprochements ouverts signalé explicitement.
 *
 * Usage :
 *   npx ts-node prisma/fix-bank-transaction-dates.ts           (dry-run)
 *   npx ts-node prisma/fix-bank-transaction-dates.ts --apply   (applique)
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { parseDate, computeContentHash } from '../src/modules/bank/bank.parsers';

const prisma = new PrismaClient();
const APPLY  = process.argv.includes('--apply');

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '—');

interface Plan {
  txId:        string;
  label:       string;
  rawDate:     string;
  storedDate:  Date;
  fixedDate:   Date;
  storedValue: Date | null;
  fixedValue:  Date | null;
  oldHash:     string | null;
  newHash:     string;
  collision:   boolean;
  reconciled:  boolean;
}

async function main() {
  console.log(`\n=== Rattrapage dates bancaires — ${APPLY ? 'MODE APPLICATION' : 'DRY-RUN (aucune écriture)'} ===\n`);

  const imports = await prisma.bankStatementImport.findMany({
    where:  { previewData: { not: Prisma.DbNull } },
    select: { id: true, filename: true, bankAccountId: true, previewData: true,
              detectedFormat: true, periodStart: true, periodEnd: true },
  });

  if (imports.length === 0) {
    console.log("Aucun import porteur de previewData : rien à rattraper.\n");
    return;
  }

  let totalShifted = 0, totalOk = 0, totalUnmatched = 0, totalCollisions = 0;
  const plansByImport = new Map<string, Plan[]>();
  const touchedAccounts = new Set<string>();

  for (const imp of imports) {
    const preview = imp.previewData as any;
    const fmt     = imp.detectedFormat as any;
    const samples: any[] = preview?.sampleTransactions ?? [];
    const dateCol  = fmt?.columnMapping?.date;
    const valueCol = fmt?.columnMapping?.valueDate;
    const dateFmt  = fmt?.dateFormat ?? 'DD/MM/YYYY';

    if (!dateCol || samples.length === 0) {
      console.log(`⚠ Import ${imp.filename} (${imp.id.slice(0, 8)}) : mapping ou échantillons absents — ignoré.`);
      continue;
    }

    // Appariement transaction ↔ ligne de CSV d'origine.
    //
    // L'empreinte est le chemin rapide, mais elle ne suffit pas : le script la
    // recalcule quand il corrige une date, alors que `previewData` conserve
    // volontairement les anciennes. Après une première application, l'appariement
    // par empreinte échouerait donc systématiquement, et le script rapporterait
    // « non rattachées » au lieu de « déjà correctes » — une fausse quiétude, pas
    // une vérification. D'où le repli sur (libellé, montant, sens), stable dans le
    // temps, qui garde le script capable de se re-vérifier après coup.
    const byHash = new Map<string, any>();
    const byBiz  = new Map<string, any>();
    const bizKey = (label: string, amount: number, type: string) =>
      `${label}|${Number(amount)}|${type}`;
    for (const s of samples) {
      if (s?.contentHash) byHash.set(s.contentHash, s);
      if (s?.label != null) byBiz.set(bizKey(s.label, s.amount, s.type), s);
    }

    const txns = await prisma.bankTransaction.findMany({
      where:  { importId: imp.id },
      select: { id: true, label: true, amount: true, type: true, contentHash: true,
                transactionDate: true, valueDate: true, bankAccountId: true,
                reconciliationStatus: true },
    });

    const plans: Plan[] = [];

    for (const tx of txns) {
      const sample = (tx.contentHash ? byHash.get(tx.contentHash) : undefined)
                  ?? byBiz.get(bizKey(tx.label, Number(tx.amount), tx.type));
      if (!sample?.rawRow) { totalUnmatched++; continue; }

      const rawDate = String(sample.rawRow[dateCol] ?? '').trim();
      const fixed   = rawDate ? parseDate(rawDate, dateFmt) : null;
      if (!fixed || isNaN(fixed.getTime())) { totalUnmatched++; continue; }

      if (iso(fixed) === iso(tx.transactionDate)) { totalOk++; continue; }

      const rawValue   = valueCol ? String(sample.rawRow[valueCol] ?? '').trim() : '';
      const fixedValue = rawValue ? parseDate(rawValue, dateFmt) : null;

      const newHash = computeContentHash(
        tx.bankAccountId, fixed, Number(tx.amount), tx.type as 'debit' | 'credit', tx.label,
      );

      // La contrainte unique [bankAccountId, contentHash] doit tenir après correction.
      const clash = newHash !== tx.contentHash
        ? await prisma.bankTransaction.findFirst({
            where:  { bankAccountId: tx.bankAccountId, contentHash: newHash, id: { not: tx.id } },
            select: { id: true },
          })
        : null;

      if (clash) totalCollisions++; else totalShifted++;
      touchedAccounts.add(tx.bankAccountId);

      plans.push({
        txId: tx.id, label: tx.label, rawDate,
        storedDate: tx.transactionDate, fixedDate: fixed,
        storedValue: tx.valueDate, fixedValue: fixedValue && !isNaN(fixedValue.getTime()) ? fixedValue : null,
        oldHash: tx.contentHash, newHash,
        collision: !!clash,
        reconciled: tx.reconciliationStatus === 'reconciled',
      });
    }

    if (plans.length) plansByImport.set(imp.id, plans);
  }

  // ── Rapport ────────────────────────────────────────────────────────────────

  for (const imp of imports) {
    const plans = plansByImport.get(imp.id);
    if (!plans?.length) continue;
    console.log(`\n── ${imp.filename} (import ${imp.id.slice(0, 8)}, compte ${imp.bankAccountId.slice(0, 8)})`);
    console.log(`   période stockée : ${iso(imp.periodStart)} → ${iso(imp.periodEnd)}`);
    for (const p of plans.slice(0, 5)) {
      const flags = [p.collision ? 'COLLISION' : null, p.reconciled ? 'RAPPROCHÉE' : null]
        .filter(Boolean).join(' ');
      console.log(`   CSV "${p.rawDate}" : ${iso(p.storedDate)} → ${iso(p.fixedDate)}  ${p.label.slice(0, 34)}${flags ? '  [' + flags + ']' : ''}`);
    }
    if (plans.length > 5) console.log(`   … et ${plans.length - 5} autres lignes`);
  }

  console.log('\n─────────────────────────────────────────────');
  console.log(`  à corriger      : ${totalShifted}`);
  console.log(`  déjà correctes  : ${totalOk}`);
  console.log(`  collisions      : ${totalCollisions}  (laissées intactes)`);
  console.log(`  non rattachées  : ${totalUnmatched}  (pas de rawRow correspondant)`);

  const manual = await prisma.bankTransaction.count({ where: { importId: null } });
  if (manual) console.log(`  saisie manuelle : ${manual}  (hors périmètre — jamais modifiées)`);

  if (totalShifted === 0 && totalCollisions === 0) {
    console.log('\n✓ Aucune date à rattraper.\n');
    return;
  }

  // Impact sur les rapprochements : une date qui bouge peut faire entrer ou sortir
  // un mouvement d'une période de rapprochement.
  const recs = await prisma.bankReconciliation.findMany({
    where:  { bankAccountId: { in: [...touchedAccounts] } },
    select: { id: true, periodStart: true, periodEnd: true, status: true },
  });
  if (recs.length) {
    console.log('\n⚠ Rapprochements sur les comptes touchés — les totaux de période peuvent bouger :');
    for (const r of recs) {
      console.log(`   ${iso(r.periodStart)} → ${iso(r.periodEnd)}  [${r.status}]`);
    }
    const done = recs.filter(r => r.status === 'completed');
    if (done.length) {
      console.log(`   ${done.length} rapprochement(s) CLÔTURÉ(S) : à revérifier manuellement après correction.`);
    }
  }

  if (!APPLY) {
    console.log('\nDry-run : relancez avec --apply pour exécuter.\n');
    return;
  }

  // ── Application ────────────────────────────────────────────────────────────

  let applied = 0;
  for (const [importId, plans] of plansByImport) {
    const doable = plans.filter(p => !p.collision);
    if (!doable.length) continue;

    await prisma.$transaction(async (tx) => {
      for (const p of doable) {
        await tx.bankTransaction.update({
          where: { id: p.txId },
          data: {
            transactionDate: p.fixedDate,
            valueDate:       p.fixedValue ?? undefined,
            contentHash:     p.newHash,
          },
        });
        applied++;
      }

      // Période de l'import recalculée sur l'ensemble des dates désormais en base
      const bounds = await tx.bankTransaction.aggregate({
        where: { importId },
        _min:  { transactionDate: true },
        _max:  { transactionDate: true },
      });
      if (bounds._min.transactionDate && bounds._max.transactionDate) {
        await tx.bankStatementImport.update({
          where: { id: importId },
          data:  { periodStart: bounds._min.transactionDate, periodEnd: bounds._max.transactionDate },
        });
      }
    });
  }

  console.log(`\n✓ ${applied} transaction(s) recalées, périodes d'import recalculées.`);
  if (totalCollisions) {
    console.log(`⚠ ${totalCollisions} ligne(s) laissées intactes pour cause de collision d'empreinte — à traiter à la main.`);
  }
  console.log('⚠ Vérifiez les rapprochements listés ci-dessus : leurs totaux ont pu changer.\n');
}

main()
  .catch((e) => { console.error('\n✗ Échec :', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
