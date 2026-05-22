import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'
export default function ExpenseCategoriesLoading() {
  return <TablePageSkeleton rows={8} cols={4} hasStats={false} hasFilters={false} />
}
