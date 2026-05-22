import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'
export default function ExpensesLoading() {
  return <TablePageSkeleton rows={10} cols={6} hasStats hasFilters />
}
