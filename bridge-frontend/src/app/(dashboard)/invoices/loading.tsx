import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'

export default function InvoicesLoading() {
  return <TablePageSkeleton rows={10} cols={7} hasFilters />
}
