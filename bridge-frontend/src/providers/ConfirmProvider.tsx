'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export interface ConfirmOptions {
  title:         string
  message?:      React.ReactNode
  confirmLabel?: string
  cancelLabel?:  string
  tone?:         'default' | 'danger' | 'warning'
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * useConfirm — confirmation modale impérative, en remplacement de window.confirm().
 *
 * @example
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: 'Supprimer ?', tone: 'danger' }))) return
 *   await deleteMutation.mutateAsync(id)
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm doit être utilisé dans <ConfirmProvider>')
  return ctx
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; opts: ConfirmOptions }>({ open: false, opts: { title: '' } })
  const resolverRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setState({ open: true, opts })
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve })
  }, [])

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value)
    resolverRef.current = null
    setState((s) => ({ ...s, open: false }))
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={state.open}
        title={state.opts.title}
        message={state.opts.message}
        confirmLabel={state.opts.confirmLabel}
        cancelLabel={state.opts.cancelLabel}
        tone={state.opts.tone}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  )
}
