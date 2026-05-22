'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, PiggyBank, Banknote, Smartphone, Lock,
  Star, Upload, GitMerge, ArrowLeftRight,
  Pencil, Trash2, CheckCircle,
} from 'lucide-react'
import Link from 'next/link'
import { ActionMenu } from '@/components/ui/ActionMenu'
import type { BankAccount, BankAccountType } from '../types'
import { ROUTES } from '@/lib/constants'

const TYPE_ICON: Record<BankAccountType, React.ElementType> = {
  checking:      Building2,
  savings:       PiggyBank,
  petty_cash:    Banknote,
  mobile_money:  Smartphone,
  term_deposit:  Lock,
}

const TYPE_LABEL: Record<BankAccountType, string> = {
  checking:      'Compte courant',
  savings:       'Épargne',
  petty_cash:    'Caisse',
  mobile_money:  'Mobile Money',
  term_deposit:  'Dépôt à terme',
}

interface BankAccountCardProps {
  account:       BankAccount
  onEdit:        (account: BankAccount) => void
  onDelete:      (account: BankAccount) => void
  onSetDefault:  (account: BankAccount) => void
}

export function BankAccountCard({ account, onEdit, onDelete, onSetDefault }: BankAccountCardProps) {
  const [hovered, setHovered] = useState(false)
  const router   = useRouter()
  const TypeIcon = TYPE_ICON[account.accountType] ?? Building2
  const color    = account.color ?? '#2D7DD2'
  const balance  = Number(account.currentBalance)

  const actions = [
    { label: 'Modifier',            icon: Pencil,         onClick: () => onEdit(account) },
    ...(!account.isDefault ? [{ label: 'Définir comme défaut', icon: CheckCircle, onClick: () => onSetDefault(account) }] : []),
    { label: 'Importer un relevé',  icon: Upload,         onClick: () => router.push(`${ROUTES.BANK_IMPORT}?accountId=${account.id}`) },
    { label: 'Transactions',        icon: ArrowLeftRight, onClick: () => router.push(`${ROUTES.BANK_TRANSACTIONS}?accountId=${account.id}`) },
    { label: 'Rapprocher',          icon: GitMerge,       onClick: () => router.push(`${ROUTES.BANK_RECONCILIATIONS}?accountId=${account.id}`) },
    { label: 'Supprimer',           icon: Trash2,         onClick: () => onDelete(account), danger: true, separator: true },
  ]

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--surface)',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        position: 'relative',
        transition: 'box-shadow 0.18s, transform 0.18s',
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        cursor: 'default',
      }}
    >
      {/* Bande couleur gauche */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, bottom: 0,
        width: 4,
        background: color,
        borderRadius: '14px 0 0 14px',
      }} />

      {/* Action menu */}
      <div style={{ position: 'absolute', top: 10, right: 10 }}>
        <ActionMenu items={actions} width={220} />
      </div>

      {/* Corps */}
      <div style={{ padding: '20px 20px 16px 24px' }}>
        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, paddingRight: 32 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `${color}18`,
            border: `1.5px solid ${color}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <TypeIcon size={18} style={{ color }} strokeWidth={1.8} />
          </div>
          <div style={{ minWidth: 0, paddingTop: 2, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 700,
                fontFamily: 'var(--font-display)',
                color: 'var(--text-1)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                minWidth: 0, flex: 1,
              }}>
                {account.name}
              </div>
              {account.isDefault && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'rgba(45,125,210,0.09)',
                  border: '1px solid rgba(45,125,210,0.2)',
                  borderRadius: 99,
                  padding: '2px 8px',
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: 'var(--primary)',
                  fontFamily: 'var(--font-display)',
                  flexShrink: 0,
                }}>
                  <Star size={9} fill="currentColor" />
                  Défaut
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {account.bankName}
            </div>
          </div>
        </div>

        {/* Solde */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 22,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: balance >= 0 ? 'var(--text-1)' : '#dc2626',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}>
            {balance < 0 ? '−' : ''}{Math.abs(balance).toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontWeight: 500 }}>
            {account.currency} · Solde actuel
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 99,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontWeight: 500,
          }}>
            {TYPE_LABEL[account.accountType] ?? account.accountType}
          </span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 99,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontWeight: 500,
          }}>
            {account.currency}
          </span>
          {!account.isActive && (
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 99,
              background: '#fee2e2', color: '#dc2626', fontWeight: 600,
            }}>
              Inactif
            </span>
          )}
        </div>

        {/* Séparateur */}
        <div style={{ height: 1, background: 'var(--border)', margin: '0 0 12px' }} />

        {/* Infos bas */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {account.accountNumber
              ? `N° ••••${account.accountNumber.slice(-4)}`
              : account.iban
                ? `IBAN ••••${account.iban.slice(-4)}`
                : 'Aucun N° renseigné'}
          </div>

          {/* Transactions en attente */}
          {(account._count?.transactions ?? 0) > 0 && (
            <Link
              href={`${ROUTES.BANK_TRANSACTIONS}?accountId=${account.id}&reconciled=false`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11.5, fontWeight: 600,
                color: '#d97706',
                background: '#fef3c7',
                border: '1px solid #fde68a',
                borderRadius: 99, padding: '2px 8px',
                textDecoration: 'none',
                transition: 'opacity 0.15s',
              }}
              title="Voir les transactions non rapprochées"
            >
              <AlertCircleIcon size={10} />
              {account._count?.transactions} en attente
            </Link>
          )}
        </div>
      </div>

      {/* Actions rapides bas */}
      <div style={{
        borderTop: '1px solid var(--border)',
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
      }}>
        {[
          { label: 'Importer',     icon: Upload,         href: `${ROUTES.BANK_IMPORT}?accountId=${account.id}` },
          { label: 'Transactions', icon: ArrowLeftRight,  href: `${ROUTES.BANK_TRANSACTIONS}?accountId=${account.id}` },
          { label: 'Rapprocher',   icon: GitMerge,        href: `${ROUTES.BANK_RECONCILIATIONS}?accountId=${account.id}` },
        ].map(({ label, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 4, padding: '10px 4px',
              textDecoration: 'none',
              color: 'var(--text-3)',
              fontSize: 10.5,
              fontWeight: 500,
              borderRight: '1px solid var(--border)',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--surface-2)'
              e.currentTarget.style.color = 'var(--primary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = ''
              e.currentTarget.style.color = 'var(--text-3)'
            }}
          >
            <Icon size={13} strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}

function AlertCircleIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}
