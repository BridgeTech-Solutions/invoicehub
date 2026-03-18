import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'

export default function ClientsLoading() {
  return <TablePageSkeleton rows={10} cols={6} hasStats hasFilters />
}
