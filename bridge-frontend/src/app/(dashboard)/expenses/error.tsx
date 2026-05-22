'use client'
import { RouteError } from '@/components/feedback/RouteError'
export default function ExpensesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} backLabel="Tableau de bord" backHref="/dashboard" />
}
