import { prisma } from '../config/database';
import { eventBus } from './eventBus';
import { notificationQueue } from '../jobs/queues';
import { logger } from '../core/middleware/requestLogger';

// ── WorkflowEngine ────────────────────────────────────────────────────────────

async function evaluateWorkflowRules(eventName: string, payload: Record<string, unknown>) {
  try {
    const rules = await prisma.workflowRule.findMany({
      where: { module: eventName.split('.')[0], isActive: true },
    });

    for (const rule of rules) {
      if (rule.triggerEvent !== eventName) continue;

      const actions = rule.actions as Array<{ type: string; userId?: string; message?: string; title?: string }>;
      for (const action of actions) {
        if (action.type === 'notify' && action.userId) {
          await notificationQueue.add('workflow-notification', {
            userId:  action.userId,
            type:    'system',
            title:   action.title   ?? `Règle: ${rule.name}`,
            message: action.message ?? `Événement ${eventName} déclenché`,
            data:    payload,
          });
        }
      }
    }
  } catch (err) {
    logger.warn('[WorkflowEngine] Erreur évaluation règles', { error: (err as Error).message, eventName });
  }
}

// ── WebhookDispatcher ─────────────────────────────────────────────────────────

async function dispatchWebhooks(eventName: string, payload: Record<string, unknown>) {
  try {
    const webhooks = await prisma.webhook.findMany({ where: { isActive: true } });

    for (const webhook of webhooks) {
      const events = webhook.events as string[];
      if (!events.includes(eventName) && !events.includes('*')) continue;

      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event:     eventName,
          payload:   payload as object,
        },
      });
    }
  } catch (err) {
    logger.warn('[WebhookDispatcher] Erreur dispatch webhooks', { error: (err as Error).message, eventName });
  }
}

// ── Enregistrement des listeners ──────────────────────────────────────────────

export function registerEventListeners(): void {
  eventBus.on('invoice.issued', async ({ invoiceId, amount, clientId, userId }) => {
    await evaluateWorkflowRules('invoice.issued', { invoiceId, amount, clientId, userId });
    await dispatchWebhooks('invoice.issued', { invoiceId, amount, clientId, userId });
  });

  eventBus.on('invoice.paid', async ({ invoiceId, paymentId }) => {
    await evaluateWorkflowRules('invoice.paid', { invoiceId, paymentId });
    await dispatchWebhooks('invoice.paid', { invoiceId, paymentId });
  });

  eventBus.on('invoice.cancelled', async ({ invoiceId, userId }) => {
    await evaluateWorkflowRules('invoice.cancelled', { invoiceId, userId });
    await dispatchWebhooks('invoice.cancelled', { invoiceId, userId });
  });

  eventBus.on('purchase_order.sent', async ({ purchaseOrderId, supplierId }) => {
    await evaluateWorkflowRules('purchase_order.sent', { purchaseOrderId, supplierId });
    await dispatchWebhooks('purchase_order.sent', { purchaseOrderId, supplierId });
  });

  eventBus.on('purchase_order.confirmed', async ({ purchaseOrderId }) => {
    await evaluateWorkflowRules('purchase_order.confirmed', { purchaseOrderId });
    await dispatchWebhooks('purchase_order.confirmed', { purchaseOrderId });
  });

  eventBus.on('purchase_order.received', async ({ purchaseOrderId }) => {
    await evaluateWorkflowRules('purchase_order.received', { purchaseOrderId });
    await dispatchWebhooks('purchase_order.received', { purchaseOrderId });
  });

  eventBus.on('supplier_invoice.validated', async ({ supplierInvoiceId, supplierId }) => {
    await evaluateWorkflowRules('supplier_invoice.validated', { supplierInvoiceId, supplierId });
    await dispatchWebhooks('supplier_invoice.validated', { supplierInvoiceId, supplierId });
  });

  eventBus.on('supplier_invoice.paid', async ({ supplierInvoiceId, amount }) => {
    await evaluateWorkflowRules('supplier_invoice.paid', { supplierInvoiceId, amount });
    await dispatchWebhooks('supplier_invoice.paid', { supplierInvoiceId, amount });
  });

  eventBus.on('expense.submitted', async ({ expenseId, amount, submittedById }) => {
    await evaluateWorkflowRules('expense.submitted', { expenseId, amount, submittedById });
    await dispatchWebhooks('expense.submitted', { expenseId, amount, submittedById });
  });

  eventBus.on('expense.approved', async ({ expenseId, amount, approvedById }) => {
    await evaluateWorkflowRules('expense.approved', { expenseId, amount, approvedById });
    await dispatchWebhooks('expense.approved', { expenseId, amount, approvedById });
  });

  eventBus.on('expense.paid', async ({ expenseId }) => {
    await evaluateWorkflowRules('expense.paid', { expenseId });
    await dispatchWebhooks('expense.paid', { expenseId });
  });

  eventBus.on('stock.low', async ({ productId, currentQty, minLevel }) => {
    await evaluateWorkflowRules('stock.low', { productId, currentQty, minLevel });
    await dispatchWebhooks('stock.low', { productId, currentQty, minLevel });
    try {
      const admins = await prisma.user.findMany({
        where: { role: { name: 'admin' }, deletedAt: null, status: 'active' },
        select: { id: true },
      });
      for (const admin of admins) {
        await notificationQueue.add('stock-alert', {
          userId:  admin.id,
          type:    'system',
          title:   'Alerte stock faible',
          message: `Produit en stock faible (qté: ${currentQty}, min: ${minLevel})`,
          data:    { productId, currentQty, minLevel },
        });
      }
    } catch (err) {
      logger.warn('[EventListeners] Erreur notification stock.low', { error: (err as Error).message });
    }
  });

  eventBus.on('user.role_changed', async ({ userId }) => {
    try {
      const { invalidateUserRbacCache } = await import('./rbacCache');
      await invalidateUserRbacCache(userId);
    } catch (err) {
      logger.warn('[EventListeners] Erreur invalidation cache RBAC', { error: (err as Error).message });
    }
  });

  logger.info('[EventBus] Listeners enregistrés');
}
