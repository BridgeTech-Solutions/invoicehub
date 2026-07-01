'use client'

import { OverlayPortal } from '@/components/ui/OverlayPortal'

import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { X, Loader2, Shield, ChevronDown, ChevronRight } from 'lucide-react'
import { useCreateRole, useUpdateRole } from '../hooks'
import { PERMISSION_GROUPS, PERM_ACTION_LABELS } from '../types'
import type { RoleEntry } from '../types'

interface Props {
  onClose:    () => void
  editRole?:  RoleEntry
}

type ExpandedMap = Record<string, boolean>

function getAction(perm: string): string {
  return perm.split(':').slice(1).join(':')
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function RoleDrawer({ onClose, editRole }: Props) {
  const isEdit   = !!editRole
  const titleId  = useId()
  const drawerRef = useRef<HTMLDivElement>(null)

  const createMut = useCreateRole()
  const updateMut = useUpdateRole()
  const isPending = createMut.isPending || updateMut.isPending

  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  const [displayName, setDisplayName]   = useState(editRole?.displayName ?? '')
  const [name,        setName]          = useState(editRole?.name ?? '')
  const [nameManual,  setNameManual]    = useState(isEdit)
  const [permissions, setPermissions]   = useState<Set<string>>(
    new Set(editRole?.permissions ?? []),
  )
  const [expanded, setExpanded] = useState<ExpandedMap>({})
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  // Auto-generate slug from displayName (only in create mode)
  useEffect(() => {
    if (!isEdit && !nameManual && displayName) {
      setName(slugify(displayName))
    }
  }, [displayName, isEdit, nameManual])

  // Escape key closes
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [handleClose])

  // Focus first field on open
  useEffect(() => {
    setTimeout(() => {
      drawerRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    }, 60)
  }, [])

  const hasAll = permissions.has('*')

  function togglePerm(perm: string) {
    setPermissions((prev) => {
      const next = new Set(prev)
      if (perm === '*') {
        if (next.has('*')) next.delete('*')
        else {
          next.clear()
          next.add('*')
        }
      } else {
        if (next.has(perm)) next.delete(perm)
        else next.add(perm)
      }
      return next
    })
  }

  function toggleModule(perms: string[]) {
    const allActive = perms.every((p) => hasAll || permissions.has(p))
    setPermissions((prev) => {
      const next = new Set(prev)
      if (allActive) {
        perms.forEach((p) => next.delete(p))
      } else {
        perms.forEach((p) => next.add(p))
      }
      return next
    })
  }

  function toggleExpanded(module: string) {
    setExpanded((prev) => ({ ...prev, [module]: !prev[module] }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!displayName.trim()) e.displayName = 'Requis'
    if (!isEdit && !name.trim()) e.name = 'Requis'
    if (!isEdit && !/^[a-z_]+$/.test(name)) e.name = 'Minuscules et underscores uniquement'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    try {
      if (isEdit) {
        await updateMut.mutateAsync({
          id:   editRole.id,
          data: { displayName: displayName.trim(), permissions: Array.from(permissions) },
        })
      } else {
        await createMut.mutateAsync({
          name:        name.trim(),
          displayName: displayName.trim(),
          permissions: Array.from(permissions),
        })
      }
      handleClose()
    } catch {
      // Toast shown by hook
    }
  }

  const inputCss: React.CSSProperties = {
    padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <OverlayPortal>
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)',
          opacity: isVisible ? 1 : 0, transition: 'opacity 0.28s ease',
        }}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position:   'fixed',
          top: 0, right: 0, bottom: 0,
          zIndex:     301,
          width:      '100%',
          maxWidth:   580,
          background: 'var(--surface)',
          boxShadow:  '-8px 0 40px rgba(10,20,35,0.18), -2px 0 8px rgba(10,20,35,0.08)',
          borderLeft: '1px solid var(--border)',
          display:    'flex',
          flexDirection: 'column',
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Navy → primary gradient stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#0f2d4a 0%,#2D7DD2 100%)', flexShrink: 0 }} />
        {/* Header */}
        <div style={{
          padding:      '18px 22px',
          borderBottom: '1px solid var(--border)',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          flexShrink:   0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              aria-hidden="true"
              style={{
                width: 34, height: 34, borderRadius: 'var(--radius-md)',
                background: 'rgba(45,125,210,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Shield size={16} style={{ color: 'var(--primary)' }} />
            </div>
            <h2
              id={titleId}
              style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}
            >
              {isEdit ? `Modifier — ${editRole.displayName}` : 'Créer un rôle'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fermer"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', minWidth: 44, minHeight: 44,
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <form
          id={`${titleId}-form`}
          onSubmit={handleSubmit}
          style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}
        >
          {/* Info section */}
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14, borderBottom: '1px solid var(--border)' }}>
            <div>
              <label
                htmlFor={`${titleId}-display`}
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}
              >
                Nom affiché <span aria-hidden="true" style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id={`${titleId}-display`}
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setErrors((err) => ({ ...err, displayName: '' })) }}
                placeholder="Ex : Commercial Senior"
                style={{ ...inputCss, borderColor: errors.displayName ? '#ef4444' : 'var(--border)' }}
              />
              {errors.displayName && (
                <p role="alert" style={{ fontSize: 11, color: '#ef4444', margin: '3px 0 0' }}>{errors.displayName}</p>
              )}
            </div>

            {!isEdit && (
              <div>
                <label
                  htmlFor={`${titleId}-name`}
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}
                >
                  Identifiant (slug) <span aria-hidden="true" style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id={`${titleId}-name`}
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameManual(true); setErrors((err) => ({ ...err, name: '' })) }}
                  placeholder="commercial_senior"
                  style={{ ...inputCss, fontFamily: 'var(--font-mono)', fontSize: 13, borderColor: errors.name ? '#ef4444' : 'var(--border)' }}
                />
                {errors.name
                  ? <p role="alert" style={{ fontSize: 11, color: '#ef4444', margin: '3px 0 0' }}>{errors.name}</p>
                  : <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>Minuscules et underscores uniquement — immuable après création</p>
                }
              </div>
            )}
          </div>

          {/* Permissions section */}
          <div style={{ padding: '16px 22px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
                Permissions
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={hasAll}
                    onChange={() => togglePerm('*')}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: hasAll ? 'var(--primary)' : 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
                    Accès total (*)
                  </span>
                </label>
              </div>
            </div>

            {!hasAll && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {PERMISSION_GROUPS.map((group) => {
                  const isExpanded   = expanded[group.module] ?? false
                  const activeCount  = group.perms.filter((p) => permissions.has(p)).length
                  const allActive    = activeCount === group.perms.length
                  const someActive   = activeCount > 0 && !allActive

                  return (
                    <div
                      key={group.module}
                      style={{
                        border:       '1.5px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        overflow:     'hidden',
                        background:   allActive ? 'rgba(16,185,129,0.03)' : someActive ? 'rgba(245,158,11,0.02)' : 'transparent',
                        borderColor:  allActive ? 'rgba(16,185,129,0.2)' : someActive ? 'rgba(245,158,11,0.2)' : 'var(--border)',
                      }}
                    >
                      {/* Group header */}
                      <div
                        style={{
                          display:       'flex',
                          alignItems:    'center',
                          justifyContent: 'space-between',
                          padding:       '8px 12px',
                          cursor:        'pointer',
                          userSelect:    'none',
                        }}
                        onClick={() => toggleExpanded(group.module)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={allActive}
                            ref={(el) => {
                              if (el) el.indeterminate = someActive
                            }}
                            onChange={(e) => { e.stopPropagation(); toggleModule(group.perms) }}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Activer tout le module ${group.label}`}
                            style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--primary)', flexShrink: 0 }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
                            {group.label}
                          </span>
                          {activeCount > 0 && (
                            <span style={{
                              fontSize: 10.5, fontWeight: 700,
                              padding: '1px 6px', borderRadius: 100,
                              background: allActive ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                              color:      allActive ? '#059669' : '#d97706',
                              fontFamily: 'var(--font-display)',
                            }}>
                              {activeCount}/{group.perms.length}
                            </span>
                          )}
                        </div>
                        {isExpanded
                          ? <ChevronDown size={14} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                          : <ChevronRight size={14} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                        }
                      </div>

                      {/* Permissions list */}
                      {isExpanded && (
                        <div style={{
                          padding:      '8px 12px 12px',
                          borderTop:    '1px solid var(--border)',
                          display:      'flex',
                          flexWrap:     'wrap',
                          gap:          6,
                        }}>
                          {group.perms.map((perm) => {
                            const active = permissions.has(perm)
                            const action = getAction(perm)
                            const label  = PERM_ACTION_LABELS[action] ?? action
                            return (
                              <label
                                key={perm}
                                style={{
                                  display:    'inline-flex',
                                  alignItems: 'center',
                                  gap:        5,
                                  cursor:     'pointer',
                                  padding:    '4px 10px',
                                  borderRadius: 100,
                                  border:     `1.5px solid ${active ? 'rgba(45,125,210,0.3)' : 'var(--border)'}`,
                                  background: active ? 'rgba(45,125,210,0.07)' : 'var(--surface)',
                                  transition: 'all 0.12s',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => togglePerm(perm)}
                                  style={{ width: 12, height: 12, accentColor: 'var(--primary)', cursor: 'pointer' }}
                                />
                                <span style={{
                                  fontSize:   11.5,
                                  fontWeight: active ? 600 : 400,
                                  color:      active ? 'var(--primary)' : 'var(--text-2)',
                                  fontFamily: 'var(--font-display)',
                                }}>
                                  {label}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {hasAll && (
              <div style={{
                padding:      '20px',
                borderRadius: 'var(--radius-md)',
                border:       '1.5px solid rgba(45,125,210,0.2)',
                background:   'rgba(45,125,210,0.04)',
                textAlign:    'center',
              }}>
                <Shield size={28} style={{ color: 'var(--primary)', display: 'block', margin: '0 auto 8px' }} aria-hidden="true" />
                <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
                  Accès total activé
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
                  Ce rôle a accès à toutes les fonctionnalités
                </p>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div style={{
          padding:      '14px 22px',
          borderTop:    '1px solid var(--border)',
          display:      'flex',
          gap:          10,
          flexShrink:   0,
          background:   'var(--bg)',
        }}>
          <button
            type="button"
            onClick={handleClose}
            style={{
              flex: 1, minHeight: 44, borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'transparent',
              color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5,
              fontFamily: 'var(--font-display)', fontWeight: 600,
            }}
          >
            Annuler
          </button>
          <button
            type="submit"
            form={`${titleId}-form`}
            disabled={isPending}
            aria-busy={isPending}
            style={{
              flex: 2, minHeight: 44, borderRadius: 'var(--radius-md)',
              border: 'none', background: 'var(--primary)', color: '#fff',
              cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13.5,
              fontFamily: 'var(--font-display)', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: isPending ? 0.65 : 1,
              boxShadow: isPending ? 'none' : '0 4px 12px rgba(45,125,210,0.3)',
            }}
          >
            {isPending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {isEdit ? 'Enregistrer' : 'Créer le rôle'}
          </button>
        </div>
      </div>
    </>
    </OverlayPortal>
  )
}
