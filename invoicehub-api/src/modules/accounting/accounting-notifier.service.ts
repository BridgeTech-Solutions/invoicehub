import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { broadcastNotification } from '../../lib/broadcast';
import { setAccountingFailureHandler, type AccountingFailure } from '../../lib/accountingEngine';
import type { NotificationJobData } from '../../jobs/job-types';

// Libellés lisibles des opérations comptables auto (par fonction du moteur).
const OP_LABELS: Record<string, string> = {
  onInvoiceIssued:    'Émission de facture',
  onPaymentReceived:  'Paiement client',
  onPaymentDeleted:   'Annulation de paiement',
  onInvoiceCancelled: 'Annulation / avoir de facture',
  onExpensePaid:      'Paiement de dépense',
  onStockMovement:    'Mouvement de stock',
  onEscompteAccorde:  'Escompte de règlement',
};

/**
 * Option B — comptabilité non bloquante mais visible.
 * Branche un observateur sur le moteur comptable : quand une écriture auto échoue
 * (côté client/stock, qui n'interrompt pas l'opération métier), on prévient les
 * personnes ayant le droit `accounting:write` en in-app + email, au lieu de
 * perdre l'information silencieusement.
 */
@Injectable()
export class AccountingNotifierService implements OnModuleInit, OnModuleDestroy {
  // Anti-spam : on ne renvoie pas la même cause (fonction + motif) plus d'une
  // fois par fenêtre, sinon un paramètre manquant inonderait la DAF (une notif
  // par facture/paiement). On regroupe par problème, pas par pièce.
  private readonly recent = new Map<string, number>();
  private static readonly DEDUP_MS = 10 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notification') private readonly notifQueue: Queue<NotificationJobData>,
  ) {}

  onModuleInit(): void {
    setAccountingFailureHandler((f) => { void this.notify(f); });
  }

  onModuleDestroy(): void {
    setAccountingFailureHandler(null);
  }

  private async notify(f: AccountingFailure): Promise<void> {
    try {
      const now = Date.now();
      const key = `${f.fn}|${f.error}`;
      const last = this.recent.get(key);
      if (last && now - last < AccountingNotifierService.DEDUP_MS) return;
      this.recent.set(key, now);
      if (this.recent.size > 200) {
        for (const [k, t] of this.recent) {
          if (now - t > AccountingNotifierService.DEDUP_MS) this.recent.delete(k);
        }
      }

      const op = OP_LABELS[f.fn] ?? f.fn;
      await broadcastNotification(
        this.prisma as never,
        this.notifQueue,
        {
          type:    'accounting_entry_failed',
          title:   'Écriture comptable non générée',
          message: `L'écriture pour « ${op} »${f.sourceId ? ` (réf. ${f.sourceId})` : ''} n'a pas pu être générée : ${f.error}. L'opération a bien été enregistrée ; l'écriture doit être saisie ou régénérée manuellement.`,
          data: {
            operation:  op,
            sourceType: f.sourceType ?? '',
            sourceId:   f.sourceId ?? '',
            error:      f.error,
          },
        },
        { permission: 'accounting:write' },
      );
    } catch (e) {
      // La notification ne doit jamais casser quoi que ce soit.
      console.error('[AccountingNotifier]', e instanceof Error ? e.message : e);
    }
  }
}
