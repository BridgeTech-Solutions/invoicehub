import type { FormLine, DocumentTotals, DiscountType } from '@/features/proformas/types'

const r2 = (n: number) => Math.round(n * 100) / 100

/** Mirrors the backend computeLine() function exactly */
export function computeLineValues(
  quantity: number,
  unitPriceHt: number,
  discountType: DiscountType,
  discountValue: number,
  taxRate: number,
) {
  const subtotalHt = r2(quantity * unitPriceHt)

  let discountAmount = 0
  if (discountType === 'percentage') {
    discountAmount = r2(subtotalHt * discountValue / 100)
  } else if (discountType === 'fixed') {
    discountAmount = Math.min(discountValue, subtotalHt)
  }

  const netHt     = r2(subtotalHt - discountAmount)
  const taxAmount = r2(netHt * taxRate / 100)
  const totalTtc  = r2(netHt + taxAmount)

  return { subtotalHt, discountAmount, netHt, taxAmount, totalTtc }
}

/** Mirrors the backend computeTotals() function exactly */
export function computeDocumentTotals(
  lines: FormLine[],
  globalDiscountType: DiscountType,
  globalDiscountValue: number,
): DocumentTotals {
  const sumNetHt = r2(lines.reduce((s, l) => s + l.netHt, 0))

  let globalDiscountAmount = 0
  if (globalDiscountType === 'percentage') {
    globalDiscountAmount = r2(sumNetHt * globalDiscountValue / 100)
  } else if (globalDiscountType === 'fixed') {
    globalDiscountAmount = Math.min(globalDiscountValue, sumNetHt)
  }

  const totalHt  = r2(sumNetHt - globalDiscountAmount)
  const totalTax = r2(lines.reduce((s, l) => s + l.taxAmount, 0))
  const totalTtc = r2(totalHt + totalTax)

  return { sumNetHt, globalDiscountAmount, totalHt, totalTax, totalTtc }
}

/** Create a blank form line with recomputed values */
export function makeBlankLine(sortOrder: number, taxRate = 19.25): FormLine {
  return {
    _localId: crypto.randomUUID(),
    sortOrder,
    designation: '',
    description: '',
    unit: 'forfait',
    quantity: 1,
    unitPriceHt: 0,
    discountType: 'none',
    discountValue: 0,
    taxRate,
    subtotalHt: 0,
    discountAmount: 0,
    netHt: 0,
    taxAmount: 0,
    totalTtc: 0,
  }
}

/** Rebuild a FormLine from a saved ProformaLine */
export function lineToFormLine(line: {
  id?: string; productId?: string | null; sortOrder: number; designation: string
  description?: string | null; unit: string; quantity: number; unitPriceHt: number
  discountType: DiscountType; discountValue: number; taxRate: number
  subtotalHt: number; discountAmount: number; netHt: number; taxAmount: number; totalTtc: number
}): FormLine {
  return {
    _localId: crypto.randomUUID(),
    productId: line.productId ?? undefined,
    sortOrder: line.sortOrder,
    designation: line.designation,
    description: line.description ?? '',
    unit: line.unit,
    quantity: Number(line.quantity),
    unitPriceHt: Number(line.unitPriceHt),
    discountType: line.discountType,
    discountValue: Number(line.discountValue),
    taxRate: Number(line.taxRate),
    subtotalHt: Number(line.subtotalHt),
    discountAmount: Number(line.discountAmount),
    netHt: Number(line.netHt),
    taxAmount: Number(line.taxAmount),
    totalTtc: Number(line.totalTtc),
  }
}
