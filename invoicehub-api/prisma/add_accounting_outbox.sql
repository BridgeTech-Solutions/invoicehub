-- ============================================================================
-- Migration : outbox comptable (#3) — garantit qu'aucune piece ne reste sans
--             ecriture. Idempotente, rejouable.
-- A executer :  psql -U postgres -d invoicehub -f prisma/add_accounting_outbox.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounting_events (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    hook          VARCHAR(60)  NOT NULL,              -- ex. 'onInvoiceIssued'
    source_type   VARCHAR(50)  NOT NULL,
    source_id     UUID         NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | done | failed
    attempts      INT          NOT NULL DEFAULT 0,
    max_attempts  INT          NOT NULL DEFAULT 10,
    last_error    TEXT,
    next_retry_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_accounting_event UNIQUE (hook, source_id)
);

CREATE INDEX IF NOT EXISTS idx_accounting_events_due
    ON accounting_events (status, next_retry_at);

-- Réutilise le trigger générique d'updated_at s'il existe (present dans le schema v3).
DROP TRIGGER IF EXISTS tg_accounting_events_updated_at ON accounting_events;
CREATE TRIGGER tg_accounting_events_updated_at
    BEFORE UPDATE ON accounting_events
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE accounting_events IS 'Outbox comptable : un evenement par (hook, piece), rejoue par un worker jusqu''a ce que l''ecriture existe. Les hooks du moteur etant idempotents, le rejeu est sur.';
