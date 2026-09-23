-- Inventaire physique (comptage + recalage) — 2026-09-23
-- Sessions d'inventaire + lignes de comptage. Obligation SYSCOHADA (art. 17).

DO $$ BEGIN
  CREATE TYPE inventory_session_status AS ENUM ('draft', 'in_progress', 'validated', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS inventory_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference     VARCHAR(50) NOT NULL UNIQUE,
  status        inventory_session_status NOT NULL DEFAULT 'draft',
  notes         TEXT,
  category_id   UUID,
  created_by    UUID NOT NULL,
  validated_by  UUID,
  validated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_count_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  theoretical_qty NUMERIC(10,3) NOT NULL,
  unit_cost_ht    NUMERIC(15,2),
  counted_qty     NUMERIC(10,3),
  movement_id     UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_count_lines_session ON inventory_count_lines(session_id);
