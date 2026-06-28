-- Migration corrective : intitulés tronqués du plan comptable (classes 6 & 7)
-- Les comptes feuilles 601x/602x/701x..706x n'avaient gardé que le sous-qualificatif
-- (« dans la Région », « hors Région », « aux entités du groupe… ») + un marqueur
-- de note « (1) », sans le nom du compte parent -> affichage incompréhensible
-- (ex. « 7011 · dans la Région » au lieu de « Ventes de marchandises dans la région »).
--
-- Correction : on préfixe par le nom du parent (mis en casse propre) et on retire
-- le « (1) » de note de bas de page.
-- Idempotent : après exécution, les noms ne matchent plus le motif -> relançable sans effet.
UPDATE chart_of_accounts c
SET name = (upper(left(p.name, 1)) || lower(substr(p.name, 2)))
           || ' ' || regexp_replace(c.name, '\s*\(1\)\s*$', '')
FROM chart_of_accounts p
WHERE c.parent_account_number = p.account_number
  AND c.name ~ '^(dans la Région|hors Région|aux entités du groupe (dans|hors) la Région)( \(1\))?$';
