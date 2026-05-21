import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'

export default function BankReconciliationsLoading() {
  return <TablePageSkeleton rows={8} cols={7} hasFilters />
}
