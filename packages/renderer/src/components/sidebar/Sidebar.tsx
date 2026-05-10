import { useEffect, useState } from 'react'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { FileTree } from './FileTree'
import type { FileEntry } from '@shared/types/ipc'

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
  const { vaultPath, files, favorites, refreshFiles, selectVault } = useVaultStore()
  const openFile = useEditorStore((s) => s.openFile)
  const { setSearchOpen, setQuickSwitcherOpen, toggleRightPanel, setSettingsOpen, setMainView } = useUIStore()
  const [isCreating, setIsCreating] = useState(false)
  const [createType, setCreateType] = useState<'file' | 'folder'>('file')
  const [newFileName, setNewFileName] = useState('')
  const [filterQuery, setFilterQuery] = useState('')

  useEffect(() => {
    if (vaultPath) refreshFiles()
  }, [vaultPath])

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
    await window.api.invoke('file:create', { path, content: `# ${newFileName.trim().replace(/\.md$/, '')}\n\n` })
    setIsCreating(false)
    setNewFileName('')
    await refreshFiles()
    await openFile(path)
  }

  return (
    <aside className="animate-slide-in-left" style={{ width, height: '100%', background: 'var(--sidebar-bg)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ height: 44, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {vaultPath?.split(/[\\/]/).pop()}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            onClick={() => { setCreateType('file'); setIsCreating(true) }}
            style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            title="新建笔记"
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

      {/* Filter */}
      <div style={{ padding: '0 8px 4px' }}>
        <input
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="筛选..."
          style={{
            width: '100%', height: 26, padding: '0 8px', fontSize: 12,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
            transition: 'border-color 150ms',
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
        />
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
        <FileTree entries={filterFiles(files, filterQuery)} />
      </div>

      {/* Footer - Icon buttons */}
      <div style={{ height: 44, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            title="搜索 (Ctrl+Shift+F)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          {/* Quick switcher */}
          <button
            onClick={() => setQuickSwitcherOpen(true)}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            title="快速切换 (Ctrl+O)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" />
            </svg>
          </button>
          {/* Graph */}
          <button
            onClick={() => toggleRightPanel('graph')}
            onDoubleClick={() => setMainView('graph')}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            title="知识图谱 (单击侧栏 / 双击全屏)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><circle cx="18" cy="6" r="3" />
              <line x1="8.5" y1="7.5" x2="15.5" y2="16.5" /><line x1="15.5" y1="7.5" x2="8.5" y2="16.5" />
            </svg>
          </button>
          {/* AI Chat */}
          <button
            onClick={() => toggleRightPanel('chat')}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            title="AI 对话 (Ctrl+L)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          {/* Daily note */}
          <button
            onClick={async () => {
              if (!vaultPath) return
              const path = await window.api.invoke('template:daily-note', { vaultPath })
              if (path) { await refreshFiles(); await openFile(path) }
            }}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            title="今日笔记"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
          {/* Outline */}
          <button
            onClick={() => toggleRightPanel('outline')}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            title="大纲"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>
        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
          title="设置 (Ctrl+,)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
