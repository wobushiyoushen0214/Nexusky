import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { WikiLink } from './extensions/wiki-link'
import { AICompletion } from './extensions/ai-completion'
import { useEditorStore } from '../../stores/editor-store'
import { EditorToolbar } from './EditorToolbar'
import { BacklinksPanel } from './BacklinksPanel'

export function Editor() {
  const { content, currentFilePath, setContent, isDirty, tabs, activeTabIndex, closeTab, switchTab } = useEditorStore()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: { HTMLAttributes: { class: 'code-block' } }
      }),
      WikiLink,
      AICompletion,
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

  useEffect(() => {
    if (editor && content !== undefined) {
      const currentMarkdown = editor.storage.markdown.getMarkdown()
      if (currentMarkdown !== content) {
        editor.commands.setContent(content)
      }
    }
  }, [currentFilePath])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        useEditorStore.getState().saveFile()
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tab bar */}
      <div style={{ height: 36, padding: '0 8px', display: 'flex', alignItems: 'end', gap: 0, borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, overflowX: 'auto' }}>
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

      {/* Toolbar */}
      {editor && <EditorToolbar editor={editor} />}

      {/* Editor area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <EditorContent editor={editor} />
      </div>

      {/* Backlinks */}
      <BacklinksPanel />
    </div>
  )
}
