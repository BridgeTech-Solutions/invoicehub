-- Compte propriétaire protégé (super-admin intouchable)
-- Ajoute la colonne is_owner et désigne le compte propriétaire.
-- Un compte is_owner = true ne peut être ni suspendu, ni archivé, ni voir son
-- rôle/statut modifié par un autre utilisateur (seul lui-même peut modifier ses données).

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;

-- Désigne le propriétaire (un seul compte attendu)
UPDATE users SET is_owner = true WHERE email = 'admin@bts.cm';
