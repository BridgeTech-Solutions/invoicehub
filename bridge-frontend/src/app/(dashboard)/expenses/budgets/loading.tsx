import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'
export default function ExpenseBudgetsLoading() {
  return <TablePageSkeleton rows={6} cols={5} hasStats={false} hasFilters={false} />
}
