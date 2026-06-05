import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { Editor } from '@tiptap/react'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { safeSet } from '../../utils/storage'
import type { LocalPlugin } from '@shared/types/ipc'

interface SlashItem {
  id?: string
  title: string
  description: string
  icon: string
  keywords: string[]
  action: (editor: Editor) => void
}

interface AICommandDraft {
  prompt: string
  mode?: 'chat' | 'edit'
}

const SLASH_ITEMS: SlashItem[] = [
  {
    title: '标题 1',
    description: '大标题',
    icon: 'H1',
    keywords: ['h1', 'heading', 'title', '标题'],
    action: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run()
  },
  {
    title: '标题 2',
    description: '中标题',
    icon: 'H2',
    keywords: ['h2', 'heading', '标题'],
    action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run()
  },
  {
    title: '标题 3',
    description: '小标题',
    icon: 'H3',
    keywords: ['h3', 'heading', '标题'],
    action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run()
  },
  {
    title: '无序列表',
    description: '项目符号列表',
    icon: 'list',
    keywords: ['bullet', 'list', 'ul', '列表'],
    action: (editor) => editor.chain().focus().toggleBulletList().run()
  },
  {
    title: '有序列表',
    description: '编号列表',
    icon: 'list-ordered',
    keywords: ['ordered', 'list', 'ol', '编号'],
    action: (editor) => editor.chain().focus().toggleOrderedList().run()
  },
  {
    title: '任务列表',
    description: '待办事项',
    icon: 'check',
    keywords: ['task', 'todo', 'checkbox', '任务', '待办'],
    action: (editor) => editor.chain().focus().toggleTaskList().run()
  },
  {
    title: '引用',
    description: '引用块',
    icon: 'quote',
    keywords: ['quote', 'blockquote', '引用'],
    action: (editor) => editor.chain().focus().toggleBlockquote().run()
  },
  {
    title: '代码块',
    description: '代码片段',
    icon: 'code',
    keywords: ['code', 'codeblock', '代码'],
    action: (editor) => editor.chain().focus().toggleCodeBlock().run()
  },
  {
    title: '表格',
    description: '3x3 表格',
    icon: 'table',
    keywords: ['table', '表格'],
    action: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  },
  {
    title: '分割线',
    description: '水平分隔',
    icon: 'hr',
    keywords: ['hr', 'divider', 'horizontal', '分割', '分隔'],
    action: (editor) => editor.chain().focus().setHorizontalRule().run()
  },
  {
    title: '高亮',
    description: '高亮文本',
    icon: 'highlight',
    keywords: ['highlight', 'mark', '高亮'],
    action: (editor) => editor.chain().focus().toggleHighlight().run()
  },
  {
    title: '今日日期',
    description: '插入当前日期',
    icon: 'date',
    keywords: ['date', 'today', '日期', '今天'],
    action: (editor) => {
      const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
      editor.chain().focus().insertContent(today).run()
    }
  },
  {
    title: '数学公式',
    description: '行内 LaTeX 公式',
    icon: 'math',
    keywords: ['math', 'latex', 'formula', '公式', '数学'],
    action: (editor) => editor.chain().focus().insertContent('$$').run()
  },
]

export function SlashCommandMenu({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [slashPos, setSlashPos] = useState(-1)
  const [plugins, setPlugins] = useState<LocalPlugin[]>([])
  const menuRef = useRef<HTMLDivElement>(null)
  const { vaultPath } = useVaultStore()
  const { setRightPanel } = useUIStore()

  const queueAiDraft = useCallback((draft: AICommandDraft) => {
    safeSet('nexusky-pending-ai-draft', JSON.stringify(draft))
    setRightPanel('chat')
    window.dispatchEvent(new CustomEvent('ai-command-draft', { detail: draft }))
  }, [setRightPanel])

  const items = useMemo<SlashItem[]>(() => [
    ...SLASH_ITEMS,
    ...plugins.flatMap((plugin) => plugin.commands.map((command) => ({
      id: `plugin:${plugin.id}:${command.id}`,
      title: command.title,
      description: command.description || plugin.name,
      icon: 'plugin',
      keywords: ['plugin', 'ai', plugin.id, plugin.name, command.id, command.title, command.description || ''],
      action: () => queueAiDraft({ mode: command.mode || 'chat', prompt: command.prompt })
    })))
  ], [plugins, queueAiDraft])

  const filtered = useMemo(() => items.filter((item) => {
    if (!query) return true
    const q = query.toLowerCase()
    return item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.toLowerCase().includes(q))
  }), [items, query])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setSelectedIndex(0)
    setSlashPos(-1)
  }, [])

  const executeItem = useCallback((item: SlashItem) => {
    if (!editor || slashPos < 0) return
    editor.chain().focus().deleteRange({ from: slashPos, to: editor.state.selection.from }).run()
    item.action(editor)
    close()
  }, [editor, slashPos, close])

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      const { from } = detail
      setSlashPos(from)
      setOpen(true)
      setQuery('')
      setSelectedIndex(0)

      setTimeout(() => {
        if (!editor) return
        const coords = editor.view.coordsAtPos(from)
        setPosition({ x: coords.left, y: coords.bottom + 4 })
      }, 0)
    }
    window.addEventListener('slash-command-open', handleOpen)
    return () => window.removeEventListener('slash-command-open', handleOpen)
  }, [editor])

  useEffect(() => {
    if (!open || !editor) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[selectedIndex]) executeItem(filtered[selectedIndex])
        return
      }
      if (e.key === 'Backspace') {
        const { from } = editor.state.selection
        if (from <= slashPos) {
          close()
          return
        }
      }
    }

    const handleUpdate = () => {
      if (!editor) return
      const { from } = editor.state.selection
      if (from < slashPos) { close(); return }
      const text = editor.state.doc.textBetween(slashPos, from)
      if (text.startsWith('/')) {
        setQuery(text.slice(1))
      } else {
        close()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    editor.on('update', handleUpdate)
    editor.on('selectionUpdate', handleUpdate)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      editor.off('update', handleUpdate)
      editor.off('selectionUpdate', handleUpdate)
    }
  }, [open, editor, slashPos, selectedIndex, filtered, executeItem, close])

  useEffect(() => {
    if (!open || !vaultPath) {
      setPlugins([])
      return
    }
    let cancelled = false
    window.api.invoke('plugins:list', { vaultPath })
      .then((result) => {
        if (!cancelled) setPlugins(result)
      })
      .catch(() => {
        if (!cancelled) setPlugins([])
      })
    return () => {
      cancelled = true
    }
  }, [open, vaultPath])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, close])

  if (!open || filtered.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="glass-popover"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 100,
        width: 240,
        maxHeight: 320,
        overflowY: 'auto',
        background: 'var(--bg-glass-dense, var(--bg-glass-solid))',
        border: '1px solid var(--glass-panel-border)',
        borderRadius: 10,
        padding: 4,
        boxShadow: 'var(--shadow-popover), var(--glass-panel-edge-shadow)',
        backdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)',
        WebkitBackdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)',
      }}
    >
      {filtered.map((item, i) => (
        <button
          key={item.id || item.title}
          onClick={() => executeItem(item)}
          style={{
            width: '100%',
            height: 36,
            padding: '0 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: 'var(--text-primary)',
            background: i === selectedIndex ? 'var(--accent-muted)' : 'transparent',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            textAlign: 'left',
          }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <SlashIcon type={item.icon} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: -1 }}>{item.description}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

function SlashIcon({ type }: { type: string }) {
  const s: React.CSSProperties = { width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-secondary)', flexShrink: 0 }

  if (type === 'H1' || type === 'H2' || type === 'H3') {
    return <div style={s}><span style={{ fontSize: 11, fontWeight: 700 }}>{type}</span></div>
  }
  if (type === 'list') {
    return <div style={s}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg></div>
  }
  if (type === 'list-ordered') {
    return <div style={s}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none">3</text></svg></div>
  }
  if (type === 'check') {
    return <div style={s}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="6" height="6" rx="1"/><line x1="13" y1="8" x2="21" y2="8"/><polyline points="3 14 5 16 9 12"/><line x1="13" y1="16" x2="21" y2="16"/></svg></div>
  }
  if (type === 'quote') {
    return <div style={s}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 8c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h2v-2H10v-2h2V8h-2zm6 0c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h2v-2h-2v-2h2V8h-2z"/></svg></div>
  }
  if (type === 'code') {
    return <div style={s}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></div>
  }
  if (type === 'table') {
    return <div style={s}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg></div>
  }
  if (type === 'hr') {
    return <div style={s}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="12" x2="21" y2="12"/></svg></div>
  }
  if (type === 'highlight') {
    return <div style={s}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div>
  }
  if (type === 'date') {
    return <div style={s}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
  }
  if (type === 'math') {
    return <div style={s}><span style={{ fontSize: 12, fontStyle: 'italic' }}>fx</span></div>
  }
  if (type === 'plugin') {
    return <div style={s}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 16l-1.7-5L6 9.3l4.3-1.7L12 3z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z"/><path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14z"/></svg></div>
  }
  return <div style={s}><span style={{ fontSize: 11 }}>?</span></div>
}
