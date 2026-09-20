-- ============================================================================
-- Migration : idempotence garantie par la base (#7) + immutabilite des ecritures
--             verrouillees (#6). Idempotente, rejouable.
-- A executer :  psql -U postgres -d invoicehub -f prisma/add_journal_entry_immutability_idempotency.sql
-- ============================================================================

-- ── #7 : discriminant d'idempotence ───────────────────────────────────────────
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS entry_kind VARCHAR(30);

-- Une seule ecriture ACTIVE par (source_type, source_id, entry_kind). Partiel :
-- exclut les ecritures annulees (contre-passees) et les saisies sans source.
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entry_source_kind
    ON journal_entries (source_type, source_id, entry_kind)
    WHERE status <> 'cancelled'
      AND source_type IS NOT NULL AND source_id IS NOT NULL AND entry_kind IS NOT NULL;

-- ── #6 : immutabilite des ecritures verrouillees (locked) ─────────────────────
CREATE OR REPLACE FUNCTION fn_block_locked_journal_entry() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'locked' THEN
        RAISE EXCEPTION 'Ecriture verrouillee (%): modification/suppression interdite. Corrigez par contre-passation.', OLD.entry_number;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_locked_journal_entry ON journal_entries;
CREATE TRIGGER trg_block_locked_journal_entry
    BEFORE UPDATE OR DELETE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION fn_block_locked_journal_entry();

CREATE OR REPLACE FUNCTION fn_block_locked_journal_line() RETURNS trigger AS $$
DECLARE parent_status text;
BEGIN
    SELECT status INTO parent_status FROM journal_entries
        WHERE id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
    IF parent_status = 'locked' THEN
        RAISE EXCEPTION 'Ligne d''une ecriture verrouillee : modification/suppression interdite.';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_locked_journal_line ON journal_entry_lines;
CREATE TRIGGER trg_block_locked_journal_line
    BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_lines
    FOR EACH ROW EXECUTE FUNCTION fn_block_locked_journal_line();
