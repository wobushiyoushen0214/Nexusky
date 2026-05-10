import { useEffect, useRef, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import { Markdown } from 'tiptap-markdown'
import { WikiLink } from './extensions/wiki-link'
import { AICompletion } from './extensions/ai-completion'
import { ImagePaste } from './extensions/image-paste'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { EditorToolbar } from './EditorToolbar'
import { BacklinksPanel } from './BacklinksPanel'
import { AIWritingMenu } from './AIWritingMenu'

export function Editor() {
  const { content, currentFilePath, setContent, isDirty, tabs, activeTabIndex, closeTab, switchTab } = useEditorStore()
  const focusMode = useUIStore((s) => s.focusMode)
  const previewMode = useUIStore((s) => s.previewMode)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: { HTMLAttributes: { class: 'code-block' } }
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      WikiLink,
      AICompletion,
      ImagePaste,
      Placeholder.configure({
        placeholder: '开始写作...'
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true
      })
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'editor-content focus:outline-none min-h-full'
      }
    },
    onUpdate: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown()
      setContent(markdown)
    }
  })

  const editorAreaRef = useRef<HTMLDivElement>(null)

  // Scroll to cursor after operations
  useEffect(() => {
    if (!editor) return
    const scrollToCursor = () => {
      requestAnimationFrame(() => {
        const { node } = editor.view.domAtPos(editor.state.selection.from)
        const el = node instanceof HTMLElement ? node : node.parentElement
        if (el && editorAreaRef.current) {
          const container = editorAreaRef.current
          const elRect = el.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          if (elRect.bottom > containerRect.bottom || elRect.top < containerRect.top) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }
      })
    }
    editor.on('transaction', scrollToCursor)
    return () => { editor.off('transaction', scrollToCursor) }
  }, [editor])

  useEffect(() => {
    if (editor) editor.setEditable(!previewMode)
  }, [editor, previewMode])

  useEffect(() => {
    if (editor && content !== undefined) {
      const currentMarkdown = editor.storage.markdown.getMarkdown()
      if (currentMarkdown !== content) {
        editor.commands.setContent(content)
      }
    }
  }, [currentFilePath])

  // Auto-save after 3 seconds of inactivity
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!isDirty || !currentFilePath) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      useEditorStore.getState().saveFile()
    }, 3000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [isDirty, content])

  // Word count
  const stats = useMemo(() => {
    if (!content) return { chars: 0, words: 0, readTime: 0 }
    const chars = content.length
    const words = content.trim().split(/\s+/).filter(Boolean).length
    const readTime = Math.max(1, Math.ceil(words / 200))
    return { chars, words, readTime }
  }, [content])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        useEditorStore.getState().saveFile()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        const { activeTabIndex } = useEditorStore.getState()
        if (activeTabIndex >= 0) useEditorStore.getState().closeTab(activeTabIndex)
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        const { tabs, activeTabIndex, switchTab: sw } = useEditorStore.getState()
        if (tabs.length > 1) sw((activeTabIndex + 1) % tabs.length)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'K') {
        e.preventDefault()
        if (editor) editor.commands.deleteNode('paragraph')
      }
    }
    const handleWikilink = async (e: Event) => {
      const title = (e as CustomEvent).detail?.title
      if (!title) return
      const vaultPath = (await window.api.invoke('vault:get', undefined))
      if (!vaultPath) return
      const results = await window.api.invoke('db:search-notes', { vaultPath, query: title })
      const exact = results.find((r) => r.title === title)
      if (exact) {
        useEditorStore.getState().openFile(`${vaultPath}/${exact.filePath}`)
      } else {
        const path = `${vaultPath}/${title}.md`
        await window.api.invoke('file:create', { path, content: `# ${title}\n\n` })
        useEditorStore.getState().openFile(path)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('navigate-wikilink', handleWikilink)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('navigate-wikilink', handleWikilink)
    }
  }, [])

  if (!currentFilePath) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 6 }}>选择文件开始编辑</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', opacity: 0.5 }}>Ctrl+O 快速切换</p>
        </div>
      </div>
    )
  }

  const fileName = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      {!focusMode && (
      <div
        className="hide-scrollbar"
        style={{ height: 36, padding: '0 8px', display: 'flex', alignItems: 'end', gap: 0, flexShrink: 0, overflowX: 'auto', overflowY: 'hidden' }}
        onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY }}
      >
        {tabs.map((tab, i) => {
          const tabName = tab.path.split(/[\\/]/).pop()?.replace(/\.md$/, '')
          const isActive = i === activeTabIndex
          return (
            <div
              key={tab.path}
              onClick={() => switchTab(i)}
              style={{
                height: 30,
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                cursor: 'pointer',
                borderRadius: '6px 6px 0 0',
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                whiteSpace: 'nowrap',
                position: 'relative',
              }}
            >
              <span>{tabName}</span>
              {tab.isDirty && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />}
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(i) }}
                style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', opacity: isActive ? 1 : 0 }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
      )}

      {/* Breadcrumb */}
      {!focusMode && currentFilePath && (
        <div style={{ height: 24, padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0, gap: 4, overflow: 'hidden' }}>
          {(() => {
            const vaultPath = window.api.platform ? useVaultStore.getState().vaultPath : null
            const rel = vaultPath ? currentFilePath.replace(vaultPath, '').replace(/^[\\/]/, '') : currentFilePath
            const parts = rel.replace(/\\/g, '/').split('/')
            return parts.map((part, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <span style={{ opacity: 0.5 }}>/</span>}
                <span style={{ color: i === parts.length - 1 ? 'var(--text-secondary)' : undefined }}>{part.replace(/\.md$/, '')}</span>
              </span>
            ))
          })()}
        </div>
      )}

      {/* Toolbar */}
      {!focusMode && editor && <EditorToolbar editor={editor} />}

      {/* Editor area */}
      <div ref={editorAreaRef} style={{ flex: 1, overflowY: 'auto', padding: focusMode ? '48px 64px' : '24px 32px' }}>
        <EditorContent editor={editor} />
      </div>

      {/* AI Writing Menu */}
      <AIWritingMenu editor={editor} />

      {/* Backlinks */}
      {!focusMode && <BacklinksPanel />}

      {/* Status bar */}
      {!focusMode && (
      <div style={{ height: 24, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <span>{stats.words} 词</span>
          <span>{stats.chars} 字符</span>
          <span>~{stats.readTime} 分钟阅读</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {isDirty ? <span style={{ color: 'var(--accent)' }}>未保存</span> : <span>已保存</span>}
          <span>Markdown</span>
        </div>
      </div>
      )}
    </div>
  )
}
