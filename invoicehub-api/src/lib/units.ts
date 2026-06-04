import { PrismaClient } from '@prisma/client';

export interface UnitDef {
  code:        string;
  label:       string;
  labelPlural: string | null;
  showOnPdf:   boolean;
}

/** Charge toutes les unités actives en une requête. */
export async function loadUnits(prisma: PrismaClient | { unit: PrismaClient['unit'] }): Promise<UnitDef[]> {
  return (prisma as PrismaClient).unit.findMany({
    where:   { isActive: true },
    select:  { code: true, label: true, labelPlural: true, showOnPdf: true },
    orderBy: { sortOrder: 'asc' },
  });
}

/**
 * Retourne le libellé à afficher pour une unité :
 * - si `qty > 1` et `labelPlural` existe → pluriel
 * - sinon → singulier
 * - si `showOnPdf = false` → chaîne vide (l'unité ne s'affiche pas)
 * - si l'unité est inconnue → renvoie le code brut
 */
export function resolveUnitLabel(units: UnitDef[], code: string, qty: number): string {
  const u = units.find(x => x.code === code);
  if (!u) return code;                          // code inconnu : affiche le code brut
  if (!u.showOnPdf) return '';                  // masqué sur PDF
  return qty > 1 && u.labelPlural ? u.labelPlural : u.label;
}
