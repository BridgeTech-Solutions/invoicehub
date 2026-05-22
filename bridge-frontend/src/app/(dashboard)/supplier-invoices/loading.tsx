import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'
export default function SupplierInvoicesLoading() {
  return <TablePageSkeleton rows={10} cols={7} hasStats hasFilters />
}
