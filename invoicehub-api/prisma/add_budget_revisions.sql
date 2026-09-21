-- Historique des révisions de budget (budget initial vs révisé) : chaque changement
-- de montant est journalisé (ancien → nouveau, motif, auteur, date).
CREATE TABLE IF NOT EXISTS budget_revisions (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    budget_id       UUID          NOT NULL REFERENCES expense_budgets(id) ON DELETE CASCADE,
    previous_amount NUMERIC(15,2) NOT NULL,
    new_amount      NUMERIC(15,2) NOT NULL,
    reason          TEXT,
    changed_by      UUID          REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budget_revisions_budget ON budget_revisions (budget_id, created_at DESC);
