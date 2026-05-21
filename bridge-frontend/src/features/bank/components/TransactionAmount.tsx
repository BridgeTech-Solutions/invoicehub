import type { TransactionType } from '../types'

interface TransactionAmountProps {
  amount:   number
  type:     TransactionType
  currency?: string
  size?:    'sm' | 'md' | 'lg'
}

const SIZE = { sm: 12.5, md: 13.5, lg: 15 }

export function TransactionAmount({ amount, type, currency = 'XAF', size = 'md' }: TransactionAmountProps) {
  const isDebit  = type === 'debit'
  const color    = isDebit ? '#dc2626' : '#16a34a'
  const prefix   = isDebit ? '−' : '+'
  const formatted = amount.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: SIZE[size],
      fontWeight: 600,
      color,
      whiteSpace: 'nowrap',
    }}>
      {prefix}{formatted} {currency}
    </span>
  )
}
