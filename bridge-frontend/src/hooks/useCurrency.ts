import { useSettings } from '@/features/settings/hooks'
import { formatCurrency } from '@/lib/utils'

/**
 * Returns the company's configured currency and a pre-bound formatter.
 *
 * Usage in components:
 *   const { format } = useCurrency()
 *   format(amount)  // → "1 200 000 XAF" or "1 200 000 EUR" depending on settings
 */
export function useCurrency() {
  const { data: settings } = useSettings()
  const currency = settings?.defaultCurrency ?? 'XAF'

  return {
    currency,
    format: (amount: number | string | null | undefined) => formatCurrency(amount, currency),
  }
}
