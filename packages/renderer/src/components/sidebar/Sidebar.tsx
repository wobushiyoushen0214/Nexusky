import { useEffect, useState, useRef, useMemo } from 'react'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { VirtualFileTree } from './VirtualFileTree'
import { ContextMenu } from '../ContextMenu'
import type { FileEntry } from '@shared/types/ipc'

function sortFiles(entries: FileEntry[], by: 'name' | 'mtime'): FileEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    if (by === 'mtime') return (b.mtime || 0) - (a.mtime || 0)
    return a.name.localeCompare(b.name)
  })
  return sorted.map((e) => e.isDirectory && e.children ? { ...e, children: sortFiles(e.children, by) } : e)
}

function filterFiles(entries: FileEntry[], query: string): FileEntry[] {
  if (!query.trim()) return entries
  const q = query.toLowerCase()
  return entries.reduce<FileEntry[]>((acc, entry) => {
    if (entry.isDirectory) {
      const filtered = filterFiles(entry.children || [], query)
      if (filtered.length > 0) acc.push({ ...entry, children: filtered })
    } else if (entry.name.toLowerCase().includes(q)) {
      acc.push(entry)
    }
    return acc
  }, [])
}

export function Sidebar({ width = 240 }: { width?: number }) {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const files = useVaultStore((s) => s.files)
  const favorites = useVaultStore((s) => s.favorites)
  const refreshFiles = useVaultStore((s) => s.refreshFiles)
  const selectVault = useVaultStore((s) => s.selectVault)
  const openFile = useEditorStore((s) => s.openFile)
  const { setSearchOpen, setQuickSwitcherOpen, toggleRightPanel, setSettingsOpen, setMainView } = useUIStore()
  const [isCreating, setIsCreating] = useState(false)
  const [createType, setCreateType] = useState<'file' | 'folder'>('file')
  const [newFileName, setNewFileName] = useState('')
  const [filterQuery, setFilterQuery] = useState('')
  const [blankContextMenu, setBlankContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'mtime'>(() => {
    try { return (localStorage.getItem('nexusky-sort') as any) || 'name' } catch { return 'name' }
  })
  const [treeKey, setTreeKey] = useState(0)
  const [defaultExpanded, setDefaultExpanded] = useState(true)
  const [vaultMenu, setVaultMenu] = useState(false)
  const vaultMenuRef = useRef<HTMLDivElement>(null)
  const vaultMenuButtonRef = useRef<HTMLButtonElement>(null)
  const [recentVaults, setRecentVaults] = useState<string[]>([])

  const sortedFiles = useMemo(() => sortFiles(filterFiles(files, filterQuery), sortBy), [files, filterQuery, sortBy])

  useEffect(() => {
    if (!vaultMenu) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (vaultMenuRef.current?.contains(target)) return
      if (vaultMenuButtonRef.current?.contains(target)) return
      setVaultMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [vaultMenu])

  useEffect(() => {
    window.api.invoke('vault:get-recent', undefined).then(setRecentVaults)
  }, [])

  useEffect(() => {
    if (vaultPath) refreshFiles()
  }, [vaultPath])

  useEffect(() => {
    const handleCreateNote = () => {
      setCreateType('file')
      setIsCreating(true)
    }
    window.addEventListener('create-new-note', handleCreateNote)
    return () => window.removeEventListener('create-new-note', handleCreateNote)
  }, [])

  const handleCreateFile = async () => {
    if (!newFileName.trim() || !vaultPath) return
    if (createType === 'folder') {
      const folderPath = `${vaultPath}/${newFileName.trim()}`
      await window.api.invoke('file:create', { path: `${folderPath}/.gitkeep`, content: '' })
      setIsCreating(false)
      setNewFileName('')
      await refreshFiles()
      return
    }
    const name = newFileName.trim().endsWith('.md') ? newFileName.trim() : `${newFileName.trim()}.md`
    const path = `${vaultPath}/${name}`
    await window.api.invoke('file:create', { path, content: `# ${newFileName.trim().replace(/\.md$/, '')}\n\n`, vaultPath })
    setIsCreating(false)
    setNewFileName('')
    await refreshFiles()
    await openFile(path)
  }

  return (
    <aside className="animate-slide-in-left" style={{ width, height: '100%', background: 'var(--sidebar-bg)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ height: 44, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <button
          ref={vaultMenuButtonRef}
          onClick={() => setVaultMenu(!vaultMenu)}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
          title="切换笔记空间"
        >
          {vaultPath?.split(/[\\/]/).pop()}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            onClick={() => { setCreateType('file'); setIsCreating(true) }}
            style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            title="新建笔记 (Ctrl+N)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={() => { setCreateType('folder'); setIsCreating(true) }}
            style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            title="新建文件夹"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Vault switcher dropdown */}
      {vaultMenu && (
        <div ref={vaultMenuRef} style={{ padding: '0 8px 8px' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            {recentVaults.filter((p) => p !== vaultPath).map((path) => (
              <button
                key={path}
                onClick={async () => {
                  setVaultMenu(false)
                  const { setVaultPath, refreshFiles, indexVault } = useVaultStore.getState()
                  setVaultPath(path)
                  await refreshFiles()
                  await indexVault()
                }}
                style={{ width: '100%', height: 28, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: 'var(--text-tertiary)' }}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path.split(/[\\/]/).pop()}</span>
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
            <button
              onClick={() => { setVaultMenu(false); selectVault() }}
              style={{ width: '100%', height: 28, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              打开其他文件夹...
            </button>
          </div>
        </div>
      )}

      {/* New file input */}
      {isCreating && (
        <div style={{ padding: '0 12px 8px' }}>
          <input
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFile()
              if (e.key === 'Escape') { setIsCreating(false); setNewFileName('') }
            }}
            onBlur={() => { setIsCreating(false); setNewFileName('') }}
            placeholder={createType === 'folder' ? '文件夹名' : '文件名'}
            style={{
              width: '100%',
              height: 28,
              padding: '0 8px',
              fontSize: 13,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--accent)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* Filter + Sort */}
      <div style={{ padding: '0 8px 4px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <input
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="筛选..."
          style={{
            flex: 1, minWidth: 60, height: 26, padding: '0 8px', fontSize: 12,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
            transition: 'border-color 150ms',
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
        />
        <button
          onClick={() => {
            const next = sortBy === 'name' ? 'mtime' : 'name'
            setSortBy(next)
            localStorage.setItem('nexusky-sort', next)
          }}
          style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0 }}
          title={sortBy === 'name' ? '按名称排序（点击切换为按时间）' : '按修改时间排序（点击切换为按名称）'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {sortBy === 'name' ? (
              <><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="8" y2="18" /></>
            ) : (
              <><circle cx="12" cy="12" r="1" /><polyline points="12 6 12 2" /><polyline points="12 22 12 18" /><path d="M5 12H2" /><path d="M22 12h-3" /></>
            )}
          </svg>
        </button>
        <button
          onClick={() => { setDefaultExpanded(false); setTreeKey((k) => k + 1) }}
          style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0 }}
          title="折叠全部"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h16" /><path d="M12 4v4" /><path d="M12 16v4" /><path d="M8 8l4-4 4 4" /><path d="M8 16l4 4 4-4" />
          </svg>
        </button>
        <button
          onClick={() => { setDefaultExpanded(true); setTreeKey((k) => k + 1) }}
          style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0 }}
          title="展开全部"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h16" /><path d="M12 2v6" /><path d="M12 16v6" /><path d="M8 6l4 4 4-4" /><path d="M8 18l4-4 4 4" />
          </svg>
        </button>
      </div>

      {/* Favorites */}
      {favorites.length > 0 && !filterQuery && (
        <div style={{ padding: '4px 8px 8px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 4px 2px', marginBottom: 2 }}>收藏</div>
          {favorites.map((fav) => {
            const name = fav.split(/[\\/]/).pop()?.replace(/\.md$/, '') || fav
            return (
              <button
                key={fav}
                onClick={() => openFile(fav)}
                style={{
                  width: '100%', height: 26, paddingLeft: 8, paddingRight: 8,
                  display: 'flex', alignItems: 'center', gap: 6, borderRadius: 5,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--accent)" stroke="none">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* File tree */}
      <div
        tabIndex={0}
        style={{ flex: 1, overflowY: 'hidden', padding: '0 8px 12px', outline: 'none' }}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          e.preventDefault()
          setBlankContextMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <VirtualFileTree key={treeKey} entries={sortedFiles} defaultExpanded={defaultExpanded} />
      </div>
      {blankContextMenu && (
        <ContextMenu
          x={blankContextMenu.x}
          y={blankContextMenu.y}
          items={[
            { label: '新建笔记', onClick: () => { setCreateType('file'); setIsCreating(true) } },
            { label: '新建文件夹', onClick: () => { setCreateType('folder'); setIsCreating(true) } },
            { label: '刷新', onClick: () => refreshFiles() },
          ]}
          onClose={() => setBlankContextMenu(null)}
        />
      )}

      {/* Footer - Icon buttons */}
      <SidebarFooter />
    </aside>
  )
}

function SidebarFooter() {
  const { setSearchOpen, setQuickSwitcherOpen, toggleRightPanel, setSettingsOpen, setMainView } = useUIStore()
  const { vaultPath, refreshFiles } = useVaultStore()
  const openFile = useEditorStore((s) => s.openFile)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!moreOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (moreRef.current?.contains(target)) return
      if (moreButtonRef.current?.contains(target)) return
      setMoreOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [moreOpen])

  const iconBtn = (onClick: () => void, title: string, icon: React.ReactNode) => (
    <button onClick={onClick} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }} title={title}>
      {icon}
    </button>
  )

  return (
    <div style={{ height: 44, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {iconBtn(() => setSearchOpen(true), '搜索 (Ctrl+Shift+F)',
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        )}
        {iconBtn(() => toggleRightPanel('chat'), 'AI 对话 (Ctrl+L)',
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        )}
        {iconBtn(() => toggleRightPanel('graph'), '知识图谱 (Ctrl+G)',
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><line x1="8.5" y1="7.5" x2="15.5" y2="16.5" /><line x1="15.5" y1="7.5" x2="8.5" y2="16.5" /></svg>
        )}
        {/* More */}
        <button
          ref={moreButtonRef}
          onClick={() => setMoreOpen(!moreOpen)}
          style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: moreOpen ? 'var(--bg-elevated)' : 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
          title="更多"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </button>
      </div>
      {iconBtn(() => setSettingsOpen(true), '设置 (Ctrl+,)',
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
      )}

      {/* More menu popup */}
      {moreOpen && (
        <div ref={moreRef} style={{ position: 'absolute', bottom: 44, left: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', minWidth: 160, zIndex: 100 }}>
          {[
            { label: '快速切换', shortcut: 'Ctrl+O', action: () => setQuickSwitcherOpen(true) },
            { label: '今日笔记', action: async () => { if (!vaultPath) return; const p = await window.api.invoke('template:daily-note', { vaultPath }); if (p) { await refreshFiles(); await openFile(p) } } },
            { label: '文档大纲', shortcut: 'Ctrl+E', action: () => toggleRightPanel('outline') },
            { label: '标签', action: () => toggleRightPanel('tags') },
            { label: '日历', action: () => toggleRightPanel('calendar') },
            { label: '看板', action: () => toggleRightPanel('kanban') },
            { label: '图谱全屏', shortcut: 'Ctrl+Shift+G', action: () => { toggleRightPanel('graph'); setMainView('graph') } },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { item.action(); setMoreOpen(false) }}
              style={{ width: '100%', height: 30, padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span>{item.label}</span>
              {item.shortcut && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{item.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
