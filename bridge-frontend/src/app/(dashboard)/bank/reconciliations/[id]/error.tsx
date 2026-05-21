'use client'
import { RouteError } from '@/components/feedback/RouteError'
export default function ReconciliationWorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} backLabel="Rapprochements" backHref="/bank/reconciliations" />
}
