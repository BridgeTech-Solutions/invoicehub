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
      for (let i = 0; i < lines.length; i += BATCH_SIZE) {
        const batch = lines.slice(i, i + BATCH_SIZE);

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

        const progress = Math.round(((i + BATCH_SIZE) / lines.length) * 100);
        await job.updateProgress(Math.min(progress, 99));
      }

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
      throw error;
    }
  }
}
