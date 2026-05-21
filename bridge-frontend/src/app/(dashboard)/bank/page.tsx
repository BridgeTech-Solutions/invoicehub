import { redirect } from 'next/navigation'
import { ROUTES } from '@/lib/constants'

export default function BankPage() {
  redirect(ROUTES.BANK_ACCOUNTS)
}
