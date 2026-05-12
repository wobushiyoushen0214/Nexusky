import { useState, useEffect, useRef, useMemo } from 'react'
import { useUIStore } from '../stores/ui-store'
import { useEditorStore } from '../stores/editor-store'
import { useVaultStore } from '../stores/vault-store'

interface Command {
  id: string
  label: string
  shortcut?: string
  action: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toggleRightPanel, setSearchOpen, setSettingsOpen, toggleSidebar, toggleTheme, toggleFocusMode } = useUIStore()
  const { saveFile, currentFilePath, content } = useEditorStore()
  const { vaultPath } = useVaultStore()

  const commands: Command[] = useMemo(() => [
    { id: 'save', label: '保存文件', shortcut: 'Ctrl+S', action: () => saveFile() },
    { id: 'new-note', label: '新建笔记', shortcut: 'Ctrl+N', action: () => window.dispatchEvent(new CustomEvent('create-new-note')) },
    { id: 'search', label: '全文搜索', shortcut: 'Ctrl+Shift+F', action: () => setSearchOpen(true) },
    { id: 'graph', label: '知识图谱', shortcut: 'Ctrl+G', action: () => toggleRightPanel('graph') },
    { id: 'chat', label: 'AI 对话', shortcut: 'Ctrl+L', action: () => toggleRightPanel('chat') },
    { id: 'outline', label: '文档大纲', shortcut: 'Ctrl+E', action: () => toggleRightPanel('outline') },
    { id: 'settings', label: '设置', shortcut: 'Ctrl+,', action: () => setSettingsOpen(true) },
    { id: 'sidebar', label: '切换侧边栏', shortcut: 'Ctrl+Shift+B', action: () => toggleSidebar() },
    { id: 'focus', label: '聚焦模式', shortcut: 'F11', action: () => toggleFocusMode() },
    { id: 'theme', label: '切换主题', action: () => toggleTheme() },
    { id: 'export-pdf', label: '导出 PDF', action: async () => {
      if (!content || !currentFilePath) return
      const { toast } = await import('../stores/toast-store')
      toast('正在导出 PDF...', 'info')
      const title = currentFilePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || 'note'
      await window.api.invoke('export:pdf', { content, title })
      toast('PDF 导出完成', 'success')
    }},
    { id: 'export-html', label: '导出 HTML', action: async () => {
      if (!content || !currentFilePath) return
      const { toast } = await import('../stores/toast-store')
      const title = currentFilePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || 'note'
      await window.api.invoke('export:html', { content, title })
      toast('HTML 导出完成', 'success')
    }},
    { id: 'share', label: '分享笔记（复制 HTML）', action: async () => {
      if (!content || !currentFilePath) return
      const title = currentFilePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || 'note'
      await window.api.invoke('export:share', { content, title })
    }},
    { id: 'daily', label: '今日笔记', action: async () => {
      if (!vaultPath) return
      const path = await window.api.invoke('template:daily-note', { vaultPath })
      if (path) useEditorStore.getState().openFile(path)
    }},
    { id: 'sync', label: '云端同步', shortcut: 'Ctrl+Shift+S', action: async () => {
      if (!vaultPath) return
      await window.api.invoke('cloud:sync', { vaultPath })
    }},
    { id: 'pull', label: '从云端拉取', action: async () => {
      if (!vaultPath) return
      await window.api.invoke('cloud:pull-all', { vaultPath })
    }},
    { id: 'graph-full', label: '知识图谱（全屏）', shortcut: 'Ctrl+Shift+G', action: () => {
      const state = useUIStore.getState()
      if (state.rightPanel === 'graph') toggleRightPanel('graph')
      useUIStore.getState().setMainView('graph')
    }},
    { id: 'trash', label: '回收站', action: () => window.dispatchEvent(new CustomEvent('open-trash')) },
    { id: 'summarize', label: 'AI 生成摘要', action: async () => {
      if (!content || !currentFilePath) return
      const summary = await window.api.invoke('ai:summarize', { content })
      if (summary) {
        const newContent = `> ${summary}\n\n${content}`
        useEditorStore.getState().setContent(newContent)
      }
    }},
    { id: 'import-obsidian', label: '导入 Obsidian Vault', action: async () => {
      if (!vaultPath) return
      const sourcePath = await window.api.invoke('vault:select', undefined)
      if (sourcePath) {
        const result = await window.api.invoke('file:import-obsidian', { sourcePath, vaultPath })
        const { toast } = await import('../stores/toast-store')
        toast(`导入完成: ${result.imported} 个文件, ${result.converted} 个已转换`, 'success')
        useVaultStore.getState().refreshFiles()
      }
    }},
  ], [saveFile, currentFilePath, content, vaultPath])

  const filtered = query.trim()
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const listRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => {
        const next = Math.min(i + 1, filtered.length - 1)
        const item = listRef.current?.children[next] as HTMLElement
        if (item) item.scrollIntoView({ block: 'nearest' })
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => {
        const next = Math.max(i - 1, 0)
        const item = listRef.current?.children[next] as HTMLElement
        if (item) item.scrollIntoView({ block: 'nearest' })
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
        <div ref={listRef} style={{ maxHeight: 320, overflowY: 'auto', padding: 4 }}>
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={() => { cmd.action(); onClose() }}
              style={{
                width: '100%',
                height: 34,
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 13,
                color: i === selectedIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: i === selectedIndex ? 'var(--accent-muted)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>{cmd.label}</span>
              {cmd.shortcut && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{cmd.shortcut}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
