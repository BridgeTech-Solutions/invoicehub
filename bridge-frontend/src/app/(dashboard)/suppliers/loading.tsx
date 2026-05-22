import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'
export default function SuppliersLoading() {
  return <TablePageSkeleton rows={10} cols={6} hasStats={false} hasFilters />
}
