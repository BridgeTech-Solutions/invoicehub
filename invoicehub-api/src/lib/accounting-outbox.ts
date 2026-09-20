import { PrismaClient } from '@prisma/client';
import {
  onInvoiceIssued, onPaymentReceived, onExpensePaid,
  onSupplierInvoiceValidated, onSupplierPaymentMade, onInvoiceCancelled,
} from './accountingEngine';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

// Hooks du moteur rejouables à partir d'un simple (sourceId, tx). L'écriture créée
// porte un sourceType connu → on peut vérifier son existence après rejeu.
export const OUTBOX_HOOKS: Record<string, (id: string, tx: Tx) => Promise<void>> = {
  onInvoiceIssued,
  onPaymentReceived,
  onExpensePaid,
  onSupplierInvoiceValidated,
  onSupplierPaymentMade,
  onInvoiceCancelled,
};

// sourceType de l'écriture réellement créée par chaque hook — sert de signal de
// SUCCÈS (les hooks non bloquants avalent leur erreur : on ne peut pas se fier au
// retour, on vérifie donc que la pièce comptable existe bien).
const EXPECTED_SOURCE_TYPE: Record<string, string> = {
  onInvoiceIssued:            'invoice',
  onPaymentReceived:          'payment',
  onExpensePaid:              'expense',
  onSupplierInvoiceValidated: 'supplier_invoice',
  onSupplierPaymentMade:      'supplier_payment',
  onInvoiceCancelled:         'invoice_reversal',
};

/**
 * Enregistre l'intention de comptabiliser une pièce. À appeler DANS la transaction
 * de l'opération métier (étape 3 du câblage) → atomicité pièce ↔ événement.
 * Idempotent : un même (hook, sourceId) n'est enregistré qu'une fois.
 */
export async function recordAccountingEvent(
  tx: Tx, hook: string, sourceType: string, sourceId: string,
): Promise<void> {
  await tx.accountingEvent.upsert({
    where:  { uq_accounting_event: { hook, sourceId } },
    create: { hook, sourceType, sourceId, status: 'pending' },
    update: {}, // déjà enregistré → ne rien changer
  });
}

export interface OutboxSweepResult { processed: number; done: number; retry: number; failed: number; }

/**
 * Rejoue les événements dus (status 'pending', échéance atteinte). Réutilisable par
 * le worker cron ET par l'action manuelle « régénérer les écritures manquantes ».
 * Le succès est constaté par l'EXISTENCE de l'écriture (les hooks étant idempotents,
 * un rejeu sur une pièce déjà comptabilisée est un no-op → marqué 'done').
 */
export async function sweepAccountingOutbox(prisma: PrismaClient, limit = 50): Promise<OutboxSweepResult> {
  const now = new Date();
  const events = await prisma.accountingEvent.findMany({
    where:   { status: 'pending', nextRetryAt: { lte: now } },
    orderBy: { nextRetryAt: 'asc' },
    take:    limit,
  });

  let done = 0, retry = 0, failed = 0;

  for (const ev of events) {
    const hook = OUTBOX_HOOKS[ev.hook];
    if (!hook) {
      await prisma.accountingEvent.update({
        where: { id: ev.id },
        data:  { status: 'failed', lastError: `Hook inconnu : ${ev.hook}` },
      });
      failed++;
      continue;
    }

    // On (re)joue le hook. Les hooks non bloquants avalent leur erreur ; les
    // bloquants la lèvent → on l'absorbe ici et on tranche via la vérif d'existence.
    try {
      await prisma.$transaction(async (tx) => { await hook(ev.sourceId, tx as unknown as Tx); });
    } catch { /* on juge sur l'existence de l'écriture ci-dessous */ }

    const exists = await prisma.journalEntry.findFirst({
      where:  { sourceType: EXPECTED_SOURCE_TYPE[ev.hook] ?? ev.sourceType, sourceId: ev.sourceId, status: { not: 'cancelled' } },
      select: { id: true },
    });

    if (exists) {
      await prisma.accountingEvent.update({
        where: { id: ev.id },
        data:  { status: 'done', lastError: null },
      });
      done++;
    } else {
      const attempts   = ev.attempts + 1;
      const exhausted  = attempts >= ev.maxAttempts;
      const backoffMin = Math.min(120, 2 ** attempts); // exponentiel, plafonné à 2 h
      await prisma.accountingEvent.update({
        where: { id: ev.id },
        data:  {
          attempts,
          status:      exhausted ? 'failed' : 'pending',
          lastError:   'Écriture non créée (config comptable incomplète ou période fermée ?) — voir notifications.',
          nextRetryAt: new Date(now.getTime() + backoffMin * 60_000),
        },
      });
      if (exhausted) failed++; else retry++;
    }
  }

  return { processed: events.length, done, retry, failed };
}
