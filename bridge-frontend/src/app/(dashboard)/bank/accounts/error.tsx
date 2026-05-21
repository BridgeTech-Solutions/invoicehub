'use client'
import { RouteError } from '@/components/feedback/RouteError'
export default function BankAccountsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} backLabel="Module bancaire" backHref="/bank/accounts" />
}
