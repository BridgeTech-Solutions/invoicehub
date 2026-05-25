'use client'

import { useState } from 'react'
import { Plus, Building2, Landmark } from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { useBankAccounts, useDeleteBankAccount, useUpdateBankAccount } from '@/features/bank/hooks'
import { BankAccountCard } from '@/features/bank/components/BankAccountCard'
import { BankAccountDrawer } from '@/features/bank/components/BankAccountDrawer'
import { BankSummaryKpiCards } from '@/features/bank/components/BankSummaryKpiCards'
import type { BankAccount } from '@/features/bank/types'
import { toast } from 'sonner'

export default function BankAccountsPage() {
  const { can } = usePermission()
  const [drawerOpen,      setDrawerOpen]      = useState(false)
  const [editingAccount,  setEditingAccount]  = useState<BankAccount | null>(null)
  const [deletingAccount, setDeletingAccount] = useState<BankAccount | null>(null)

  const { data: accounts = [], isLoading } = useBankAccounts()
  const deleteMutation  = useDeleteBankAccount()
  const updateMutation  = useUpdateBankAccount()

  const handleEdit = (account: BankAccount) => {
    setEditingAccount(account)
    setDrawerOpen(true)
  }

  const handleClose = () => {
    setDrawerOpen(false)
    setTimeout(() => setEditingAccount(null), 300)
  }

  const handleDelete = async (account: BankAccount) => {
    if (!confirm(`Supprimer le compte "${account.name}" ? Cette action est irréversible.`)) return
    await deleteMutation.mutateAsync(account.id)
  }

  const handleSetDefault = async (account: BankAccount) => {
    await updateMutation.mutateAsync({ id: account.id, data: { isDefault: true } })
    toast.success(`"${account.name}" défini comme compte par défaut`)
  }

  const activeCount = accounts.filter(a => a.isActive).length

  if (!can('bank', 'read')) return <AccessDenied message="Vous n'avez pas accès au module bancaire." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Comptes bancaires"
        description={isLoading ? undefined : `${activeCount} compte${activeCount !== 1 ? 's' : ''} actif${activeCount !== 1 ? 's' : ''}`}
        actions={
          <button
            type="button"
            onClick={() => { setEditingAccount(null); setDrawerOpen(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 'var(--radius-md)',
              background: 'var(--primary)', color: '#fff', border: 'none',
              fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600,
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(45,125,210,0.3)',
            }}
          >
            <Plus size={15} strokeWidth={2.5} aria-hidden />
            Nouveau compte
          </button>
        }
      />

      {/* KPI Cards */}
      <BankSummaryKpiCards />

      {/* Accounts grid */}
      {isLoading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card" style={{ height: 220, borderRadius: 'var(--radius-lg)' }}>
              <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-lg)', opacity: 0.5 }} className="animate-pulse" />
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <RichEmptyState
            icon={Landmark}
            title="Aucun compte bancaire"
            description="Connectez vos comptes pour importer vos relevés et rapprocher vos transactions automatiquement."
            features={['Import CSV / OFX / MT940', 'Rapprochement automatique', '6 banques camerounaises']}
            cta={{ label: '+ Ajouter un compte', onClick: () => setDrawerOpen(true) }}
          />
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}>
          {accounts.map(account => (
            <BankAccountCard
              key={account.id}
              account={account}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <BankAccountDrawer
          account={editingAccount}
          onClose={handleClose}
        />
      )}
    </div>
  )
}
