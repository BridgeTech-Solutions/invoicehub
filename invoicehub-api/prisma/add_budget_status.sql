-- Statut de budget pour la gouvernance (workflow d'approbation opt-in) :
-- 'draft' = en attente d'activation, ne s'applique pas au contrôle a priori ;
-- 'active' = validé, pris en compte. Défaut 'active' → aucun changement de
-- comportement pour les budgets existants (l'approbation est activée via
-- company_settings.budget_control.requireApproval).
ALTER TABLE expense_budgets ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'active';
