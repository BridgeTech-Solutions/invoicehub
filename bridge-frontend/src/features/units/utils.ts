import type { Unit } from './api'

/**
 * Retourne le libellé d'une unité selon la quantité.
 * - qty > 1 ET labelPlural défini → pluriel
 * - sinon → singulier
 * - code inconnu → le code brut
 */
export function resolveUnitLabel(units: Unit[], code: string, qty: number): string {
  const u = units.find(x => x.code === code)
  if (!u) return code
  return qty > 1 && u.labelPlural ? u.labelPlural : u.label
}

/** Label singulier uniquement (pour les selects, titres, etc.) */
export function getUnitLabel(units: Unit[], code: string): string {
  return units.find(x => x.code === code)?.label ?? code
}
