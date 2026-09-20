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
  createdById?:    string | null;
}

// Les lignes ne transitent plus par Redis : le worker les relit depuis `previewData`
// (colonne JSONB de l'import) à partir de l'importId — payload de job minimal.
interface BankImportJobData {
  importId:      string;
  bankAccountId: string;
  userId?:       string | null;
}

// Forme d'une transaction telle que stockée dans previewData.sampleTransactions.
interface PreviewTxn {
  transactionDate: string | Date;
  valueDate?:      string | Date | null;
  label:           string;
  amount:          number;
  type:            'debit' | 'credit';
  reference?:      string | null;
  balanceAfter?:   number | null;
  contentHash:     string;
}

@Processor(BANK_IMPORT_QUEUE)
export class BankImportProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<BankImportJobData>): Promise<void> {
    const { importId, bankAccountId, userId } = job.data;

    // Relecture des lignes depuis la base (previewData) plutôt que depuis le job.
    const rec = await this.prisma.bankStatementImport.findUnique({
      where:  { id: importId },
      select: { previewData: true, importedById: true },
    });
    const preview = (rec?.previewData ?? {}) as { sampleTransactions?: PreviewTxn[] };
    const src = preview.sampleTransactions ?? [];
    const creator = userId ?? rec?.importedById ?? null;
    const toIso = (v: string | Date | null | undefined): string | undefined =>
      v == null ? undefined : (v instanceof Date ? v.toISOString() : String(v));
    const lines: ImportLine[] = src.map((t) => ({
      bankAccountId,
      transactionDate: toIso(t.transactionDate)!,
      valueDate:       toIso(t.valueDate),
      label:           t.label,
      amount:          t.amount,
      type:            t.type,
      reference:       t.reference   ?? undefined,
      balanceAfter:    t.balanceAfter ?? undefined,
      contentHash:     t.contentHash,
      source:          'csv_import',
      importId,
      createdById:     creator,
    }));

    const BATCH_SIZE = 100;
    let totalImported = 0;
    // Empreintes déjà retenues, TOUS LOTS CONFONDUS : deux lignes identiques peuvent
    // se trouver de part et d'autre d'une frontière de lot. Sans cette mémoire,
    // `createMany({ skipDuplicates: true })` en écarterait une tout en la comptant
    // au solde.
    const seenHashes = new Set<string>();

    try {
      for (let i = 0; i < lines.length; i += BATCH_SIZE) {
        const batch = lines.slice(i, i + BATCH_SIZE);

        const hashes = batch.map(l => l.contentHash);

        // Tout dans UNE transaction verrouillée par compte : verrou consultatif →
        // vérification des doublons → création → incrément du solde. Le verrou
        // sérialise les imports concurrents sur le même compte, si bien qu'aucune
        // insertion ne s'intercale entre la vérification et le `createMany` :
        // `toCreate` == lignes réellement créées, donc le delta de solde est exact
        // (avant : delta sur `toCreate` alors que `skipDuplicates` pouvait en écarter
        // sous une course → dérive). Par lot → reste cohérent même en cas de crash.
        const count = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bankAccountId}))`;

          const existing = await tx.bankTransaction.findMany({
            where:  { bankAccountId, contentHash: { in: hashes } },
            select: { contentHash: true },
          });
          const existingSet = new Set(existing.map(e => e.contentHash!));

          const toCreate = batch
            .filter((l) => {
              if (existingSet.has(l.contentHash) || seenHashes.has(l.contentHash)) return false;
              seenHashes.add(l.contentHash);
              return true;
            })
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

          if (toCreate.length === 0) return 0;

          const result = await tx.bankTransaction.createMany({ data: toCreate, skipDuplicates: true });
          const delta = toCreate.reduce(
            (acc, l) => acc + (l.type === 'credit' ? l.amount : -l.amount), 0,
          );
          await tx.bankAccount.update({
            where: { id: bankAccountId },
            data:  { currentBalance: { increment: delta } },
          });
          return result.count;
        });
        totalImported += count;

        const progress = Math.round(((i + BATCH_SIZE) / lines.length) * 100);
        await job.updateProgress(Math.min(progress, 99));
      }

      await this.prisma.bankStatementImport.update({
        where: { id: importId },
        data:  {
          status:         'completed',
          processedAt:    new Date(),
          nbTransactions: totalImported,
          nbUnmatched:    totalImported,
        },
      });

      await job.updateProgress(100);

    } catch (error) {
      await this.prisma.bankStatementImport.update({
        where: { id: importId },
        data:  {
          status:       'failed',
          errorMessage: error instanceof Error ? error.message : 'Erreur inconnue',
        },
      });
      throw error;
    }
  }
}
