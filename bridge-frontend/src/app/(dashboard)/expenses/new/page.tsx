'use client'

import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { ExpenseForm } from '@/features/expenses/components/ExpenseForm'

export default function NewExpensePage() {
  const { can } = usePermission()

  if (!can('expense', 'create')) return <AccessDenied message="Vous n'avez pas les droits pour créer une dépense." />

  return <ExpenseForm />
}
