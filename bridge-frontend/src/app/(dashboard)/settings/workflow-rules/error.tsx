'use client'
import { RouteError } from '@/components/feedback/RouteError'
export default function WorkflowRulesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} backLabel="Paramètres" backHref="/settings" />
}
