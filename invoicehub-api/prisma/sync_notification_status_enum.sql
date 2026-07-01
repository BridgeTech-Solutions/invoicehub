-- Aligne l'enum PostgreSQL `notification_status` sur schema.prisma.
-- Idempotent : `ADD VALUE IF NOT EXISTS` → réexécutable sans effet de bord.
-- Nécessaire car la base a été créée via `db push` et certaines valeurs v3
-- (modules fournisseurs, dépenses, stock, banque, compta…) n'ont jamais été
-- ajoutées en base, ce qui fait échouer les notifications de ces types.
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'purchase_order_created';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'purchase_order_approved';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'purchase_order_rejected';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'supplier_invoice_received';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'supplier_invoice_due';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'expense_submitted';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'expense_approved';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'expense_rejected';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'low_stock_alert';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'bank_reconciliation_pending';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'fiscal_period_closing';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'role_changed';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'budget_exceeded';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'accounting_entry_failed';
