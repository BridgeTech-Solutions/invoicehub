import { EventEmitter } from 'events';

type BridgeEvents = {
  'invoice.issued': { invoiceId: string; amount: number; clientId: string; userId: string };
  'invoice.paid': { invoiceId: string; paymentId: string };
  'invoice.cancelled': { invoiceId: string; userId: string };
  'proforma.sent': { proformaId: string; clientId: string };
  'proforma.accepted': { proformaId: string };
  'purchase_order.sent': { purchaseOrderId: string; supplierId: string };
  'purchase_order.confirmed': { purchaseOrderId: string };
  'purchase_order.received': { purchaseOrderId: string };
  'supplier_invoice.validated': { supplierInvoiceId: string; supplierId: string };
  'supplier_invoice.paid': { supplierInvoiceId: string; amount: number };
  'expense.submitted': { expenseId: string; amount: number; submittedById: string };
  'expense.approved': { expenseId: string; amount: number; approvedById: string };
  'expense.paid': { expenseId: string };
  'payment.received': { paymentId: string; invoiceId: string; amount: number };
  'stock.low': { productId: string; currentQty: number; minLevel: number };
  'user.created': { userId: string };
  'user.role_changed': { userId: string; oldRoleId: string; newRoleId: string };
  'webhook.trigger': { event: string; payload: unknown };
};

type EventMap = {
  [K in keyof BridgeEvents]: BridgeEvents[K];
};

class TypedEventEmitter extends EventEmitter {
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): boolean {
    return super.emit(event as string, payload);
  }

  on<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): this {
    return super.on(event as string, listener);
  }

  once<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): this {
    return super.once(event as string, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): this {
    return super.off(event as string, listener);
  }
}

export const eventBus = new TypedEventEmitter();
eventBus.setMaxListeners(50);
