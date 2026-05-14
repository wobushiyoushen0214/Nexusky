import { useEffect, useRef, useMemo, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import Mathematics from '@tiptap/extension-mathematics'
import 'katex/dist/katex.min.css'
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
import { SlashCommand } from './extensions/slash-command'
import { SlashCommandMenu } from './SlashCommandMenu'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { toast } from '../../stores/toast-store'
import { EditorToolbar } from './EditorToolbar'
import { BacklinksPanel } from './BacklinksPanel'
import { AIWritingMenu } from './AIWritingMenu'
import { ContextMenu } from '../ContextMenu'
import { useSyncStore } from '../../stores/sync-store'
import { FindReplace } from './FindReplace'
import { MermaidRenderer } from './MermaidRenderer'

class LRUCache<K, V> {
  private map = new Map<K, V>()
  constructor(private maxSize: number) {}
  get(key: K): V | undefined {
    const val = this.map.get(key)
    if (val !== undefined) {
      this.map.delete(key)
      this.map.set(key, val)
    }
    return val
  }
  set(key: K, value: V): void {
    this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.maxSize) {
      const first = this.map.keys().next().value!
      this.map.delete(first)
    }
  }
}

export function Editor() {
  const content = useEditorStore((s) => s.content)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const setContent = useEditorStore((s) => s.setContent)
  const isDirty = useEditorStore((s) => s.isDirty)
  const tabs = useEditorStore((s) => s.tabs)
  const activeTabIndex = useEditorStore((s) => s.activeTabIndex)
  const closeTab = useEditorStore((s) => s.closeTab)
  const switchTab = useEditorStore((s) => s.switchTab)
  const reorderTab = useEditorStore((s) => s.reorderTab)
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useEditorStore((s) => s.closeTabsToRight)
  const splitPath = useEditorStore((s) => s.splitPath)
  const splitContent = useEditorStore((s) => s.splitContent)
  const closeSplit = useEditorStore((s) => s.closeSplit)
  const focusMode = useUIStore((s) => s.focusMode)
  const previewMode = useUIStore((s) => s.previewMode)
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  const dragTabRef = useRef<number | null>(null)
  const [findReplaceOpen, setFindReplaceOpen] = useState(false)
  const [linkPreview, setLinkPreview] = useState<{ x: number; y: number; content: string } | null>(null)
  const linkPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const markdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorStateCache = useRef(new LRUCache<string, any>(20))
  const linkPreviewCache = useRef<Map<string, string>>(new Map())

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false
      }),
      CodeBlockLowlight.configure({
        lowlight: createLowlight(common),
        HTMLAttributes: { class: 'code-block' }
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
      SlashCommand,
      Mathematics,
      ImagePaste,
      Placeholder.configure({
        placeholder: '开始写作...'
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
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
      if (markdownTimer.current) clearTimeout(markdownTimer.current)
      const { isDirty } = useEditorStore.getState()
      if (!isDirty) useEditorStore.getState().setDirty(true)
      const text = editor.state.doc.textContent
      const chars = text.length
      const words = text.trim().split(/\s+/).filter(Boolean).length
      setLiveStats({ chars, words, readTime: Math.max(1, Math.ceil(words / 200)) })
      markdownTimer.current = setTimeout(() => {
        const markdown = editor.storage.markdown.getMarkdown()
        setContent(markdown)
      }, 1000)
    }
  })

  const editorAreaRef = useRef<HTMLDivElement>(null)

  // Scroll to cursor after selection changes
  useEffect(() => {
    if (!editor) return
    let scrollTimer: ReturnType<typeof setTimeout> | null = null
    const scrollToCursor = () => {
      if (scrollTimer) clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        const { node } = editor.view.domAtPos(editor.state.selection.from)
        const el = node instanceof HTMLElement ? node : node.parentElement
        if (el && editorAreaRef.current) {
          const container = editorAreaRef.current
          const elRect = el.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          if (elRect.bottom > containerRect.bottom || elRect.top < containerRect.top) {
            el.scrollIntoView({ behavior: 'auto', block: 'nearest' })
          }
        }
      }, 80)
    }
    editor.on('selectionUpdate', scrollToCursor)
    return () => {
      editor.off('selectionUpdate', scrollToCursor)
      if (scrollTimer) clearTimeout(scrollTimer)
    }
  }, [editor])

  useEffect(() => {
    if (editor) editor.setEditable(!previewMode)
  }, [editor, previewMode])

  const prevFileRef = useRef<string | null>(null)

  useEffect(() => {
    if (!editor) return

    if (prevFileRef.current && prevFileRef.current !== currentFilePath) {
      editorStateCache.current.set(prevFileRef.current, editor.state.toJSON())
    }
    prevFileRef.current = currentFilePath

    const storeContent = useEditorStore.getState().content
    const effectiveContent = storeContent !== undefined ? storeContent : content
    if (effectiveContent !== undefined) {
      const cached = currentFilePath ? editorStateCache.current.get(currentFilePath) : null
      if (cached) {
        try {
          const EditorState = (editor.state as any).constructor
          const state = EditorState.fromJSON(
            { schema: editor.state.schema, plugins: editor.state.plugins },
            cached
          )
          editor.view.updateState(state)
          return
        } catch {}
      }
      const currentMarkdown = editor.storage.markdown.getMarkdown()
      if (currentMarkdown !== effectiveContent) {
        editor.commands.setContent(effectiveContent)
      }
    }
  }, [currentFilePath])

  useEffect(() => {
    if (!editor) return
    const handleReload = (e: Event) => {
      const newContent = (e as CustomEvent).detail?.content
      if (newContent !== undefined) {
        editor.commands.setContent(newContent)
      }
    }
    const handleApply = (e: Event) => {
      const newContent = (e as CustomEvent).detail?.content
      if (newContent !== undefined) {
        editor.chain().selectAll().insertContent(newContent).run()
      }
    }
    window.addEventListener('editor-reload-content', handleReload)
    window.addEventListener('editor-apply-content', handleApply)
    return () => {
      window.removeEventListener('editor-reload-content', handleReload)
      window.removeEventListener('editor-apply-content', handleApply)
    }
  }, [editor])

  // External file change detection
  useEffect(() => {
    if (!editor) return
    const cleanup = window.api.onFileChanged(async (changedPath: string) => {
      linkPreviewCache.current.clear()
      const normalizedChanged = changedPath.replace(/\\/g, '/')
      const normalizedCurrent = currentFilePath?.replace(/\\/g, '/')
      if (!normalizedCurrent || normalizedChanged !== normalizedCurrent) return
      const { isDirty } = useEditorStore.getState()
      if (isDirty) {
        toast('文件已被外部修改，当前有未保存更改', 'info')
        return
      }
      try {
        const newContent = await window.api.invoke('file:read', { path: changedPath })
        const currentMarkdown = editor.storage.markdown.getMarkdown()
        if (newContent !== currentMarkdown) {
          editor.commands.setContent(newContent)
          useEditorStore.setState((state) => {
            const tabs = [...state.tabs]
            if (state.activeTabIndex >= 0 && state.activeTabIndex < tabs.length) {
              tabs[state.activeTabIndex] = { ...tabs[state.activeTabIndex], content: newContent, isDirty: false }
            }
            return { tabs, content: newContent, isDirty: false }
          })
        }
      } catch {}
    })
    return () => cleanup()
  }, [editor, currentFilePath])

  // Unified auto-save: debounced 3s idle + window blur, with dedup guard
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSaving = useRef(false)
  const scheduleSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = null
    if (isSaving.current) return
    const { isDirty, currentFilePath: fp } = useEditorStore.getState()
    if (!isDirty || !fp) return
    isSaving.current = true
    useEditorStore.getState().saveFile().finally(() => { isSaving.current = false })
  }

  useEffect(() => {
    if (!isDirty || !currentFilePath) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(scheduleSave, 3000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [isDirty, content])

  useEffect(() => {
    const handleBlur = () => scheduleSave()
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [])

  // Word count
  const [liveStats, setLiveStats] = useState({ chars: 0, words: 0, readTime: 0 })

  const stats = useMemo(() => {
    if (liveStats.chars > 0) return liveStats
    if (!content) return { chars: 0, words: 0, readTime: 0 }
    const chars = content.length
    const words = content.trim().split(/\s+/).filter(Boolean).length
    const readTime = Math.max(1, Math.ceil(words / 200))
    return { chars, words, readTime }
  }, [content, liveStats])

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
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault()
        setFindReplaceOpen((v) => !v)
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
        return
      }
      const byFileName = results.find((r) => r.filePath.replace(/^.*[\\/]/, '').replace(/\.md$/, '') === title)
      if (byFileName) {
        useEditorStore.getState().openFile(`${vaultPath}/${byFileName.filePath}`)
      } else {
        const path = `${vaultPath}/${title}.md`
        await window.api.invoke('file:create', { path, content: `# ${title}\n\n`, vaultPath })
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

  useEffect(() => {
    const handleGotoHeading = (e: Event) => {
      const index = (e as CustomEvent).detail?.index
      if (!editor || index == null) return
      const doc = editor.state.doc
      let headingCount = 0
      let targetPos = -1

      doc.descendants((node, pos) => {
        if (targetPos >= 0) return false
        if (node.type.name === 'heading') {
          if (headingCount === index) {
            targetPos = pos
            return false
          }
          headingCount++
        }
      })

      if (targetPos < 0) return

      editor.commands.focus()
      editor.commands.setTextSelection(targetPos + 1)
      setTimeout(() => {
        try {
          const domAtPos = editor.view.domAtPos(targetPos + 1)
          const el = domAtPos.node instanceof HTMLElement
            ? domAtPos.node
            : domAtPos.node.parentElement
          if (!el || !editorAreaRef.current) return
          const container = editorAreaRef.current
          const elRect = el.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          const targetScroll = container.scrollTop + (elRect.top - containerRect.top) - containerRect.height / 2 + elRect.height / 2
          const startScroll = container.scrollTop
          const distance = targetScroll - startScroll
          if (Math.abs(distance) < 1) return
          const duration = Math.min(500, Math.max(200, Math.abs(distance) * 0.5))
          const startTime = performance.now()
          const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
          const animate = (now: number) => {
            const elapsed = now - startTime
            const progress = Math.min(elapsed / duration, 1)
            container.scrollTop = startScroll + distance * easeInOutCubic(progress)
            if (progress < 1) requestAnimationFrame(animate)
          }
          requestAnimationFrame(animate)
        } catch {}
      }, 50)
    }
    window.addEventListener('editor-goto-heading', handleGotoHeading)
    return () => window.removeEventListener('editor-goto-heading', handleGotoHeading)
  }, [editor])

  useEffect(() => {
    const handleGotoLine = (e: Event) => {
      const line = (e as CustomEvent).detail?.line
      if (!editor || line == null) return
      const doc = editor.state.doc
      let targetPos = -1
      let headingCount = 0
      let sourceLineCount = 0

      doc.forEach((node, offset) => {
        if (targetPos >= 0) return
        if (node.type.name === 'heading') {
          if (sourceLineCount === line) {
            targetPos = offset + 1
          }
        }
        const lines = node.textContent.split('\n').length
        sourceLineCount += lines
      })

      if (targetPos < 0) {
        let pos = 0
        doc.forEach((node, offset) => {
          if (targetPos >= 0) return
          pos += 1
          if (pos > line) {
            targetPos = offset + 1
          }
        })
      }

      if (targetPos < 0) targetPos = 1

      editor.commands.focus()
      editor.commands.setTextSelection(Math.min(targetPos, doc.content.size))
      setTimeout(() => {
        const resolvedPos = Math.min(targetPos, doc.content.size)
        try {
          const domAtPos = editor.view.domAtPos(resolvedPos)
          const el = domAtPos.node instanceof HTMLElement
            ? domAtPos.node
            : domAtPos.node.parentElement
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } catch {}
      }, 50)
    }
    window.addEventListener('editor-goto-line', handleGotoLine)
    return () => window.removeEventListener('editor-goto-line', handleGotoLine)
  }, [editor])

  // Code block folding
  useEffect(() => {
    if (!editor || !editorAreaRef.current) return
    const scan = () => {
      const blocks = editorAreaRef.current?.querySelectorAll('.code-block') || []
      blocks.forEach((block) => {
        if (block.querySelector('.code-fold-btn')) return
        const code = block.querySelector('code')
        if (!code) return
        const lines = (code.textContent || '').split('\n').length
        if (lines <= 5) return
        const btn = document.createElement('button')
        btn.className = 'code-fold-btn'
        btn.textContent = '折叠'
        btn.onclick = (e) => {
          e.stopPropagation()
          block.classList.toggle('collapsed')
          btn.textContent = block.classList.contains('collapsed') ? '展开' : '折叠'
        }
        block.prepend(btn)
        block.classList.add('collapsed')
        btn.textContent = '展开'
      })
    }
    let scanTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedScan = () => {
      if (scanTimer) clearTimeout(scanTimer)
      scanTimer = setTimeout(scan, 300)
    }
    scan()
    editor.on('update', debouncedScan)
    return () => {
      editor.off('update', debouncedScan)
      if (scanTimer) clearTimeout(scanTimer)
    }
  }, [editor, currentFilePath])

  // Wikilink hover preview
  useEffect(() => {
    const container = editorAreaRef.current
    if (!container) return
    let cancelled = false
    const handleMouseOver = async (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('.wiki-link-inline') as HTMLElement | null
      if (!el) { if (linkPreviewTimer.current) clearTimeout(linkPreviewTimer.current); setLinkPreview(null); return }
      const title = el.getAttribute('data-title') || el.textContent?.replace(/^\[\[|\]\]$/g, '') || ''
      if (!title) return
      linkPreviewTimer.current = setTimeout(async () => {
        if (cancelled) return
        const cached = linkPreviewCache.current.get(title)
        if (cached) {
          const rect = el.getBoundingClientRect()
          setLinkPreview({ x: rect.left, y: rect.bottom + 4, content: cached })
          return
        }
        const vault = useVaultStore.getState().vaultPath
        if (!vault) return
        try {
          const results = await window.api.invoke('db:search-notes', { vaultPath: vault, query: title })
          if (cancelled) return
          const exact = results.find((r) => r.title === title)
          if (exact) {
            const text = await window.api.invoke('file:read', { path: `${vault}/${exact.filePath}` })
            if (cancelled) return
            const preview = text.slice(0, 500)
            linkPreviewCache.current.set(title, preview)
            const rect = el.getBoundingClientRect()
            setLinkPreview({ x: rect.left, y: rect.bottom + 4, content: preview })
          }
        } catch {}
      }, 400)
    }
    const handleMouseOut = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('.wiki-link-inline')
      if (el) { if (linkPreviewTimer.current) clearTimeout(linkPreviewTimer.current); setLinkPreview(null) }
    }
    container.addEventListener('mouseover', handleMouseOver)
    container.addEventListener('mouseout', handleMouseOut)
    return () => { cancelled = true; if (linkPreviewTimer.current) clearTimeout(linkPreviewTimer.current); setLinkPreview(null); container.removeEventListener('mouseover', handleMouseOver); container.removeEventListener('mouseout', handleMouseOut) }
  }, [currentFilePath])

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
              draggable
              onDragStart={() => { dragTabRef.current = i }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDrop={() => { if (dragTabRef.current !== null && dragTabRef.current !== i) { reorderTab(dragTabRef.current, i) }; dragTabRef.current = null }}
              onDragEnd={() => { dragTabRef.current = null }}
              onClick={() => switchTab(i)}
              onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(i) } }}
              onContextMenu={(e) => { e.preventDefault(); setTabContextMenu({ x: e.clientX, y: e.clientY, index: i }) }}
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
              {tab.isDirty && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
              <span>{tabName}</span>
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
      {tabContextMenu && (
        <ContextMenu
          x={tabContextMenu.x}
          y={tabContextMenu.y}
          items={[
            { label: tabs[tabContextMenu.index]?.pinned ? '取消固定' : '固定标签', onClick: () => { const t = tabs[tabContextMenu.index]; if (t?.pinned) useEditorStore.getState().unpinTab(tabContextMenu.index); else useEditorStore.getState().pinTab(tabContextMenu.index) } },
            { label: '关闭', onClick: () => closeTab(tabContextMenu.index) },
            { label: '关闭其他', onClick: () => closeOtherTabs(tabContextMenu.index) },
            { label: '关闭右侧', onClick: () => closeTabsToRight(tabContextMenu.index) },
            { label: '关闭已保存', onClick: () => useEditorStore.getState().closeSavedTabs() },
            { label: '复制路径', onClick: () => { navigator.clipboard.writeText(tabs[tabContextMenu.index]?.path || '') } },
            { label: '在右侧打开', onClick: () => { const p = tabs[tabContextMenu.index]?.path; if (p) useEditorStore.getState().openSplit(p) } },
          ]}
          onClose={() => setTabContextMenu(null)}
        />
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
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <FindReplace editor={editor} open={findReplaceOpen} onClose={() => setFindReplaceOpen(false)} />
          {linkPreview && (
            <div style={{
              position: 'fixed',
              left: Math.min(linkPreview.x, window.innerWidth - 380),
              top: linkPreview.y + 200 > window.innerHeight ? linkPreview.y - 210 : linkPreview.y,
              zIndex: 50,
              maxWidth: 360, maxHeight: 200, padding: '10px 14px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)',
              overflowY: 'auto', whiteSpace: 'pre-wrap', pointerEvents: 'none',
            }}>
              {linkPreview.content}
            </div>
          )}
          <div ref={editorAreaRef} style={{ height: '100%', overflowY: 'auto', padding: focusMode ? '48px 64px' : '24px 32px' }}>
            <EditorContent editor={editor} />
            <TransclusionBlocks content={content} />
            <MermaidBlocks content={content} />
          </div>
        </div>
        {splitPath && splitContent !== null && (
          <div style={{ width: '50%', borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ height: 30, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{splitPath.split(/[\\/]/).pop()?.replace(/\.md$/, '')}</span>
              <button onClick={closeSplit} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="editor-content" style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', fontSize: 15, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
              {splitContent}
            </div>
          </div>
        )}
      </div>

      {/* AI Writing Menu */}
      <AIWritingMenu editor={editor} />

      {/* Slash Command Menu */}
      <SlashCommandMenu editor={editor} />

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
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {isDirty ? <span style={{ color: 'var(--accent)' }}>未保存</span> : <span>已保存</span>}
          <span>Markdown</span>
          <SyncIndicator />
        </div>
      </div>
      )}
    </div>
  )
}

function SyncIndicator() {
  const { status, lastSyncTime, lastError, setSyncing, setSuccess, setError } = useSyncStore()
  const vaultPath = useVaultStore((s) => s.vaultPath)

  const handleClick = async () => {
    if (!vaultPath || status === 'syncing') return
    setSyncing()
    try {
      const result = await window.api.invoke('cloud:sync', { vaultPath })
      if (result.errors.length === 0) setSuccess()
      else setError(result.errors[0])
    } catch (e: any) {
      setError(e.message || '同步失败')
    }
  }

  const colors: Record<string, string> = {
    idle: 'var(--text-tertiary)',
    syncing: 'var(--accent)',
    success: '#4ade80',
    error: '#f87171',
  }

  const titles: Record<string, string> = {
    idle: '点击同步',
    syncing: '同步中...',
    success: lastSyncTime ? `上次同步: ${new Date(lastSyncTime).toLocaleTimeString()}` : '同步成功',
    error: lastError || '同步出错',
  }

  return (
    <button
      onClick={handleClick}
      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: colors[status], padding: 0, fontSize: 11 }}
      title={titles[status]}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: status === 'syncing' ? 'spin 1s linear infinite' : 'none' }}>
        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
      {status === 'syncing' && <span>同步中</span>}
    </button>
  )
}

function MermaidBlocks({ content }: { content: string }) {
  const [blocks, setBlocks] = useState<string[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const regex = /```mermaid\n([\s\S]*?)```/g
      const matches: string[] = []
      let match
      while ((match = regex.exec(content)) !== null) {
        matches.push(match[1])
      }
      setBlocks(matches)
    }, 800)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [content])

  if (blocks.length === 0) return null

  return (
    <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {blocks.map((code, i) => (
        <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '4px 12px', fontSize: 10, color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>Mermaid</div>
          <MermaidRenderer code={code} />
        </div>
      ))}
    </div>
  )
}

function TransclusionBlocks({ content }: { content: string }) {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [embeds, setEmbeds] = useState<{ title: string; content: string }[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const regex = /!\[\[([^\]]+)\]\]/g
      const titles: string[] = []
      let match
      while ((match = regex.exec(content)) !== null) {
        titles.push(match[1])
      }
      if (titles.length === 0 || !vaultPath) { setEmbeds([]); return }

      Promise.all(titles.map(async (title) => {
        try {
          const results = await window.api.invoke('db:search-notes', { vaultPath, query: title })
          const exact = results.find((r) => r.title === title)
          if (exact) {
            const text = await window.api.invoke('file:read', { path: `${vaultPath}/${exact.filePath}` })
            return { title, content: text }
          }
        } catch {}
        return null
      })).then((results) => setEmbeds(results.filter(Boolean) as any))
    }, 800)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [content, vaultPath])

  if (embeds.length === 0) return null

  return (
    <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {embeds.map((embed, i) => (
        <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--accent-text)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--accent-muted)', fontWeight: 500 }}>
            嵌入: {embed.title}
          </div>
          <div style={{ padding: '12px 16px', fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
            {embed.content}
          </div>
        </div>
      ))}
    </div>
  )
}
