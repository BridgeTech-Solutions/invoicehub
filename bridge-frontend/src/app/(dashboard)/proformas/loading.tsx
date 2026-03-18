import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'

export default function ProformasLoading() {
  return <TablePageSkeleton rows={10} cols={6} hasFilters />
}
