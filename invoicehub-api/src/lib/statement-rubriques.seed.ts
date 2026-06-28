/**
 * @module lib/statement-rubriques.seed
 * Seed du modèle de bilan « façon Sage », dérivé À L'IDENTIQUE du calcul en dur
 * historique (lib/syscohada-statements computeBilan). Sert à peupler la table
 * `statement_rubrique`. Toute divergence est détectée par le test d'équivalence.
 */
import type { RubriqueDef } from './statement-rubriques';

const TRESO = ['50', '51', '52', '53', '54', '55', '57', '58'];
const TRESO_EXCL = ['590', '591', '592', '593', '594'];

export const BILAN_RUBRIQUES: RubriqueDef[] = [
  // ═══ ACTIF ═══
  // ── ACTIF IMMOBILISÉ (AZ) ──
  { side: 'actif', masseCode: 'AZ', masseLabel: 'ACTIF IMMOBILISÉ', masseOrder: 1, code: 'AA', label: 'Capital souscrit non appelé', lineOrder: 1,
    sources: [{ column: 'brut', prefixes: ['109'], mode: 'debitRaw' }] },
  { side: 'actif', masseCode: 'AZ', masseLabel: 'ACTIF IMMOBILISÉ', masseOrder: 1, code: 'AX', label: 'Charges immobilisées', lineOrder: 2,
    sources: [{ column: 'brut', prefixes: ['20'], mode: 'debitRaw' }, { column: 'amort', prefixes: ['280'], mode: 'creditRaw' }] },
  { side: 'actif', masseCode: 'AZ', masseLabel: 'ACTIF IMMOBILISÉ', masseOrder: 1, code: 'AD', label: 'Immobilisations incorporelles', lineOrder: 3,
    sources: [{ column: 'brut', prefixes: ['21'], mode: 'debitRaw' }, { column: 'amort', prefixes: ['281', '291'], mode: 'creditRaw' }] },
  { side: 'actif', masseCode: 'AZ', masseLabel: 'ACTIF IMMOBILISÉ', masseOrder: 1, code: 'AF', label: 'Immobilisations corporelles', lineOrder: 4,
    sources: [{ column: 'brut', prefixes: ['22', '23', '24'], mode: 'debitRaw' }, { column: 'amort', prefixes: ['282', '283', '284', '292', '293', '294', '295'], mode: 'creditRaw' }] },
  { side: 'actif', masseCode: 'AZ', masseLabel: 'ACTIF IMMOBILISÉ', masseOrder: 1, code: 'AG', label: 'Avances & acomptes sur immobilisations', lineOrder: 5,
    sources: [{ column: 'brut', prefixes: ['25'], mode: 'debitRaw' }] },
  { side: 'actif', masseCode: 'AZ', masseLabel: 'ACTIF IMMOBILISÉ', masseOrder: 1, code: 'AH', label: 'Immobilisations financières', lineOrder: 6,
    sources: [{ column: 'brut', prefixes: ['26', '27'], mode: 'debitRaw' }, { column: 'amort', prefixes: ['296', '297'], mode: 'creditRaw' }] },
  // ── ACTIF CIRCULANT (BK) ──
  { side: 'actif', masseCode: 'BK', masseLabel: 'ACTIF CIRCULANT', masseOrder: 2, code: 'BA', label: 'Stocks et en-cours', lineOrder: 1,
    sources: [{ column: 'brut', prefixes: ['31', '32', '33', '34', '35', '36', '37', '38'], mode: 'debitRaw' }, { column: 'amort', prefixes: ['39'], mode: 'creditRaw' }] },
  { side: 'actif', masseCode: 'BK', masseLabel: 'ACTIF CIRCULANT', masseOrder: 2, code: 'BG', label: 'Créances HAO', lineOrder: 2,
    sources: [{ column: 'brut', prefixes: ['48'], mode: 'debitSign' }] },
  { side: 'actif', masseCode: 'BK', masseLabel: 'ACTIF CIRCULANT', masseOrder: 2, code: 'BH', label: 'Fournisseurs, avances versées', lineOrder: 3,
    sources: [{ column: 'brut', prefixes: ['40'], mode: 'debitSign' }] },
  { side: 'actif', masseCode: 'BK', masseLabel: 'ACTIF CIRCULANT', masseOrder: 2, code: 'BI', label: 'Clients', lineOrder: 4,
    sources: [{ column: 'brut', prefixes: ['41'], mode: 'debitSign' }, { column: 'amort', prefixes: ['491'], mode: 'creditRaw' }] },
  { side: 'actif', masseCode: 'BK', masseLabel: 'ACTIF CIRCULANT', masseOrder: 2, code: 'BJ', label: 'Autres créances', lineOrder: 5,
    sources: [
      { column: 'brut', prefixes: ['42', '43', '44'], mode: 'debitSign', exclude: ['478', '479'] },
      { column: 'brut', prefixes: ['45', '46', '47'], mode: 'debitSign', exclude: ['476', '477', '478', '479'] },
      { column: 'amort', prefixes: ['492', '493', '494', '495', '496', '497'], mode: 'creditRaw' },
    ] },
  { side: 'actif', masseCode: 'BK', masseLabel: 'ACTIF CIRCULANT', masseOrder: 2, code: 'BR', label: "Charges constatées d'avance", lineOrder: 6,
    sources: [{ column: 'brut', prefixes: ['476'], mode: 'debitRaw' }] },
  // ── TRÉSORERIE-ACTIF (BT) ──
  { side: 'actif', masseCode: 'BT', masseLabel: 'TRÉSORERIE-ACTIF', masseOrder: 3, code: 'BS', label: 'Trésorerie-Actif (banques, caisse)', lineOrder: 1,
    sources: [{ column: 'brut', prefixes: TRESO, mode: 'debitSign', exclude: TRESO_EXCL }, { column: 'amort', prefixes: ['59'], mode: 'creditRaw' }] },
  // ── ÉCART DE CONVERSION-ACTIF (BU) ──
  { side: 'actif', masseCode: 'BU', masseLabel: 'ÉCART DE CONVERSION-ACTIF', masseOrder: 4, code: 'BU', label: 'Écart de conversion-Actif', lineOrder: 1,
    sources: [{ column: 'brut', prefixes: ['478'], mode: 'debitRaw' }] },

  // ═══ PASSIF ═══
  // ── CAPITAUX PROPRES (CP) ──
  { side: 'passif', masseCode: 'CP', masseLabel: 'CAPITAUX PROPRES', masseOrder: 1, code: 'CA', label: 'Capital', lineOrder: 1,
    sources: [{ column: 'brut', prefixes: ['101', '102', '103', '104'], mode: 'creditRaw' }] },
  { side: 'passif', masseCode: 'CP', masseLabel: 'CAPITAUX PROPRES', masseOrder: 1, code: 'CD', label: 'Primes & écarts de réévaluation', lineOrder: 2,
    sources: [{ column: 'brut', prefixes: ['105', '106'], mode: 'creditRaw' }] },
  { side: 'passif', masseCode: 'CP', masseLabel: 'CAPITAUX PROPRES', masseOrder: 1, code: 'CF', label: 'Réserves', lineOrder: 3,
    sources: [{ column: 'brut', prefixes: ['11'], mode: 'creditRaw' }] },
  { side: 'passif', masseCode: 'CP', masseLabel: 'CAPITAUX PROPRES', masseOrder: 1, code: 'CG', label: 'Report à nouveau', lineOrder: 4,
    sources: [{ column: 'brut', prefixes: ['12'], mode: 'creditRaw' }] },
  { side: 'passif', masseCode: 'CP', masseLabel: 'CAPITAUX PROPRES', masseOrder: 1, code: 'CL', label: "Subventions d'investissement", lineOrder: 5,
    sources: [{ column: 'brut', prefixes: ['14'], mode: 'creditRaw' }] },
  { side: 'passif', masseCode: 'CP', masseLabel: 'CAPITAUX PROPRES', masseOrder: 1, code: 'CM', label: 'Provisions réglementées', lineOrder: 6,
    sources: [{ column: 'brut', prefixes: ['15'], mode: 'creditRaw' }] },
  { side: 'passif', masseCode: 'CP', masseLabel: 'CAPITAUX PROPRES', masseOrder: 1, code: 'CH', label: "Résultat net de l'exercice", lineOrder: 7, isResult: true, sources: [] },
  // ── DETTES FINANCIÈRES (DD) ──
  { side: 'passif', masseCode: 'DD', masseLabel: 'DETTES FINANCIÈRES', masseOrder: 2, code: 'DA', label: 'Emprunts & dettes financières', lineOrder: 1,
    sources: [{ column: 'brut', prefixes: ['16', '17', '18'], mode: 'creditRaw' }] },
  { side: 'passif', masseCode: 'DD', masseLabel: 'DETTES FINANCIÈRES', masseOrder: 2, code: 'DB', label: 'Provisions pour risques & charges', lineOrder: 2,
    sources: [{ column: 'brut', prefixes: ['19'], mode: 'creditRaw' }] },
  // ── PASSIF CIRCULANT (DP) ──
  { side: 'passif', masseCode: 'DP', masseLabel: 'PASSIF CIRCULANT', masseOrder: 3, code: 'DG', label: 'Dettes circulantes HAO', lineOrder: 1,
    sources: [{ column: 'brut', prefixes: ['48'], mode: 'creditSign' }] },
  { side: 'passif', masseCode: 'DP', masseLabel: 'PASSIF CIRCULANT', masseOrder: 3, code: 'DI', label: "Fournisseurs d'exploitation", lineOrder: 2,
    sources: [{ column: 'brut', prefixes: ['40'], mode: 'creditSign' }] },
  { side: 'passif', masseCode: 'DP', masseLabel: 'PASSIF CIRCULANT', masseOrder: 3, code: 'DH', label: 'Clients, avances reçues', lineOrder: 3,
    sources: [{ column: 'brut', prefixes: ['41'], mode: 'creditSign' }] },
  { side: 'passif', masseCode: 'DP', masseLabel: 'PASSIF CIRCULANT', masseOrder: 3, code: 'DJ', label: 'Dettes fiscales & sociales', lineOrder: 4,
    sources: [{ column: 'brut', prefixes: ['42', '43', '44'], mode: 'creditSign', exclude: ['478', '479'] }] },
  { side: 'passif', masseCode: 'DP', masseLabel: 'PASSIF CIRCULANT', masseOrder: 3, code: 'DM', label: 'Autres dettes', lineOrder: 5,
    sources: [{ column: 'brut', prefixes: ['45', '46', '47'], mode: 'creditSign', exclude: ['476', '477', '478', '479'] }] },
  { side: 'passif', masseCode: 'DP', masseLabel: 'PASSIF CIRCULANT', masseOrder: 3, code: 'DV', label: "Produits constatés d'avance", lineOrder: 6,
    sources: [{ column: 'brut', prefixes: ['477'], mode: 'creditRaw' }] },
  // ── TRÉSORERIE-PASSIF (DT) ──
  { side: 'passif', masseCode: 'DT', masseLabel: 'TRÉSORERIE-PASSIF', masseOrder: 4, code: 'DR', label: 'Banques, découverts & crédits de trésorerie', lineOrder: 1,
    sources: [{ column: 'brut', prefixes: TRESO, mode: 'creditSign', exclude: TRESO_EXCL }, { column: 'brut', prefixes: ['561', '564', '565', '566'], mode: 'creditRaw' }] },
  // ── ÉCART DE CONVERSION-PASSIF (BX) ──
  { side: 'passif', masseCode: 'BX', masseLabel: 'ÉCART DE CONVERSION-PASSIF', masseOrder: 5, code: 'BX', label: 'Écart de conversion-Passif', lineOrder: 1,
    sources: [{ column: 'brut', prefixes: ['479'], mode: 'creditRaw' }] },
];
