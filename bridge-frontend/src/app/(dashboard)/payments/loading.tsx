import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'

export default function PaymentsLoading() {
  return <TablePageSkeleton rows={8} cols={6} hasFilters />
}
