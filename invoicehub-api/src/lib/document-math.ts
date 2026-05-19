/**
 * @module lib/document-math
 * Calculs financiers SYSCOHADA — partagés entre invoices et proformas.
 *
 * Ces fonctions sont exportées pour être testables indépendamment.
 * Le frontend dispose d'un miroir identique (`bridge-frontend/src/lib/document-math.ts`).
 *
 * Formule SYSCOHADA :
 *   subtotalHt     = quantité × prix_unitaire_HT
 *   discountAmount = subtotalHt × taux / 100  (si remise %)
 *   netHt          = subtotalHt − discountAmount
 *   taxAmount      = netHt × taux_TVA / 100
 *   totalTtc       = netHt + taxAmount
 */

export interface LineInput {
  quantity:      number;
  unitPriceHt:   number;
  discountType:  'none' | 'percentage' | 'fixed';
  discountValue: number;
  taxRate:       number;
}

export interface LineResult {
  subtotalHt:     number;
  discountAmount: number;
  netHt:          number;
  taxAmount:      number;
  totalTtc:       number;
}

export interface TotalsResult {
  subtotalHt:           number;
  globalDiscountAmount: number;
  totalHt:              number;
  totalTax:             number;
  totalTtc:             number;
}

/**
 * Calcule les montants d'une ligne de document.
 * Tous les résultats sont arrondis à 2 décimales.
 *
 * @param line - Quantité, prix unitaire HT, remise et TVA
 * @returns Montants calculés : subtotalHt, discountAmount, netHt, taxAmount, totalTtc
 */
export function computeLine(line: LineInput): LineResult {
  const subtotalHt = Number((line.quantity * line.unitPriceHt).toFixed(2));

  let discountAmount = 0;
  if (line.discountType === 'percentage') {
    discountAmount = Number((subtotalHt * line.discountValue / 100).toFixed(2));
  } else if (line.discountType === 'fixed') {
    // La remise fixe ne peut pas dépasser le montant HT
    discountAmount = Math.min(line.discountValue, subtotalHt);
  }

  const netHt     = Number((subtotalHt - discountAmount).toFixed(2));
  const taxAmount = Number((netHt * line.taxRate / 100).toFixed(2));
  const totalTtc  = Number((netHt + taxAmount).toFixed(2));

  return { subtotalHt, discountAmount, netHt, taxAmount, totalTtc };
}

/**
 * Calcule les totaux globaux d'un document à partir des lignes déjà calculées.
 *
 * La remise globale s'applique sur la somme des nets HT des lignes
 * (après remises individuelles), avant la TVA.
 *
 * @param lines               - Résultats de computeLine() pour chaque ligne
 * @param globalDiscountType  - 'none' | 'percentage' | 'fixed'
 * @param globalDiscountValue - Valeur de la remise globale
 * @returns subtotalHt, globalDiscountAmount, totalHt, totalTax, totalTtc
 */
export function computeTotals(
  lines: LineResult[],
  globalDiscountType: string,
  globalDiscountValue: number,
): TotalsResult {
  const subtotalHt = Number(lines.reduce((s, l) => s + l.netHt, 0).toFixed(2));

  let globalDiscountAmount = 0;
  if (globalDiscountType === 'percentage') {
    globalDiscountAmount = Number((subtotalHt * globalDiscountValue / 100).toFixed(2));
  } else if (globalDiscountType === 'fixed') {
    globalDiscountAmount = Math.min(globalDiscountValue, subtotalHt);
  }

  const totalHt  = Number((subtotalHt - globalDiscountAmount).toFixed(2));
  const totalTax = Number(lines.reduce((s, l) => s + l.taxAmount, 0).toFixed(2));
  const totalTtc = Number((totalHt + totalTax).toFixed(2));

  return { subtotalHt, globalDiscountAmount, totalHt, totalTax, totalTtc };
}
