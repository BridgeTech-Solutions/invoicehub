'use client'

import { use } from 'react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { useExpense } from '@/features/expenses/hooks'
import { ExpenseForm } from '@/features/expenses/components/ExpenseForm'

export default function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { can } = usePermission()
  const { id }                        = use(params)
  const { data: expense, isLoading }  = useExpense(id)

  if (!can('expense', 'update')) return <AccessDenied message="Vous n'avez pas les droits pour modifier une dépense." />

  if (isLoading || !expense) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 24, width: 220, background: 'var(--border)', borderRadius: 6 }} className="animate-pulse" />
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: '360px 1fr' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card animate-pulse" style={{ height: 220 }} />
            <div className="card animate-pulse" style={{ height: 200 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card animate-pulse" style={{ height: 220 }} />
            <div className="card animate-pulse" style={{ height: 260 }} />
          </div>
        </div>
      </div>
    )
  }

  return <ExpenseForm expense={expense} />
}
