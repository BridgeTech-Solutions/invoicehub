'use client'
import { RouteError } from '@/components/feedback/RouteError'
export default function BankReconciliationsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} backLabel="Comptes bancaires" backHref="/bank/accounts" />
}
