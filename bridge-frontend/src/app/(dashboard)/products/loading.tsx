import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'

export default function ProductsLoading() {
  return <TablePageSkeleton rows={8} cols={5} hasFilters />
}
