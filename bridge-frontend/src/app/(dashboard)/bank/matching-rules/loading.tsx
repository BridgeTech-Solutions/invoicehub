import { TablePageSkeleton } from '@/components/feedback/TablePageSkeleton'

export default function BankMatchingRulesLoading() {
  return <TablePageSkeleton rows={8} cols={6} hasFilters={false} />
}
