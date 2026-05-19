import { Job } from 'bullmq';
import { prisma } from '../../config/database';

export interface BankImportJobData {
  importId:      string;
  bankAccountId: string;
  lines: Array<{
    bankAccountId:   string;
    transactionDate: string; // ISO string
    valueDate?:      string;
    label:           string;
    amount:          number;
    type:            'debit' | 'credit';
    reference?:      string;
    balanceAfter?:   number;
    contentHash:     string;
    source:          string;
    importId:        string;
    createdById?:    string;
  }>;
}

export async function processBankImportJob(job: Job<BankImportJobData>): Promise<void> {
  const { importId, bankAccountId, lines } = job.data;
  let imported = 0;

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < lines.length; i += 100) {
      const batch = lines.slice(i, i + 100).map(l => ({
        ...l,
        transactionDate: new Date(l.transactionDate),
        valueDate:       l.valueDate ? new Date(l.valueDate) : undefined,
      }));

      const result = await tx.bankTransaction.createMany({
        data:           batch,
        skipDuplicates: true,
      });
      imported += result.count;
      await job.updateProgress(Math.round((imported / lines.length) * 100));
    }

    const net = lines.reduce((s, t) =>
      s + (t.type === 'credit' ? t.amount : -t.amount), 0);

    await tx.bankAccount.update({
      where: { id: bankAccountId },
      data:  { currentBalance: { increment: net } },
    });

    await tx.bankStatementImport.update({
      where: { id: importId },
      data:  {
        status:         'completed',
        nbTransactions: imported,
        nbUnmatched:    imported,
        processedAt:    new Date(),
      },
    });
  });
}
