-- Migration : modèle paramétrable des états financiers (rubriques « façon Sage »)
-- Crée la table statement_rubriques et la peuple avec le modèle SYSCOHADA du BILAN
-- (dérivé à l'identique du calcul historique). Idempotent : ON CONFLICT (code) DO NOTHING
-- -> ne réécrit pas les rubriques déjà présentes/éditées en prod.
CREATE TABLE IF NOT EXISTS statement_rubriques (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  side        varchar(10)  NOT NULL,
  masse_code  varchar(10)  NOT NULL,
  masse_label varchar(150) NOT NULL,
  masse_order int          NOT NULL,
  code        varchar(10)  NOT NULL UNIQUE,
  label       varchar(255) NOT NULL,
  line_order  int          NOT NULL,
  is_result   boolean      NOT NULL DEFAULT false,
  sources     jsonb        NOT NULL DEFAULT '[]',
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

INSERT INTO statement_rubriques (side, masse_code, masse_label, masse_order, code, label, line_order, is_result, sources) VALUES
('actif','AZ','ACTIF IMMOBILISÉ',1,'AA','Capital souscrit non appelé',1,false,'[{"column":"brut","prefixes":["109"],"mode":"debitRaw"}]'::jsonb),
('actif','AZ','ACTIF IMMOBILISÉ',1,'AX','Charges immobilisées',2,false,'[{"column":"brut","prefixes":["20"],"mode":"debitRaw"},{"column":"amort","prefixes":["280"],"mode":"creditRaw"}]'::jsonb),
('actif','AZ','ACTIF IMMOBILISÉ',1,'AD','Immobilisations incorporelles',3,false,'[{"column":"brut","prefixes":["21"],"mode":"debitRaw"},{"column":"amort","prefixes":["281","291"],"mode":"creditRaw"}]'::jsonb),
('actif','AZ','ACTIF IMMOBILISÉ',1,'AF','Immobilisations corporelles',4,false,'[{"column":"brut","prefixes":["22","23","24"],"mode":"debitRaw"},{"column":"amort","prefixes":["282","283","284","292","293","294","295"],"mode":"creditRaw"}]'::jsonb),
('actif','AZ','ACTIF IMMOBILISÉ',1,'AG','Avances & acomptes sur immobilisations',5,false,'[{"column":"brut","prefixes":["25"],"mode":"debitRaw"}]'::jsonb),
('actif','AZ','ACTIF IMMOBILISÉ',1,'AH','Immobilisations financières',6,false,'[{"column":"brut","prefixes":["26","27"],"mode":"debitRaw"},{"column":"amort","prefixes":["296","297"],"mode":"creditRaw"}]'::jsonb),
('actif','BK','ACTIF CIRCULANT',2,'BA','Stocks et en-cours',1,false,'[{"column":"brut","prefixes":["31","32","33","34","35","36","37","38"],"mode":"debitRaw"},{"column":"amort","prefixes":["39"],"mode":"creditRaw"}]'::jsonb),
('actif','BK','ACTIF CIRCULANT',2,'BG','Créances HAO',2,false,'[{"column":"brut","prefixes":["48"],"mode":"debitSign"}]'::jsonb),
('actif','BK','ACTIF CIRCULANT',2,'BH','Fournisseurs, avances versées',3,false,'[{"column":"brut","prefixes":["40"],"mode":"debitSign"}]'::jsonb),
('actif','BK','ACTIF CIRCULANT',2,'BI','Clients',4,false,'[{"column":"brut","prefixes":["41"],"mode":"debitSign"},{"column":"amort","prefixes":["491"],"mode":"creditRaw"}]'::jsonb),
('actif','BK','ACTIF CIRCULANT',2,'BJ','Autres créances',5,false,'[{"column":"brut","prefixes":["42","43","44"],"mode":"debitSign","exclude":["478","479"]},{"column":"brut","prefixes":["45","46","47"],"mode":"debitSign","exclude":["476","477","478","479"]},{"column":"amort","prefixes":["492","493","494","495","496","497"],"mode":"creditRaw"}]'::jsonb),
('actif','BK','ACTIF CIRCULANT',2,'BR','Charges constatées d''avance',6,false,'[{"column":"brut","prefixes":["476"],"mode":"debitRaw"}]'::jsonb),
('actif','BT','TRÉSORERIE-ACTIF',3,'BS','Trésorerie-Actif (banques, caisse)',1,false,'[{"column":"brut","prefixes":["50","51","52","53","54","55","57","58"],"mode":"debitSign","exclude":["590","591","592","593","594"]},{"column":"amort","prefixes":["59"],"mode":"creditRaw"}]'::jsonb),
('actif','BU','ÉCART DE CONVERSION-ACTIF',4,'BU','Écart de conversion-Actif',1,false,'[{"column":"brut","prefixes":["478"],"mode":"debitRaw"}]'::jsonb),
('passif','CP','CAPITAUX PROPRES',1,'CA','Capital',1,false,'[{"column":"brut","prefixes":["101","102","103","104"],"mode":"creditRaw"}]'::jsonb),
('passif','CP','CAPITAUX PROPRES',1,'CD','Primes & écarts de réévaluation',2,false,'[{"column":"brut","prefixes":["105","106"],"mode":"creditRaw"}]'::jsonb),
('passif','CP','CAPITAUX PROPRES',1,'CF','Réserves',3,false,'[{"column":"brut","prefixes":["11"],"mode":"creditRaw"}]'::jsonb),
('passif','CP','CAPITAUX PROPRES',1,'CG','Report à nouveau',4,false,'[{"column":"brut","prefixes":["12"],"mode":"creditRaw"}]'::jsonb),
('passif','CP','CAPITAUX PROPRES',1,'CL','Subventions d''investissement',5,false,'[{"column":"brut","prefixes":["14"],"mode":"creditRaw"}]'::jsonb),
('passif','CP','CAPITAUX PROPRES',1,'CM','Provisions réglementées',6,false,'[{"column":"brut","prefixes":["15"],"mode":"creditRaw"}]'::jsonb),
('passif','CP','CAPITAUX PROPRES',1,'CH','Résultat net de l''exercice',7,true,'[]'::jsonb),
('passif','DD','DETTES FINANCIÈRES',2,'DA','Emprunts & dettes financières',1,false,'[{"column":"brut","prefixes":["16","17","18"],"mode":"creditRaw"}]'::jsonb),
('passif','DD','DETTES FINANCIÈRES',2,'DB','Provisions pour risques & charges',2,false,'[{"column":"brut","prefixes":["19"],"mode":"creditRaw"}]'::jsonb),
('passif','DP','PASSIF CIRCULANT',3,'DG','Dettes circulantes HAO',1,false,'[{"column":"brut","prefixes":["48"],"mode":"creditSign"}]'::jsonb),
('passif','DP','PASSIF CIRCULANT',3,'DI','Fournisseurs d''exploitation',2,false,'[{"column":"brut","prefixes":["40"],"mode":"creditSign"}]'::jsonb),
('passif','DP','PASSIF CIRCULANT',3,'DH','Clients, avances reçues',3,false,'[{"column":"brut","prefixes":["41"],"mode":"creditSign"}]'::jsonb),
('passif','DP','PASSIF CIRCULANT',3,'DJ','Dettes fiscales & sociales',4,false,'[{"column":"brut","prefixes":["42","43","44"],"mode":"creditSign","exclude":["478","479"]}]'::jsonb),
('passif','DP','PASSIF CIRCULANT',3,'DM','Autres dettes',5,false,'[{"column":"brut","prefixes":["45","46","47"],"mode":"creditSign","exclude":["476","477","478","479"]}]'::jsonb),
('passif','DP','PASSIF CIRCULANT',3,'DV','Produits constatés d''avance',6,false,'[{"column":"brut","prefixes":["477"],"mode":"creditRaw"}]'::jsonb),
('passif','DT','TRÉSORERIE-PASSIF',4,'DR','Banques, découverts & crédits de trésorerie',1,false,'[{"column":"brut","prefixes":["50","51","52","53","54","55","57","58"],"mode":"creditSign","exclude":["590","591","592","593","594"]},{"column":"brut","prefixes":["561","564","565","566"],"mode":"creditRaw"}]'::jsonb),
('passif','BX','ÉCART DE CONVERSION-PASSIF',5,'BX','Écart de conversion-Passif',1,false,'[{"column":"brut","prefixes":["479"],"mode":"creditRaw"}]'::jsonb)
ON CONFLICT (code) DO NOTHING;
