import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('cleanup')
export class CleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanupProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.cleanPendingBankImports();
  }

  // Supprime les imports bancaires en statut "pending" depuis plus de 2h
  // (wizard abandonné en cours de route — l'utilisateur n'a jamais confirmé)
  private async cleanPendingBankImports(): Promise<void> {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const deleted = await this.prisma.bankStatementImport.deleteMany({
      where: {
        status:     'pending',
        importedAt: { lt: cutoff },
      },
    });

    if (deleted.count > 0) {
      this.logger.log(`Nettoyage imports bancaires : ${deleted.count} import(s) pending supprimé(s)`);
    }
  }
}
