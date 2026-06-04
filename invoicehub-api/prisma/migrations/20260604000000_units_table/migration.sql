CREATE TABLE units (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  code         VARCHAR(20)  NOT NULL UNIQUE,
  label        VARCHAR(50)  NOT NULL,
  label_plural VARCHAR(50),           -- pluriel (vide = même que label, ex: kg)
  show_on_pdf  BOOLEAN      NOT NULL DEFAULT TRUE,  -- afficher l'unité sur les lignes PDF
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Unités par défaut
-- (label, label_plural, show_on_pdf)
INSERT INTO units (code, label, label_plural, show_on_pdf, sort_order) VALUES
  -- Services (unité affichée sur PDF)
  ('piece',   'Pièce',    'Pièces',   true,  1),
  ('forfait', 'Forfait',  'Forfaits', false, 2),  -- forfait : pas besoin d'afficher sur PDF
  ('heure',   'Heure',    'Heures',   true,  3),
  ('jour',    'Jour',     'Jours',    true,  4),
  ('mois',    'Mois',     'Mois',     true,  5),
  ('annee',   'Année',    'Années',   true,  6),
  ('licence', 'Licence',  'Licences', true,  7),
  -- Poids (pas de pluriel, affichés)
  ('kg',  'kg',  null, true, 10),
  ('g',   'g',   null, true, 11),
  ('T',   'T',   null, true, 12),
  -- Dimensions
  ('m',   'm',   null, true, 20),
  ('m2',  'm²',  null, true, 21),
  ('m3',  'm³',  null, true, 22),
  -- Volume
  ('L',   'L',   null, true, 30),
  ('cL',  'cL',  null, true, 31),
  -- Conditionnement
  ('boite',   'Boîte',   'Boîtes',   true, 40),
  ('carton',  'Carton',  'Cartons',  true, 41),
  ('sachet',  'Sachet',  'Sachets',  true, 42),
  ('lot',     'Lot',     'Lots',     true, 43),
  ('palette', 'Palette', 'Palettes', true, 44);

CREATE TRIGGER tg_units_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Conversion des colonnes unit de product_unit (enum) → VARCHAR(20)
-- Permet d'accepter n'importe quelle unité configurée dans la table units.
ALTER TABLE products                        ALTER COLUMN unit TYPE VARCHAR(20) USING unit::TEXT;
ALTER TABLE proforma_lines                  ALTER COLUMN unit TYPE VARCHAR(20) USING unit::TEXT;
ALTER TABLE invoice_lines                   ALTER COLUMN unit TYPE VARCHAR(20) USING unit::TEXT;
ALTER TABLE recurring_invoice_template_lines ALTER COLUMN unit TYPE VARCHAR(20) USING unit::TEXT;
ALTER TABLE purchase_order_lines            ALTER COLUMN unit TYPE VARCHAR(20) USING unit::TEXT;
ALTER TABLE supplier_invoice_lines          ALTER COLUMN unit TYPE VARCHAR(20) USING unit::TEXT;

DROP TYPE IF EXISTS product_unit;
