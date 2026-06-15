import { useEffect, useState, useMemo } from 'react'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { VirtualFileTree } from './VirtualFileTree'
import { ContextMenu } from '../ContextMenu'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Input } from '../ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { safeGet, safeSet } from '../../utils/storage'
import type { FileEntry } from '@shared/types/ipc'

type SortMode = 'name' | 'mtime'

function getInitialSortMode(): SortMode {
  return safeGet('nexusky-sort') === 'mtime' ? 'mtime' : 'name'
}

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
  const fileError = useVaultStore((s) => s.fileError)
  const indexError = useVaultStore((s) => s.indexError)
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
  const [sortBy, setSortBy] = useState<SortMode>(getInitialSortMode)
  const [defaultExpanded, setDefaultExpanded] = useState(true)
  const [treeExpansionVersion, setTreeExpansionVersion] = useState(0)
  const [vaultMenuOpen, setVaultMenuOpen] = useState(false)
  const [recentVaults, setRecentVaults] = useState<string[]>([])

  const sortedFiles = useMemo(() => sortFiles(filterFiles(files, filterQuery), sortBy), [files, filterQuery, sortBy])
  const sortLabel = sortBy === 'name' ? '按名称排序（点击切换为按时间）' : '按修改时间排序（点击切换为按名称）'
  const otherRecentVaults = recentVaults.filter((p) => p !== vaultPath)

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
      await window.api.invoke('file:create', { path: `${folderPath}/.gitkeep`, content: '', vaultPath })
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

  const handleSwitchVault = async (path: string) => {
    setVaultMenuOpen(false)
    const { setVaultPath, refreshFiles, indexVault } = useVaultStore.getState()
    setVaultPath(path)
    await refreshFiles()
    await indexVault()
  }

  return (
    <aside className="animate-slide-in-left" style={{ width, height: '100%', minHeight: 0, background: 'transparent', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ height: 40, padding: '0 10px 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'transparent' }}>
        <DropdownMenu open={vaultMenuOpen} onOpenChange={setVaultMenuOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span style={{ display: 'inline-flex', minWidth: 0 }}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="切换笔记空间"
                    style={{ minWidth: 0, height: 30, fontSize: 13, fontWeight: 650, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'transparent', border: 0, cursor: 'pointer', padding: '0 7px', display: 'flex', alignItems: 'center', gap: 5, borderRadius: 9 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--control-bg)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {vaultPath?.split(/[\\/]/).pop()}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </Button>
                </DropdownMenuTrigger>
              </span>
            </TooltipTrigger>
            <TooltipContent>切换笔记空间</TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            className="glass-popover"
            style={{
              width: Math.max(180, width - 16),
              background: 'var(--bg-glass-dense, var(--bg-glass-solid))',
              border: '1px solid var(--glass-panel-border)',
              borderRadius: 12,
              padding: '6px 4px',
              boxShadow: 'var(--shadow-popover), var(--glass-panel-edge-shadow)',
              backdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)',
              WebkitBackdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)',
            }}
          >
            <DropdownMenuLabel style={{ padding: '4px 10px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              笔记空间
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {otherRecentVaults.map((path) => (
                <DropdownMenuItem
                  key={path}
                  onSelect={() => { void handleSwitchVault(path) }}
                  style={{ minHeight: 34, padding: '0 10px', alignItems: 'center', gap: 8, color: 'var(--text-primary)', borderRadius: 8 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-tertiary)' }}>
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{path.split(/[\\/]/).pop()}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{path}</div>
                  </div>
                </DropdownMenuItem>
              ))}
              {otherRecentVaults.length === 0 && (
                <DropdownMenuItem disabled style={{ minHeight: 32, justifyContent: 'center', padding: '0 10px', fontSize: 11, color: 'var(--text-tertiary)' }}>
                  暂无其他笔记空间
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--border-subtle) 44%, transparent) 18%, color-mix(in srgb, var(--glass-highlight) 62%, transparent) 50%, color-mix(in srgb, var(--border-subtle) 34%, transparent) 82%, transparent)', margin: '4px 8px' }} />
            <DropdownMenuItem
              onSelect={() => {
                setVaultMenuOpen(false)
                selectVault()
              }}
              style={{ minHeight: 34, padding: '0 10px', alignItems: 'center', gap: 8, color: 'var(--accent-text)', borderRadius: 8 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
              </svg>
              打开其他文件夹...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div style={{ display: 'flex', gap: 2 }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="新建笔记 (Ctrl+N)"
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (isCreating && createType === 'file') { setIsCreating(false); setNewFileName('') }
                  else { setCreateType('file'); setIsCreating(true) }
                }}
                style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: 0, background: isCreating && createType === 'file' ? 'color-mix(in srgb, var(--accent-muted) 70%, var(--control-bg))' : 'transparent', color: isCreating && createType === 'file' ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--control-bg)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isCreating && createType === 'file' ? 'color-mix(in srgb, var(--accent-muted) 70%, var(--control-bg))' : 'transparent'; e.currentTarget.style.color = isCreating && createType === 'file' ? 'var(--accent-text)' : 'var(--text-tertiary)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </Button>
            </TooltipTrigger>
            <TooltipContent>新建笔记 (Ctrl+N)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="新建文件夹"
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (isCreating && createType === 'folder') { setIsCreating(false); setNewFileName('') }
                  else { setCreateType('folder'); setIsCreating(true) }
                }}
                style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: 0, background: isCreating && createType === 'folder' ? 'color-mix(in srgb, var(--accent-muted) 70%, var(--control-bg))' : 'transparent', color: isCreating && createType === 'folder' ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--control-bg)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isCreating && createType === 'folder' ? 'color-mix(in srgb, var(--accent-muted) 70%, var(--control-bg))' : 'transparent'; e.currentTarget.style.color = isCreating && createType === 'folder' ? 'var(--accent-text)' : 'var(--text-tertiary)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
                </svg>
              </Button>
            </TooltipTrigger>
            <TooltipContent>新建文件夹</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* New file input */}
      {isCreating && (
        <div style={{ padding: '8px 12px 0' }}>
          <Input
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
              background: 'var(--control-bg)',
              border: '1px solid var(--accent)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              outline: 'none',
              boxShadow: 'inset 0 1px 0 var(--glass-highlight)',
            }}
          />
        </div>
      )}

      {/* Filter + Sort */}
      <div className="glass-divider-bottom" style={{ margin: '0 6px 6px', padding: 6, display: 'flex', gap: 5, flexWrap: 'wrap', borderRadius: 12, background: 'color-mix(in srgb, var(--panel-bg-soft) 34%, transparent)', boxShadow: 'none' }}>
        <Input
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="筛选..."
          style={{
            flex: 1, width: 'auto', minWidth: 60, height: 26, padding: '0 8px', fontSize: 12,
            background: 'color-mix(in srgb, var(--control-bg) 82%, transparent)', border: 0,
            borderRadius: 8, color: 'var(--text-primary)', outline: 'none',
            boxShadow: 'none',
            transition: 'background 150ms',
          }}
          onFocus={(e) => e.currentTarget.style.background = 'var(--control-hover)'}
          onBlur={(e) => e.currentTarget.style.background = 'color-mix(in srgb, var(--control-bg) 82%, transparent)'}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={sortLabel}
              onClick={() => {
                const next = sortBy === 'name' ? 'mtime' : 'name'
                setSortBy(next)
                safeSet('nexusky-sort', next)
              }}
              style={{ width: 28, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 0, background: 'color-mix(in srgb, var(--control-bg) 82%, transparent)', color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0, boxShadow: 'none' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {sortBy === 'name' ? (
                  <><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="8" y2="18" /></>
                ) : (
                  <><circle cx="12" cy="12" r="1" /><polyline points="12 6 12 2" /><polyline points="12 22 12 18" /><path d="M5 12H2" /><path d="M22 12h-3" /></>
                )}
              </svg>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sortLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="折叠全部"
              onClick={() => { setDefaultExpanded(false); setTreeExpansionVersion((version) => version + 1) }}
              style={{ width: 28, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 0, background: 'color-mix(in srgb, var(--control-bg) 82%, transparent)', color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0, boxShadow: 'none' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12h16" /><path d="M12 2v6" /><path d="M12 16v6" /><path d="M8 6l4 4 4-4" /><path d="M8 18l4-4 4 4" />
              </svg>
            </Button>
          </TooltipTrigger>
          <TooltipContent>折叠全部</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="展开全部"
              onClick={() => { setDefaultExpanded(true); setTreeExpansionVersion((version) => version + 1) }}
              style={{ width: 28, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 0, background: 'color-mix(in srgb, var(--control-bg) 82%, transparent)', color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0, boxShadow: 'none' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12h16" /><path d="M12 4v4" /><path d="M12 16v4" /><path d="M8 8l4-4 4 4" /><path d="M8 16l4 4 4-4" />
              </svg>
            </Button>
          </TooltipTrigger>
          <TooltipContent>展开全部</TooltipContent>
        </Tooltip>
      </div>

      {/* Favorites */}
      {favorites.length > 0 && !filterQuery && (
        <div style={{ padding: '4px 8px 8px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 4px 2px', marginBottom: 2 }}>收藏</div>
          {favorites.map((fav) => {
            const name = fav.split(/[\\/]/).pop()?.replace(/\.md$/, '') || fav
            return (
              <Button
                type="button"
                variant="ghost"
                key={fav}
                onClick={() => openFile(fav)}
                style={{
                  width: '100%', height: 26, paddingLeft: 8, paddingRight: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 6, borderRadius: 5,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--accent)" stroke="none">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              </Button>
            )
          })}
        </div>
      )}

      {/* File tree */}
      <div
        tabIndex={0}
        style={{ flex: 1, minHeight: 0, overflowY: 'hidden', padding: '6px 4px 12px 8px', outline: 'none', display: 'flex', flexDirection: 'column' }}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          e.preventDefault()
          setBlankContextMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        {fileError ? (
          <div style={{ flex: 1, minHeight: 0, padding: '18px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>无法读取笔记空间</div>
              <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text-tertiary)', wordBreak: 'break-word' }}>{fileError}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => refreshFiles()}
                style={{ height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
              >
                重试
              </Button>
              <Button
                type="button"
                size="xs"
                onClick={() => selectVault()}
                style={{ height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent-muted)', color: 'var(--accent-text)', fontSize: 12, cursor: 'pointer' }}
              >
                重新选择
              </Button>
            </div>
          </div>
        ) : (
          <>
            {indexError && (
              <div style={{ flexShrink: 0, margin: '0 4px 8px 0', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', fontSize: 11, lineHeight: 1.5 }}>
                索引失败：{indexError}
              </div>
            )}
            <VirtualFileTree entries={sortedFiles} defaultExpanded={defaultExpanded} expansionVersion={treeExpansionVersion} />
          </>
        )}
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

    </aside>
  )
}
