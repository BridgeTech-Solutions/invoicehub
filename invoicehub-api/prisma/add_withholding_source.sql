-- Migration : retenue à la source subie (acompte IR / précompte, SYSCOHADA/Cameroun).
-- Certains clients (État, établissements publics, grandes entreprises) prélèvent une
-- retenue (2,2 % par défaut = acompte IR 2 % + 10 % CAC) sur le montant qu'ils règlent
-- et la reversent à l'État pour le compte de l'entreprise. Ce n'est ni un impayé ni une
-- charge : c'est une créance d'impôt récupérable, comptabilisée au compte 4492
-- « État, avances et acomptes versés sur impôts » (Dr 4492 / Cr 411).
--
-- La retenue est saisie AU MOMENT DU PAIEMENT (rien sur la facture) : la facture est
-- soldée quand encaissé + retenue (+ escompte) = solde dû.
-- Idempotent : réexécutable sans erreur.

-- Réglages entreprise : compte et taux par défaut (configurables)
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS withholding_account VARCHAR(20)  NOT NULL DEFAULT '4492';
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS withholding_rate    NUMERIC(5,2) NOT NULL DEFAULT 2.2;

-- Paiement : composante « retenue à la source » de ce règlement
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS withholding_applied BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS withholding_amount  NUMERIC(15,2) NOT NULL DEFAULT 0;
