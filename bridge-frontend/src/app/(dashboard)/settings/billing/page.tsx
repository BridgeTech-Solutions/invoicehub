'use client'

import { useState, useId, useRef, useEffect } from 'react'
import { Percent, Building, Plus, Pencil, Trash2, Check, X, Loader2, Star, Banknote, BookOpen } from 'lucide-react'
import { useTaxRates, useCreateTaxRate, useUpdateTaxRate, useDeleteTaxRate } from '@/features/tax-rates/hooks'
import { useOffices, useCreateOffice, useUpdateOffice, useDeleteOffice } from '@/features/offices/hooks'
import { useSettings, useUpdateSettings } from '@/features/settings/hooks'
import { AccountPicker } from '@/features/accounting/components/AccountPicker'
import { useAccounts } from '@/features/accounting/hooks'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import type { TaxRate, CreateTaxRatePayload } from '@/features/tax-rates/types'
import type { Office, CreateOfficePayload } from '@/features/offices/types'
import type { UpdateSettingsPayload } from '@/features/settings/types'

const inputCss: React.CSSProperties = {
  padding: '8px 11px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

function SectionHeader({ icon, title, onAdd, addLabel }: {
  icon: React.ReactNode; title: string; onAdd?: () => void; addLabel?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div aria-hidden="true" style={{ color: 'var(--primary)' }}>{icon}</div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
      </div>
      {onAdd && (
        <button type="button" onClick={onAdd} aria-label={addLabel}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          <Plus size={12} aria-hidden="true" /> {addLabel}
        </button>
      )}
    </div>
  )
}

// ─── Confirm delete modal ──────────────────────────────────────
function ConfirmDeleteModal({
  label, onConfirm, onCancel, isPending,
}: { label: string; onConfirm: () => void; onCancel: () => void; isPending: boolean }) {
  const titleId    = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { confirmRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <h2 id={titleId} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 10px' }}>
          Supprimer
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 22px', lineHeight: 1.6 }}>
          Supprimer <strong>«&nbsp;{label}&nbsp;»</strong> ? Cette action est irréversible.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            Annuler
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={isPending}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: '#ef4444', color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: isPending ? 0.65 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPending && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Global finance section ───────────────────────────────────
function GlobalFinanceSection() {
  const { can } = usePermission()
  const { data: settings, isLoading } = useSettings()
  const updateMut = useUpdateSettings()
  const uid = useId()
  const id  = (s: string) => `${uid}-${s}`

  const [form, setForm] = useState<Pick<UpdateSettingsPayload, 'defaultCurrency' | 'defaultTaxRate' | 'defaultProformaValidityDays' | 'defaultInvoiceDueDays'>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!settings) return
    setForm({
      defaultCurrency:             settings.defaultCurrency,
      defaultTaxRate:              settings.defaultTaxRate,
      defaultProformaValidityDays: settings.defaultProformaValidityDays,
      defaultInvoiceDueDays:       settings.defaultInvoiceDueDays,
    })
    setDirty(false)
  }, [settings])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    await updateMut.mutateAsync(form)
    setDirty(false)
  }

  return (
    <div className="card">
      <SectionHeader icon={<Banknote size={15} />} title="Paramètres financiers" />
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 16px' }}>
        Valeurs par défaut appliquées à chaque nouveau document BTS.
      </p>
      {isLoading
        ? <div aria-hidden="true" style={{ height: 140, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
        : (
          <form onSubmit={handleSave} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label htmlFor={id('currency')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
                    Devise par défaut
                  </label>
                  <select
                    id={id('currency')}
                    value={form.defaultCurrency ?? 'XAF'}
                    onChange={(e) => set('defaultCurrency', e.target.value)}
                    style={{ ...inputCss, cursor: 'pointer' }}
                  >
                    <option value="XAF">XAF (Franc CFA)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="USD">USD (Dollar US)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={id('taxRate')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
                    Taux TVA par défaut (%)
                  </label>
                  <input
                    id={id('taxRate')}
                    type="number" min={0} max={100} step={0.01}
                    value={form.defaultTaxRate ?? 19.25}
                    onChange={(e) => set('defaultTaxRate', parseFloat(e.target.value))}
                    style={inputCss}
                    placeholder="19.25"
                  />
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>SYSCOHADA — TVA Cameroun : 19,25 %</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label htmlFor={id('proformaValidity')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
                    Validité proformas (jours)
                  </label>
                  <input
                    id={id('proformaValidity')}
                    type="number" min={1} max={365}
                    value={form.defaultProformaValidityDays ?? 30}
                    onChange={(e) => set('defaultProformaValidityDays', parseInt(e.target.value, 10))}
                    style={inputCss}
                  />
                </div>
                <div>
                  <label htmlFor={id('invoiceDue')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
                    Échéance factures (jours)
                  </label>
                  <input
                    id={id('invoiceDue')}
                    type="number" min={1} max={365}
                    value={form.defaultInvoiceDueDays ?? 30}
                    onChange={(e) => set('defaultInvoiceDueDays', parseInt(e.target.value, 10))}
                    style={inputCss}
                  />
                </div>
              </div>
            </div>
            {dirty && can('settings', 'update') && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <button
                  type="submit"
                  disabled={updateMut.isPending}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 22px', borderRadius: 'var(--radius-md)',
                    border: 'none', background: 'var(--primary)', color: '#fff',
                    cursor: updateMut.isPending ? 'not-allowed' : 'pointer',
                    fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700,
                    opacity: updateMut.isPending ? 0.65 : 1,
                  }}
                >
                  {updateMut.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                  Enregistrer
                </button>
              </div>
            )}
          </form>
        )
      }
    </div>
  )
}

// ─── Account field (sélecteur recherchable code + intitulé) ───
// Adapte AccountPicker (basé sur l'id) aux paramètres (basés sur le numéro).
function AccountField({ label, value, onChange }: {
  label: string; value: string | undefined; onChange: (n: string) => void
}) {
  const { data: accounts = [] } = useAccounts()
  const selectedId = accounts.find((a) => a.number === value)?.id ?? null
  return (
    <AccountPicker
      label={label}
      value={selectedId}
      leafOnly
      placeholder="Choisir un compte…"
      onChange={(a) => onChange(a?.number ?? '')}
    />
  )
}

// ─── Sous-groupe de comptes avec en-tête ──────────────────────
function AccountGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
        {title}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {children}
      </div>
    </div>
  )
}

// ─── Accounting accounts section ─────────────────────────────
function AccountingSection() {
  const { can } = usePermission()
  const { data: settings, isLoading } = useSettings()
  const updateMut = useUpdateSettings()
  const uid = useId()
  const id  = (s: string) => `${uid}-${s}`

  const [form, setForm] = useState<Pick<UpdateSettingsPayload,
    'initialStockAccount' | 'escompteAccountingAccount' | 'collectedTaxAccount' | 'deductibleTaxAccount'
    | 'stockAccount' | 'stockVariationAccount' | 'stockLossAccount'
    | 'defaultClientAccount' | 'defaultSupplierAccount' | 'defaultBankAccount'
    | 'defaultSalesGoodsAccount' | 'defaultSalesServiceAccount' | 'defaultPurchaseAccount'
    | 'defaultExpenseAccount' | 'useAdvanceAccount' | 'advanceAccount'>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!settings) return
    setForm({
      initialStockAccount:       settings.initialStockAccount,
      escompteAccountingAccount: settings.escompteAccountingAccount,
      collectedTaxAccount:       settings.collectedTaxAccount,
      deductibleTaxAccount:      settings.deductibleTaxAccount,
      stockAccount:              settings.stockAccount,
      stockVariationAccount:     settings.stockVariationAccount,
      stockLossAccount:          settings.stockLossAccount,
      defaultClientAccount:       settings.defaultClientAccount,
      defaultSupplierAccount:     settings.defaultSupplierAccount,
      defaultBankAccount:         settings.defaultBankAccount,
      defaultSalesGoodsAccount:   settings.defaultSalesGoodsAccount,
      defaultSalesServiceAccount: settings.defaultSalesServiceAccount,
      defaultPurchaseAccount:     settings.defaultPurchaseAccount,
      defaultExpenseAccount:      settings.defaultExpenseAccount,
      useAdvanceAccount:          settings.useAdvanceAccount,
      advanceAccount:             settings.advanceAccount,
    })
    setDirty(false)
  }, [settings])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    await updateMut.mutateAsync(form)
    setDirty(false)
  }

  return (
    <div className="card">
      <SectionHeader icon={<BookOpen size={15} />} title="Comptes comptables SYSCOHADA" />
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 16px' }}>
        Numéros de comptes du Plan Comptable SYSCOHADA utilisés pour les imputations automatiques.
      </p>
      {isLoading
        ? <div aria-hidden="true" style={{ height: 120, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
        : (
          <form onSubmit={handleSave} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <AccountGroup title="TVA">
                <AccountField label="TVA collectée"   value={form.collectedTaxAccount}  onChange={(v) => set('collectedTaxAccount', v)} />
                <AccountField label="TVA déductible"  value={form.deductibleTaxAccount} onChange={(v) => set('deductibleTaxAccount', v)} />
              </AccountGroup>
              <AccountGroup title="Stock — inventaire permanent">
                <AccountField label="Stock marchandises"    value={form.stockAccount}          onChange={(v) => set('stockAccount', v)} />
                <AccountField label="Variation des stocks"  value={form.stockVariationAccount} onChange={(v) => set('stockVariationAccount', v)} />
                <AccountField label="Perte / manquant"      value={form.stockLossAccount}      onChange={(v) => set('stockLossAccount', v)} />
                <AccountField label="Capital initial stock" value={form.initialStockAccount}   onChange={(v) => set('initialStockAccount', v)} />
              </AccountGroup>
              <AccountGroup title="Comptes tiers">
                <AccountField label="Client par défaut"     value={form.defaultClientAccount}   onChange={(v) => set('defaultClientAccount', v)} />
                <AccountField label="Fournisseur par défaut" value={form.defaultSupplierAccount} onChange={(v) => set('defaultSupplierAccount', v)} />
                <AccountField label="Banque par défaut"     value={form.defaultBankAccount}     onChange={(v) => set('defaultBankAccount', v)} />
              </AccountGroup>
              <AccountGroup title="Ventes · Achats · Charges">
                <AccountField label="Ventes de marchandises"  value={form.defaultSalesGoodsAccount}   onChange={(v) => set('defaultSalesGoodsAccount', v)} />
                <AccountField label="Prestations de services" value={form.defaultSalesServiceAccount} onChange={(v) => set('defaultSalesServiceAccount', v)} />
                <AccountField label="Achats de marchandises"  value={form.defaultPurchaseAccount}     onChange={(v) => set('defaultPurchaseAccount', v)} />
                <AccountField label="Charges / dépenses"      value={form.defaultExpenseAccount}      onChange={(v) => set('defaultExpenseAccount', v)} />
                <AccountField label="Escomptes accordés"      value={form.escompteAccountingAccount}  onChange={(v) => set('escompteAccountingAccount', v)} />
              </AccountGroup>
              <AccountGroup title="Avances et acomptes reçus (4191)">
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '2px 0' }}>
                  <input
                    type="checkbox"
                    checked={form.useAdvanceAccount ?? false}
                    onChange={(e) => set('useAdvanceAccount', e.target.checked)}
                    style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13 }}>
                    Comptabiliser les acomptes en <strong>avance reçue</strong> (Dr 411 / Cr 4191)
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.5 }}>
                      Désactivé : l&apos;acompte est une vente immédiate (au prorata). Activé : le produit
                      et la TVA sont reconnus à la livraison (facture de solde), conforme à la séparation
                      des exercices SYSCOHADA. ⚠️ À valider avec votre expert-comptable avant activation.
                    </span>
                  </span>
                </label>
                {(form.useAdvanceAccount ?? false) && (
                  <AccountField label="Compte avances reçues" value={form.advanceAccount} onChange={(v) => set('advanceAccount', v)} />
                )}
              </AccountGroup>
            </div>
            {dirty && can('settings', 'update') && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <button
                  type="submit"
                  disabled={updateMut.isPending}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 22px', borderRadius: 'var(--radius-md)',
                    border: 'none', background: 'var(--primary)', color: '#fff',
                    cursor: updateMut.isPending ? 'not-allowed' : 'pointer',
                    fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700,
                    opacity: updateMut.isPending ? 0.65 : 1,
                  }}
                >
                  {updateMut.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                  Enregistrer
                </button>
              </div>
            )}
          </form>
        )
      }
    </div>
  )
}

// ─── Tax Rate form (inline) ────────────────────────────────────
function TaxRateForm({ initial, onSave, onCancel, isPending }: {
  initial?: Partial<CreateTaxRatePayload>; onSave: (v: CreateTaxRatePayload) => void
  onCancel: () => void; isPending: boolean
}) {
  const [form, setForm] = useState<CreateTaxRatePayload>({
    name: initial?.name ?? '', code: initial?.code ?? '',
    rate: initial?.rate ?? 0, description: initial?.description ?? '',
    isDefault: initial?.isDefault ?? false,
  })
  const uid = useId()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px auto auto auto', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'rgba(45,125,210,0.04)', borderRadius: 'var(--radius-md)', border: '1.5px dashed rgba(45,125,210,0.25)' }}>
      <div>
        <label htmlFor={`${uid}-name`} className="sr-only">Nom du taux</label>
        <input id={`${uid}-name`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nom (ex: TVA Standard)" style={inputCss} />
      </div>
      <div>
        <label htmlFor={`${uid}-code`} className="sr-only">Code du taux</label>
        <input id={`${uid}-code`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="Code" style={inputCss} />
      </div>
      <div>
        <label htmlFor={`${uid}-rate`} className="sr-only">Taux en pourcentage</label>
        <input id={`${uid}-rate`} type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: parseFloat(e.target.value) })} placeholder="%" min={0} max={100} step={0.01} style={inputCss} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
        Défaut
      </label>
      <button type="button" aria-label="Enregistrer le taux" onClick={() => onSave(form)} disabled={!form.name || !form.code || isPending}
        style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: isPending ? 0.65 : 1, minHeight: 44 }}>
        {isPending ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
      </button>
      <button type="button" aria-label="Annuler" onClick={onCancel}
        style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: 44 }}>
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  )
}

// ─── Tax Rates section ────────────────────────────────────────
function TaxRatesSection() {
  const { data: rates = [], isLoading } = useTaxRates(true)
  const createMut = useCreateTaxRate()
  const updateMut = useUpdateTaxRate()
  const deleteMut = useDeleteTaxRate()
  const [creating, setCreating] = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TaxRate | null>(null)

  return (
    <div className="card">
      <SectionHeader icon={<Percent size={15} />} title="Taux de TVA" onAdd={() => setCreating(true)} addLabel="Ajouter un taux" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Header row */}
        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px auto 80px', gap: 8, padding: '0 12px' }}>
          {['Nom', 'Code', 'Taux %', '', 'Actions'].map((h) => (
            <span key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
          ))}
        </div>
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} aria-hidden="true" style={{ height: 40, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />)
          : rates.map((r) => editId === r.id
            ? (
              <TaxRateForm
                key={r.id}
                initial={{ ...r, description: r.description ?? undefined }}
                isPending={updateMut.isPending}
                onSave={(v) => updateMut.mutate({ id: r.id, ...v }, { onSuccess: () => setEditId(null) })}
                onCancel={() => setEditId(null)}
              />
            )
            : (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px auto 80px', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', opacity: r.isActive ? 1 : 0.5 }}>
                <span style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: r.isDefault ? 600 : 400, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {r.isDefault && <Star size={11} style={{ color: '#f59e0b', fill: '#f59e0b' }} aria-hidden="true" />}
                  {r.name}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.code}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{r.rate}%</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: r.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)', color: r.isActive ? '#10b981' : '#6b7280', fontFamily: 'var(--font-display)', fontWeight: 700, width: 'fit-content' }}>
                  {r.isActive ? 'Actif' : 'Inactif'}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" aria-label={`Modifier le taux ${r.name}`} onClick={() => setEditId(r.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4, minHeight: 44, display: 'flex', alignItems: 'center' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
                    onFocus={(e)      => { e.currentTarget.style.color = 'var(--primary)' }}
                    onBlur={(e)       => { e.currentTarget.style.color = 'var(--text-3)' }}>
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  {!r.isDefault && (
                    <button type="button" aria-label={`Supprimer le taux ${r.name}`}
                      onClick={() => setDeleteTarget(r)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4, minHeight: 44, display: 'flex', alignItems: 'center' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
                      onFocus={(e)      => { e.currentTarget.style.color = '#ef4444' }}
                      onBlur={(e)       => { e.currentTarget.style.color = 'var(--text-3)' }}>
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )
          )
        }
        {creating && (
          <TaxRateForm
            isPending={createMut.isPending}
            onSave={(v) => createMut.mutate(v, { onSuccess: () => setCreating(false) })}
            onCancel={() => setCreating(false)}
          />
        )}
      </div>
      {deleteTarget && (
        <ConfirmDeleteModal
          label={deleteTarget.name}
          onConfirm={() => deleteMut.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMut.isPending}
        />
      )}
    </div>
  )
}

// ─── Office form (inline) ──────────────────────────────────────
function OfficeForm({ initial, onSave, onCancel, isPending }: {
  initial?: Partial<CreateOfficePayload>; onSave: (v: CreateOfficePayload) => void
  onCancel: () => void; isPending: boolean
}) {
  const [form, setForm] = useState<CreateOfficePayload>({
    code: initial?.code ?? '', name: initial?.name ?? '',
    city: initial?.city ?? '', address: initial?.address ?? '',
    isDefault: initial?.isDefault ?? false,
  })
  const uid = useId()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr auto auto auto', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'rgba(45,125,210,0.04)', borderRadius: 'var(--radius-md)', border: '1.5px dashed rgba(45,125,210,0.25)' }}>
      <div>
        <label htmlFor={`${uid}-code`} className="sr-only">Code du bureau</label>
        <input id={`${uid}-code`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="Code (DC)" style={inputCss} maxLength={10} />
      </div>
      <div>
        <label htmlFor={`${uid}-name`} className="sr-only">Nom du bureau</label>
        <input id={`${uid}-name`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nom du bureau" style={inputCss} />
      </div>
      <div>
        <label htmlFor={`${uid}-city`} className="sr-only">Ville</label>
        <input id={`${uid}-city`} value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Ville" style={inputCss} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
        Principal
      </label>
      <button type="button" aria-label="Enregistrer le bureau" onClick={() => onSave(form)} disabled={!form.code || !form.name || isPending}
        style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: isPending ? 0.65 : 1, minHeight: 44 }}>
        {isPending ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
      </button>
      <button type="button" aria-label="Annuler" onClick={onCancel}
        style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: 44 }}>
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  )
}

// ─── Offices section ──────────────────────────────────────────
function OfficesSection() {
  const { data: offices = [], isLoading } = useOffices()
  const createMut = useCreateOffice()
  const updateMut = useUpdateOffice()
  const deleteMut = useDeleteOffice()
  const [creating, setCreating] = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Office | null>(null)

  return (
    <div className="card">
      <SectionHeader icon={<Building size={15} />} title="Bureaux & Agences" onAdd={() => setCreating(true)} addLabel="Ajouter un bureau" />
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
        Les codes bureaux sont utilisés dans la numérotation SYSCOHADA : BTS/<strong>DC</strong>/2026/01/FAC001
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr auto 80px', gap: 8, padding: '0 12px' }}>
          {['Code', 'Nom', 'Ville', '', 'Actions'].map((h) => (
            <span key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
          ))}
        </div>
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => <div key={i} aria-hidden="true" style={{ height: 40, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />)
          : offices.filter((o) => !o.deletedAt).map((o) => editId === o.id
            ? (
              <OfficeForm
                key={o.id}
                initial={{ ...o, city: o.city ?? undefined, address: o.address ?? undefined }}
                isPending={updateMut.isPending}
                onSave={(v) => updateMut.mutate({ id: o.id, ...v }, { onSuccess: () => setEditId(null) })}
                onCancel={() => setEditId(null)}
              />
            )
            : (
              <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr auto 80px', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{o.code}</span>
                <span style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: o.isDefault ? 600 : 400, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {o.isDefault && <Star size={11} style={{ color: '#f59e0b', fill: '#f59e0b' }} aria-hidden="true" />}
                  {o.name}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{o.city ?? '—'}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: o.isDefault ? 'rgba(45,125,210,0.1)' : 'var(--surface-2)', color: o.isDefault ? 'var(--primary)' : 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, width: 'fit-content' }}>
                  {o.isDefault ? 'Principal' : 'Agence'}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" aria-label={`Modifier le bureau ${o.name}`} onClick={() => setEditId(o.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4, minHeight: 44, display: 'flex', alignItems: 'center' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
                    onFocus={(e)      => { e.currentTarget.style.color = 'var(--primary)' }}
                    onBlur={(e)       => { e.currentTarget.style.color = 'var(--text-3)' }}>
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  {!o.isDefault && (
                    <button type="button" aria-label={`Supprimer le bureau ${o.name}`}
                      onClick={() => setDeleteTarget(o)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4, minHeight: 44, display: 'flex', alignItems: 'center' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
                      onFocus={(e)      => { e.currentTarget.style.color = '#ef4444' }}
                      onBlur={(e)       => { e.currentTarget.style.color = 'var(--text-3)' }}>
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )
          )
        }
        {creating && (
          <OfficeForm
            isPending={createMut.isPending}
            onSave={(v) => createMut.mutate(v, { onSuccess: () => setCreating(false) })}
            onCancel={() => setCreating(false)}
          />
        )}
      </div>
      {deleteTarget && (
        <ConfirmDeleteModal
          label={deleteTarget.name}
          onConfirm={() => deleteMut.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMut.isPending}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function BillingSettingsPage() {
  const { can } = usePermission()
  if (!can('settings', 'read')) return <AccessDenied />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
          Finance &amp; TVA
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
          Paramètres financiers, taux de TVA et bureaux SYSCOHADA
        </p>
      </div>
      <GlobalFinanceSection />
      <AccountingSection />
      <TaxRatesSection />
      <OfficesSection />
    </div>
  )
}
