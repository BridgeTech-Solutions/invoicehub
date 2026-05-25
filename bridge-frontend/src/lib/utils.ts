import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as currency — currency-aware version.
 * e.g. formatCurrency(1200000, 'XAF') → "1 200 000 XAF"
 *      formatCurrency(1200000, 'EUR') → "1 200 000 EUR"
 */
export function formatCurrency(amount: number | string | null | undefined, currency = 'XAF'): string {
  if (amount === null || amount === undefined || amount === '') return `— ${currency}`
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return `— ${currency}`
  return new Intl.NumberFormat('fr-FR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n)) + ` ${currency}`
}

/** @deprecated Use `useCurrency().format` in components or `formatCurrency(amount, currency)` elsewhere. */
export function formatXAF(amount: number | string | null | undefined): string {
  return formatCurrency(amount, 'XAF')
}

/**
 * Format a date in French short format
 * e.g. 2026-03-14 → "14 mars 2026"
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Returns initials from a full name
 * "Jean-Pierre Kamga" → "JK"
 */
export function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join('')
}

/**
 * Build a page range with ellipsis for pagination
 * e.g. buildPageRange(5, 12) → [1, '…', 4, 5, 6, '…', 12]
 */
export function buildPageRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3) pages.push('…')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
