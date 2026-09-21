-- Budgets : généralisation « catégorie uniquement » → budget par COMPTE COMPTABLE
-- (classes 6 charges / 7 produits) avec dimensions optionnelles (catégorie, bureau)
-- et périodicité (annuel/trimestriel/mensuel). Socle du module de pilotage.
ALTER TABLE expense_budgets ADD COLUMN IF NOT EXISTS account_number VARCHAR(20);
ALTER TABLE expense_budgets ADD COLUMN IF NOT EXISTS office_id      UUID REFERENCES agency_offices(id) ON DELETE SET NULL;
ALTER TABLE expense_budgets ADD COLUMN IF NOT EXISTS period_type    VARCHAR(10) NOT NULL DEFAULT 'annual';
ALTER TABLE expense_budgets ADD COLUMN IF NOT EXISTS quarter        SMALLINT;

-- La catégorie devient une DIMENSION optionnelle (le budget peut cibler un compte
-- sans catégorie). On retire donc le NOT NULL et l'ancienne contrainte d'unicité
-- (catégorie, année, mois) — l'unicité multi-dimensions est contrôlée applicativement.
ALTER TABLE expense_budgets ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE expense_budgets DROP CONSTRAINT IF EXISTS expense_budgets_category_id_year_month_key; -- nom Prisma
ALTER TABLE expense_budgets DROP CONSTRAINT IF EXISTS uq_expense_budget;  -- nom schéma v3
ALTER TABLE expense_budgets DROP CONSTRAINT IF EXISTS chk_budget_month;   -- mois/trimestre gérés en applicatif

-- Reprise des budgets existants : on rattache le compte de la catégorie quand il existe.
UPDATE expense_budgets b
   SET account_number = c.accounting_account
  FROM expense_categories c
 WHERE b.category_id = c.id
   AND b.account_number IS NULL
   AND c.accounting_account IS NOT NULL;

-- Index de requêtage (réalisé/engagé filtrés par compte + année).
CREATE INDEX IF NOT EXISTS idx_expense_budgets_account_year ON expense_budgets (account_number, year);
