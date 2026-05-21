import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'

export default function BankTransactionsLoading() {
  return <TablePageSkeleton rows={12} cols={6} hasFilters />
}
