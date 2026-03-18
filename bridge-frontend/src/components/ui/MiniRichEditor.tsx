'use client'

import { useRef, useEffect, useCallback, Fragment } from 'react'
import { Bold, Italic, Underline, List, ListOrdered, Minus } from 'lucide-react'

interface MiniRichEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}

type FormatCmd = 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList' | 'insertHorizontalRule'

const TOOLBAR: { cmd: FormatCmd; icon: React.ElementType; title: string }[] = [
  { cmd: 'bold',                  icon: Bold,          title: 'Gras (Ctrl+B)'      },
  { cmd: 'italic',                icon: Italic,        title: 'Italique (Ctrl+I)'  },
  { cmd: 'underline',             icon: Underline,     title: 'Souligné (Ctrl+U)'  },
  { cmd: 'insertUnorderedList',   icon: List,          title: 'Liste à puces'      },
  { cmd: 'insertOrderedList',     icon: ListOrdered,   title: 'Liste numérotée'    },
  { cmd: 'insertHorizontalRule',  icon: Minus,         title: 'Séparateur'         },
]

export function MiniRichEditor({ value, onChange, placeholder = 'Description...', minHeight = 96 }: MiniRichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  // null initial → garantit que l'effet de montage injecte toujours value dans innerHTML
  const lastValueRef = useRef<string | null>(null)

  // Sync incoming value only when it differs from what we currently show
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (el.innerHTML !== value && value !== lastValueRef.current) {
      el.innerHTML = value
      lastValueRef.current = value
    }
  }, [value])

  const execCmd = useCallback((cmd: FormatCmd) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false)
    const html = editorRef.current?.innerHTML ?? ''
    lastValueRef.current = html
    onChange(html)
  }, [onChange])

  const handleInput = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? ''
    lastValueRef.current = html
    onChange(html)
  }, [onChange])

  // Show placeholder via CSS data-attribute
  const isEmpty = !value || value === '<br>'

  return (
    <div style={{
      borderRadius: 'var(--radius-md)',
      border: '1.5px solid var(--border)',
      background: 'var(--surface)',
      overflow: 'hidden',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}
      onFocus={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--primary)'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 3px var(--primary-light)'
      }}
      onBlur={(e) => {
        // Only blur if focus left the whole component
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
          ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
        }
      }}
    >
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
        padding: '6px 8px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}>
        {TOOLBAR.map(({ cmd, icon: Icon, title }, i) => (
          <Fragment key={cmd}>
            {i === 3 && (
              <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
            )}
            {i === 5 && (
              <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
            )}
            <button
              type="button"
              title={title}
              onMouseDown={(e) => {
                // Prevent blur on editor
                e.preventDefault()
                execCmd(cmd)
              }}
              style={{
                width: 28, height: 28, borderRadius: 5,
                border: 'none', background: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-2)',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)'
              }}
            >
              <Icon size={13} strokeWidth={2} />
            </button>
          </Fragment>
        ))}
      </div>

      {/* Editable area */}
      <div style={{ position: 'relative' }}>
        {isEmpty && (
          <span
            aria-hidden
            style={{
              position: 'absolute', top: 0, left: 0,
              padding: '9px 12px',
              fontSize: 14, color: 'var(--text-3)',
              fontFamily: 'var(--font-body)',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          spellCheck
          style={{
            minHeight,
            padding: '9px 12px',
            fontSize: 14, color: 'var(--text-1)',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.6,
            outline: 'none',
          }}
          // Rich text styles embedded via CSS-in-JS globals via className
          className="rich-editor-content"
        />
      </div>
    </div>
  )
}
