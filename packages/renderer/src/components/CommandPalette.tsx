import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useUIStore } from '../stores/ui-store'
import { useEditorStore } from '../stores/editor-store'
import { useVaultStore } from '../stores/vault-store'
import { safeSet } from '../utils/storage'

interface Command {
  id: string
  label: string
  category: '文件' | '检索' | 'AI' | '知识图谱' | '同步' | '导出' | '界面'
  description?: string
  shortcut?: string
  keywords?: string[]
  action: () => void
}

interface AICommandDraft {
  prompt: string
  mode?: 'chat' | 'edit'
  agentMode?: boolean
  attachSelection?: boolean
  unboundEdit?: boolean
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { setRightPanel, setSearchOpen, setSettingsOpen, toggleSidebar, toggleTheme, toggleFocusMode, setMainView } = useUIStore()
  const { saveFile, currentFilePath, content } = useEditorStore()
  const { vaultPath } = useVaultStore()

  const queueAiDraft = useCallback((draft: AICommandDraft) => {
    safeSet('nexusky-pending-ai-draft', JSON.stringify(draft))
    setRightPanel('chat')
    window.dispatchEvent(new CustomEvent('ai-command-draft', { detail: draft }))
  }, [setRightPanel])

  const getCurrentNoteTitle = useCallback(() => {
    const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
    const fallback = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || ''
    return (heading || fallback).replace(/[\[\]]/g, '').trim()
  }, [content, currentFilePath])

  const commands: Command[] = useMemo(() => [
    { id: 'save', category: '文件', label: '保存当前笔记', shortcut: 'Ctrl+S', keywords: ['save'], action: () => saveFile() },
    { id: 'new-note', category: '文件', label: '新建笔记', shortcut: 'Ctrl+N', keywords: ['new', 'note'], action: () => window.dispatchEvent(new CustomEvent('create-new-note')) },
    { id: 'copy-wikilink', category: '文件', label: '复制当前笔记 Wikilink', description: '复制为 [[笔记标题]]，可直接粘贴到其他笔记', keywords: ['wikilink', 'copy', 'obsidian'], action: async () => {
      const title = getCurrentNoteTitle()
      const { toast } = await import('../stores/toast-store')
      if (!title) {
        toast('请先打开一篇笔记', 'info')
        return
      }
      await navigator.clipboard.writeText(`[[${title}]]`)
      toast('已复制 Wikilink', 'success')
    }},
    { id: 'daily', category: '文件', label: '打开今日笔记', keywords: ['daily', 'journal'], action: async () => {
      if (!vaultPath) return
      const path = await window.api.invoke('template:daily-note', { vaultPath })
      if (path) useEditorStore.getState().openFile(path)
    }},
    { id: 'trash', category: '文件', label: '打开回收站', keywords: ['trash'], action: () => window.dispatchEvent(new CustomEvent('open-trash')) },
    { id: 'import-obsidian', category: '文件', label: '导入 Obsidian Vault', description: '导入 Markdown、附件和内部链接结构', keywords: ['obsidian', 'vault', 'import'], action: async () => {
      if (!vaultPath) return
      const sourcePath = await window.api.invoke('vault:select', undefined)
      if (sourcePath) {
        const result = await window.api.invoke('file:import-obsidian', { sourcePath, vaultPath })
        const { toast } = await import('../stores/toast-store')
        toast(`导入完成: ${result.imported} 个文件, ${result.converted} 个已转换`, 'success')
        useVaultStore.getState().refreshFiles()
      }
    }},
    { id: 'search', category: '检索', label: '全文搜索', shortcut: 'Ctrl+Shift+F', keywords: ['find', 'search'], action: () => setSearchOpen(true) },
    { id: 'chat', category: 'AI', label: '打开 AI 工作台', shortcut: 'Ctrl+L', description: '对话、Agent、编辑和批量生成入口', keywords: ['chat', 'agent'], action: () => setRightPanel('chat') },
    { id: 'ai-rag', category: 'AI', label: '基于知识库提问', description: '打开 Agent 模式，自动搜索和引用笔记', keywords: ['rag', 'ask', 'agent'], action: () => queueAiDraft({ mode: 'chat', agentMode: true, prompt: '请基于当前知识库回答：' }) },
    { id: 'ai-edit-current', category: 'AI', label: 'AI 修改当前笔记', description: '生成修改方案，确认后再写入文件', keywords: ['edit', 'rewrite'], action: () => queueAiDraft({ mode: 'edit', prompt: '请优化当前笔记的结构、标题层级和表达清晰度，保留原有事实。' }) },
    { id: 'ai-rewrite-selection', category: 'AI', label: 'AI 改写选中文本', description: '把当前选区作为编辑目标上下文', keywords: ['selection', 'rewrite'], action: () => queueAiDraft({ mode: 'edit', attachSelection: true, prompt: '请改写选中文本，使表达更清晰、更适合知识库长期保存。' }) },
    { id: 'ai-new-note', category: 'AI', label: 'AI 生成新笔记', description: '不绑定当前文件，直接创建新的 Markdown 笔记', keywords: ['generate', 'create'], action: () => queueAiDraft({ mode: 'edit', unboundEdit: true, prompt: '请创建一篇结构完整的新笔记，主题是：' }) },
    { id: 'ai-batch-notes', category: 'AI', label: 'AI 批量生成关联笔记', description: '适合搭建主题知识库骨架', keywords: ['batch', 'map', 'obsidian'], action: () => queueAiDraft({ mode: 'edit', unboundEdit: true, prompt: '请围绕一个主题生成 5 篇相互关联的 Markdown 笔记，每篇都有清晰标题、摘要、要点和 [[双向链接]]。主题是：' }) },
    { id: 'summarize', category: 'AI', label: 'AI 摘要写入当前笔记', description: '把摘要插入到当前笔记开头', keywords: ['summary'], action: async () => {
      if (!content || !currentFilePath) return
      const { toast } = await import('../stores/toast-store')
      toast('正在生成摘要...', 'info')
      const summary = await window.api.invoke('ai:summarize', { content })
      if (summary) {
        const newContent = `> ${summary}\n\n${content}`
        useEditorStore.getState().setContent(newContent)
        toast('摘要已插入当前笔记', 'success')
      }
    }},
    { id: 'graph-full', category: '知识图谱', label: '打开全屏知识图谱', shortcut: 'Ctrl+G', keywords: ['graph'], action: () => {
      setMainView('graph')
    }},
    { id: 'graph-current', category: '知识图谱', label: '为当前笔记生成 AI 图谱', description: '基于当前笔记推断概念关系', keywords: ['graph', 'mermaid'], action: () => {
      if (currentFilePath) window.dispatchEvent(new CustomEvent('generate-graph', { detail: { path: currentFilePath, isDirectory: false } }))
    }},
    { id: 'infer-links', category: '知识图谱', label: '推断全库语义链接', description: '补齐隐含关联并刷新知识图谱', keywords: ['links', 'semantic'], action: async () => {
      if (!vaultPath) return
      const { toast } = await import('../stores/toast-store')
      toast('正在推断全库语义链接...', 'info')
      const result = await window.api.invoke('ai:infer-global-links', { vaultPath })
      if (result.success) {
        toast(`已新增 ${result.added || 0} 条语义链接`, 'success')
        window.dispatchEvent(new CustomEvent('graph-data-updated'))
        setMainView('graph')
      } else {
        toast(result.error || '语义链接推断失败', 'error')
      }
    }},
    { id: 'memory-index', category: '知识图谱', label: '生成 AI 记忆索引', description: '为长期知识关联生成笔记级记忆', keywords: ['memory', 'index'], action: async () => {
      if (!vaultPath) return
      const { toast } = await import('../stores/toast-store')
      toast('正在生成 AI 记忆索引...', 'info')
      const result = await window.api.invoke('ai:generate-memories', { vaultPath })
      if (result.success) toast(`完成: 新增 ${result.generated}，跳过 ${result.skipped}，失败 ${result.failed}`, 'success')
      else toast(result.error || 'AI 记忆索引生成失败', 'error')
    }},
    { id: 'sync', category: '同步', label: '云端同步', shortcut: 'Ctrl+Shift+S', keywords: ['sync'], action: async () => {
      if (!vaultPath) return
      await window.api.invoke('cloud:sync', { vaultPath })
    }},
    { id: 'pull', category: '同步', label: '从云端拉取', keywords: ['pull'], action: async () => {
      if (!vaultPath) return
      await window.api.invoke('cloud:pull-all', { vaultPath })
    }},
    { id: 'export-pdf', category: '导出', label: '导出 PDF', keywords: ['pdf'], action: async () => {
      if (!content || !currentFilePath) return
      const { toast } = await import('../stores/toast-store')
      toast('正在导出 PDF...', 'info')
      const title = currentFilePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || 'note'
      await window.api.invoke('export:pdf', { content, title })
      toast('PDF 导出完成', 'success')
    }},
    { id: 'export-html', category: '导出', label: '导出 HTML', keywords: ['html'], action: async () => {
      if (!content || !currentFilePath) return
      const { toast } = await import('../stores/toast-store')
      const title = currentFilePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || 'note'
      await window.api.invoke('export:html', { content, title })
      toast('HTML 导出完成', 'success')
    }},
    { id: 'share', category: '导出', label: '分享笔记（复制 HTML）', keywords: ['share'], action: async () => {
      if (!content || !currentFilePath) return
      const title = currentFilePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || 'note'
      await window.api.invoke('export:share', { content, title })
    }},
    { id: 'outline', category: '界面', label: '打开文档大纲', shortcut: 'Ctrl+E', keywords: ['outline'], action: () => setRightPanel('outline') },
    { id: 'properties', category: '界面', label: '打开笔记属性', description: '编辑 title、aliases、tags、cssclasses', keywords: ['properties', 'frontmatter', 'obsidian'], action: () => setRightPanel('properties') },
    { id: 'settings', category: '界面', label: '打开设置', shortcut: 'Ctrl+,', keywords: ['settings'], action: () => setSettingsOpen(true) },
    { id: 'sidebar', category: '界面', label: '切换侧边栏', shortcut: 'Ctrl+Shift+B', keywords: ['sidebar'], action: () => toggleSidebar() },
    { id: 'focus', category: '界面', label: '切换聚焦模式', shortcut: 'F11', keywords: ['focus'], action: () => toggleFocusMode() },
    { id: 'theme', category: '界面', label: '切换主题', keywords: ['theme'], action: () => toggleTheme() },
  ], [saveFile, currentFilePath, content, vaultPath, setRightPanel, setSearchOpen, setSettingsOpen, toggleSidebar, toggleTheme, toggleFocusMode, setMainView, queueAiDraft, getCurrentNoteTitle])

  const filtered = query.trim()
    ? commands.filter((c) => {
      const q = query.toLowerCase()
      return [c.label, c.category, c.description, ...(c.keywords || [])].some((part) => part?.toLowerCase().includes(q))
    })
    : commands

  const grouped = filtered.reduce<Record<string, Command[]>>((acc, command) => {
    if (!acc[command.category]) acc[command.category] = []
    acc[command.category].push(command)
    return acc
  }, {})

  const categoryOrder: Command['category'][] = ['AI', '知识图谱', '检索', '文件', '同步', '导出', '界面']

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const listRef = useRef<HTMLDivElement>(null)
  const commandRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filtered.length === 0) {
      if (e.key === 'Escape') onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => {
        const next = Math.min(i + 1, filtered.length - 1)
        commandRefs.current[filtered[next]?.id]?.scrollIntoView({ block: 'nearest' })
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => {
        const next = Math.max(i - 1, 0)
        commandRefs.current[filtered[next]?.id]?.scrollIntoView({ block: 'nearest' })
        return next
      })
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].action()
      onClose()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' } as React.CSSProperties}
      onClick={onClose}
    >
      <div
        style={{ width: 480, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 12, borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="输入命令..."
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text-primary)' }}
          />
        </div>
        <div ref={listRef} style={{ maxHeight: 420, overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '20px 12px', color: 'var(--text-tertiary)', fontSize: 13 }}>没有匹配的命令</div>
          )}
          {categoryOrder.filter((category) => grouped[category]?.length).map((category) => (
            <div key={category} style={{ padding: '4px 0' }}>
              <div style={{ padding: '5px 10px 4px', fontSize: 10, letterSpacing: 0, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                {category}
              </div>
              {grouped[category].map((cmd) => {
                const i = filtered.findIndex((item) => item.id === cmd.id)
                return (
                  <button
                    key={cmd.id}
                    ref={(el) => { commandRefs.current[cmd.id] = el }}
                    onClick={() => { cmd.action(); onClose() }}
                    style={{
                      width: '100%',
                      minHeight: 42,
                      padding: '7px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 13,
                      color: i === selectedIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
                      background: i === selectedIndex ? 'var(--accent-muted)' : 'transparent',
                      border: 'none',
                      borderRadius: 7,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', color: 'inherit', fontWeight: i === selectedIndex ? 600 : 500 }}>{cmd.label}</span>
                      {cmd.description && <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cmd.description}</span>}
                    </span>
                    {cmd.shortcut && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>{cmd.shortcut}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
