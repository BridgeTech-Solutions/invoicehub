import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'

export default function UsersLoading() {
  return <TablePageSkeleton rows={8} cols={5} hasFilters />
}
