import type { Editor } from '@tiptap/react'

interface ToolbarProps {
  editor: Editor
}

export function EditorToolbar({ editor }: ToolbarProps) {
  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    background: active ? 'var(--accent-muted)' : 'transparent',
    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
  })

  const sepStyle: React.CSSProperties = {
    width: 1,
    height: 16,
    background: 'var(--border-subtle)',
    margin: '0 4px',
  }

  return (
    <div style={{ height: 36, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
      {/* Headings */}
      <button
        style={btnStyle(editor.isActive('heading', { level: 1 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="标题 1"
      >
        <span style={{ fontSize: 12, fontWeight: 700 }}>H1</span>
      </button>
      <button
        style={btnStyle(editor.isActive('heading', { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="标题 2"
      >
        <span style={{ fontSize: 12, fontWeight: 700 }}>H2</span>
      </button>
      <button
        style={btnStyle(editor.isActive('heading', { level: 3 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="标题 3"
      >
        <span style={{ fontSize: 12, fontWeight: 700 }}>H3</span>
      </button>

      <div style={sepStyle} />

      {/* Bold */}
      <button
        style={btnStyle(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="粗体 (Ctrl+B)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
        </svg>
      </button>

      {/* Italic */}
      <button
        style={btnStyle(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="斜体 (Ctrl+I)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" />
        </svg>
      </button>

      {/* Strikethrough */}
      <button
        style={btnStyle(editor.isActive('strike'))}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="删除线 (Ctrl+Shift+X)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4H9a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3h6" /><path d="M8 20h7a3 3 0 0 0 3-3v0a3 3 0 0 0-3-3H4" /><line x1="4" y1="12" x2="20" y2="12" />
        </svg>
      </button>

      {/* Code */}
      <button
        style={btnStyle(editor.isActive('code'))}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="行内代码 (Ctrl+E)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
        </svg>
      </button>

      <div style={sepStyle} />

      {/* Bullet list */}
      <button
        style={btnStyle(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="无序列表"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" />
        </svg>
      </button>

      {/* Ordered list */}
      <button
        style={btnStyle(editor.isActive('orderedList'))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="有序列表"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
          <text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
          <text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
          <text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
        </svg>
      </button>

      {/* Blockquote */}
      <button
        style={btnStyle(editor.isActive('blockquote'))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="引用"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 8c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h2v-2H10v-2h2V8h-2zm6 0c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h2v-2h-2v-2h2V8h-2z" />
        </svg>
      </button>

      {/* Code block */}
      <button
        style={btnStyle(editor.isActive('codeBlock'))}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="代码块"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><polyline points="9 8 5 12 9 16" /><polyline points="15 8 19 12 15 16" />
        </svg>
      </button>

      <div style={sepStyle} />

      {/* Horizontal rule */}
      <button
        style={btnStyle(false)}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="分割线"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      </button>
    </div>
  )
}
