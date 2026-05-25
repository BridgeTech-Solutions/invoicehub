'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'

interface TipTapEditorProps {
  value:    string
  onChange: (html: string) => void
  id?:      string
}

const btnBase: React.CSSProperties = {
  padding: '4px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent',
  cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-display)',
  lineHeight: 1, transition: 'all 0.15s', minHeight: 28,
}

function ToolbarBtn({
  onClick, active, title, children,
}: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      style={{
        ...btnBase,
        background:   active ? 'var(--primary)' : 'transparent',
        color:        active ? '#fff' : 'var(--text-2)',
        borderColor:  active ? 'var(--primary)' : 'var(--border)',
        fontWeight:   active ? 700 : 400,
      }}
    >
      {children}
    </button>
  )
}

export function TipTapEditor({ value, onChange, id }: TipTapEditorProps) {
  const prevValue = useRef(value)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
    ],
    content: value,
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML()
      prevValue.current = html
      onChange(html)
    },
    immediatelyRender: false,
  })

  // Sync external value changes (e.g. restore default)
  useEffect(() => {
    if (!editor) return
    if (value !== prevValue.current) {
      prevValue.current = value
      // Temporarily suppress the onUpdate callback to avoid a loop
      editor.commands.setContent(value)
    }
  }, [value, editor])

  if (!editor) return null

  return (
    <div id={id} style={{ border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Gras (Ctrl+B)">
          <strong>G</strong>
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italique (Ctrl+I)">
          <em>I</em>
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Barré">
          <span style={{ textDecoration: 'line-through' }}>S</span>
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="Surligner">
          H
        </ToolbarBtn>
        <div aria-hidden="true" style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Titre H2">
          H2
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Titre H3">
          H3
        </ToolbarBtn>
        <div aria-hidden="true" style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Aligner à gauche">
          ≡
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Centrer">
          ≡
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Aligner à droite">
          ≡
        </ToolbarBtn>
        <div aria-hidden="true" style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Liste à puces">
          •—
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Liste numérotée">
          1—
        </ToolbarBtn>
        <div aria-hidden="true" style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Annuler">↩</ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Rétablir">↪</ToolbarBtn>
      </div>

      {/* Editor content */}
      <EditorContent
        editor={editor}
        style={{ minHeight: 200, padding: '12px 14px', color: 'var(--text-1)', fontSize: 13.5, lineHeight: 1.6 }}
      />

      <style>{`
        .tiptap { outline: none; }
        .tiptap p { margin: 0 0 8px; }
        .tiptap h2 { font-size: 18px; font-weight: 700; margin: 12px 0 6px; }
        .tiptap h3 { font-size: 15px; font-weight: 700; margin: 10px 0 4px; }
        .tiptap ul, .tiptap ol { margin: 0 0 8px; padding-left: 20px; }
        .tiptap a { color: var(--primary); text-decoration: underline; }
        .tiptap mark { background: #fef08a; color: inherit; }
        .tiptap strong { font-weight: 700; }
      `}</style>
    </div>
  )
}
