import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import { VAULT_FILES_REFRESHED_EVENT, useVaultStore, type VaultFilesRefreshedDetail } from '../../stores/vault-store'
import { ContextMenu } from '../ContextMenu'
import { ConfirmModal } from '../ConfirmModal'
import type { FileEntry } from '@shared/types/ipc'

interface FlatNode {
  entry: FileEntry
  depth: number
  isExpanded: boolean
  hasChildren: boolean
}

interface FileTreeItemMenu {
  path: string
  x: number
  y: number
}

const ITEM_HEIGHT = 30
const OVERSCAN = 5

function parentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : ''
}

export function getFileTreeReloadPaths(changedPaths: string[], expandedPaths: Set<string>, lazyPaths: Set<string>): string[] {
  const reloadPaths = new Set<string>()
  const expandedByNormalized = new Map(Array.from(expandedPaths).map((path) => [path.replace(/\\/g, '/'), path]))
  const lazyByNormalized = new Map(Array.from(lazyPaths).map((path) => [path.replace(/\\/g, '/'), path]))
  for (const changedPath of changedPaths) {
    const normalized = changedPath.replace(/\\/g, '/')
    for (const candidate of [normalized, parentPath(normalized)]) {
      if (!candidate) continue
      const expandedPath = expandedByNormalized.get(candidate)
      const lazyPath = lazyByNormalized.get(candidate)
      if (expandedPath) reloadPaths.add(expandedPath)
      if (lazyPath) reloadPaths.add(lazyPath)
    }
  }
  return Array.from(reloadPaths)
}

interface VirtualFileTreeProps {
  entries: FileEntry[]
  defaultExpanded?: boolean
  expansionVersion?: number
}

export function VirtualFileTree({ entries, defaultExpanded = true, expansionVersion = 0 }: VirtualFileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    if (!defaultExpanded) return new Set()
    const set = new Set<string>()
    function collectDirs(items: FileEntry[]) {
      for (const item of items) {
        if (item.isDirectory) {
          set.add(item.path)
          if (item.children && item.children.length > 0) collectDirs(item.children)
        }
      }
    }
    collectDirs(entries)
    return set
  })

  const [lazyChildren, setLazyChildren] = useState<Map<string, FileEntry[]>>(new Map())
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const lastClickedRef = useRef<number>(-1)
  const entriesRef = useRef(entries)
  const expandedPathsRef = useRef(expandedPaths)
  const lazyChildrenRef = useRef(lazyChildren)

  useEffect(() => { entriesRef.current = entries }, [entries])
  useEffect(() => { expandedPathsRef.current = expandedPaths }, [expandedPaths])
  useEffect(() => { lazyChildrenRef.current = lazyChildren }, [lazyChildren])

  const reloadExpandedChildren = useCallback(async () => {
    const paths = new Set<string>()
    const expanded = expandedPathsRef.current
    const lazy = lazyChildrenRef.current
    const collect = (items: FileEntry[]) => {
      for (const item of items) {
        if (!item.isDirectory || !expanded.has(item.path)) continue
        paths.add(item.path)
        collect(lazy.get(item.path) || item.children || [])
      }
    }
    collect(entriesRef.current)
    if (paths.size === 0) return

    const updates = await Promise.all(Array.from(paths).map(async (path) => {
      try {
        const children = await window.api.invoke('file:list-shallow', { dirPath: path })
        return [path, children] as const
      } catch {
        return null
      }
    }))

    setLazyChildren((prev) => {
      const next = new Map(prev)
      for (const update of updates) {
        if (update) next.set(update[0], update[1])
      }
      return next
    })
  }, [])

  const reloadChangedParents = useCallback(async (changedPaths: string[]) => {
    const paths = getFileTreeReloadPaths(
      changedPaths,
      expandedPathsRef.current,
      new Set(lazyChildrenRef.current.keys())
    )
    if (paths.length === 0) return

    const updates = await Promise.all(paths.map(async (path) => {
      try {
        const children = await window.api.invoke('file:list-shallow', { dirPath: path })
        return [path, children] as const
      } catch {
        return null
      }
    }))

    setLazyChildren((prev) => {
      const next = new Map(prev)
      for (const update of updates) {
        if (update) next.set(update[0], update[1])
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (defaultExpanded) {
      const rootDirs: string[] = []
      function collectDirs(items: FileEntry[]) {
        for (const item of items) {
          if (item.isDirectory) {
            rootDirs.push(item.path)
            if (item.children && item.children.length > 0) collectDirs(item.children)
          }
        }
      }
      collectDirs(entries)
      setExpandedPaths((prev) => {
        const next = new Set(prev)
        let changed = false
        for (const path of rootDirs) {
          if (!next.has(path)) {
            next.add(path)
            changed = true
          }
        }
        return changed ? next : prev
      })

      const loadExpanded = async () => {
        const newLazy = new Map(lazyChildrenRef.current)
        for (const item of entries) {
          if (item.isDirectory && (!item.children || item.children.length === 0)) {
            try {
              const children = await window.api.invoke('file:list-shallow', { dirPath: item.path })
              newLazy.set(item.path, children)
            } catch {}
          }
        }
        if (newLazy.size > 0) setLazyChildren(newLazy)
      }
      loadExpanded()
    } else {
      setExpandedPaths((prev) => prev.size === 0 ? prev : new Set())
      setLazyChildren((prev) => prev.size === 0 ? prev : new Map())
    }
  }, [defaultExpanded, entries, expansionVersion])

  useEffect(() => {
    const reload = (changedPaths: string[] = []) => {
      if (changedPaths.length > 0) void reloadChangedParents(changedPaths)
      else void reloadExpandedChildren()
    }
    const reloadAfterLocalRefresh = (event: Event) => {
      const detail = (event as CustomEvent<VaultFilesRefreshedDetail>).detail
      reload(detail?.changedPaths || [])
    }
    const cleanup = window.api.onVaultChanged(reload)
    window.addEventListener(VAULT_FILES_REFRESHED_EVENT, reloadAfterLocalRefresh)
    return () => {
      cleanup()
      window.removeEventListener(VAULT_FILES_REFRESHED_EVENT, reloadAfterLocalRefresh)
    }
  }, [reloadChangedParents, reloadExpandedChildren])

  const flatNodes = useMemo(() => {
    const nodes: FlatNode[] = []
    function flatten(items: FileEntry[], depth: number) {
      for (const item of items) {
        const isExpanded = expandedPaths.has(item.path)
        const children = item.isDirectory ? (lazyChildren.get(item.path) || item.children || []) : []
        const hasChildren = item.isDirectory
        nodes.push({ entry: { ...item, children }, depth, isExpanded, hasChildren })
        if (item.isDirectory && isExpanded && children.length > 0) {
          flatten(children, depth + 1)
        }
      }
    }
    flatten(entries, 0)
    return nodes
  }, [entries, expandedPaths, lazyChildren])

  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(400)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })
    ro.observe(el)
    setContainerHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const totalHeight = flatNodes.length * ITEM_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(flatNodes.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN)
  const visibleNodes = flatNodes.slice(startIndex, endIndex)

  const toggleExpand = useCallback(async (path: string) => {
    const isCurrentlyExpanded = expandedPaths.has(path)
    if (!isCurrentlyExpanded) {
      const node = flatNodes.find((n) => n.entry.path === path)
      if (node && node.entry.isDirectory && (!node.entry.children || node.entry.children.length === 0) && !lazyChildren.has(path)) {
        try {
          const children = await window.api.invoke('file:list-shallow', { dirPath: path })
          setLazyChildren((prev) => new Map(prev).set(path, children))
        } catch {}
      }
    }
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [expandedPaths, flatNodes, lazyChildren])

  const [focusedIndex, setFocusedIndex] = useState(-1)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return
    e.preventDefault()
    if (e.key === 'ArrowDown') {
      setFocusedIndex((i) => Math.min(i + 1, flatNodes.length - 1))
    } else if (e.key === 'ArrowUp') {
      setFocusedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      const node = flatNodes[focusedIndex]
      if (node) {
        if (node.entry.isDirectory) toggleExpand(node.entry.path)
        else useEditorStore.getState().openFile(node.entry.path)
      }
    }
  }, [flatNodes, focusedIndex, toggleExpand])

  const handleItemClick = useCallback((index: number, path: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedPaths((prev) => {
        const next = new Set(prev)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
      })
      lastClickedRef.current = index
    } else if (e.shiftKey && lastClickedRef.current >= 0) {
      const start = Math.min(lastClickedRef.current, index)
      const end = Math.max(lastClickedRef.current, index)
      const paths = flatNodes.slice(start, end + 1).map((n) => n.entry.path)
      setSelectedPaths(new Set(paths))
    } else {
      setSelectedPaths(new Set())
      lastClickedRef.current = index
    }
  }, [flatNodes])

  const [multiContextMenu, setMultiContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [itemContextMenu, setItemContextMenu] = useState<FileTreeItemMenu | null>(null)
  const [multiDeleteConfirm, setMultiDeleteConfirm] = useState(false)

  const handleMultiDelete = async () => {
    const vaultPath = useVaultStore.getState().vaultPath
    const paths = Array.from(selectedPaths).sort((a, b) => a.length - b.length)
    const deleted = new Set<string>()

    for (const path of paths) {
      if (Array.from(deleted).some((d) => path.startsWith(d + '/'))) continue

      try {
        await window.api.invoke('file:delete', { path, vaultPath: vaultPath || undefined })
        deleted.add(path)
        if (vaultPath) {
          if (path.endsWith('.md')) {
            await window.api.invoke('db:remove-file', { vaultPath, filePath: path }).catch(() => {})
          } else {
            await window.api.invoke('db:remove-folder', { vaultPath, folderPath: path }).catch(() => {})
          }
        }
      } catch {}
    }
    setSelectedPaths(new Set())
    setMultiContextMenu(null)
    setMultiDeleteConfirm(false)
    useVaultStore.getState().refreshFiles()
  }

  const openItemContextMenu = useCallback((path: string, x: number, y: number) => {
    setMultiContextMenu(null)
    setItemContextMenu({ path, x, y })
  }, [])

  useEffect(() => {
    if (focusedIndex >= 0 && containerRef.current) {
      const scrollNeeded = focusedIndex * ITEM_HEIGHT
      const { scrollTop } = containerRef.current
      if (scrollNeeded < scrollTop) containerRef.current.scrollTop = scrollNeeded
      else if (scrollNeeded + ITEM_HEIGHT > scrollTop + containerHeight) {
        containerRef.current.scrollTop = scrollNeeded + ITEM_HEIGHT - containerHeight
      }
    }
  }, [focusedIndex, containerHeight])

  if (entries.length === 0) {
    return (
      <div style={{ flex: 1, minHeight: 0, padding: '32px 8px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>空笔记库</p>
      </div>
    )
  }

  return (
    <div
      className="file-tree-scroll"
      ref={containerRef}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => {
        if (selectedPaths.size > 1) {
          e.preventDefault()
          setMultiContextMenu({ x: e.clientX, y: e.clientY })
        }
      }}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        position: 'relative',
        outline: 'none',
        paddingRight: 2,
        scrollbarGutter: 'stable',
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: startIndex * ITEM_HEIGHT, left: 0, right: 0 }}>
          {visibleNodes.map((node, i) => (
            <VirtualFileTreeItem
              key={node.entry.path}
              node={node}
              index={startIndex + i}
              onToggle={toggleExpand}
              isFocused={startIndex + i === focusedIndex}
              isSelected={selectedPaths.has(node.entry.path)}
              onItemClick={handleItemClick}
              contextMenu={itemContextMenu?.path === node.entry.path ? itemContextMenu : null}
              hasOpenContextMenu={itemContextMenu !== null}
              onOpenContextMenu={openItemContextMenu}
              onCloseContextMenu={() => setItemContextMenu(null)}
            />
          ))}
        </div>
      </div>
      {multiContextMenu && (
        <ContextMenu
          x={multiContextMenu.x}
          y={multiContextMenu.y}
          items={[
            { label: `删除 ${selectedPaths.size} 项`, danger: true, onClick: () => setMultiDeleteConfirm(true) },
          ]}
          onClose={() => setMultiContextMenu(null)}
        />
      )}
      <ConfirmModal
        open={multiDeleteConfirm}
        title="批量删除确认"
        message={`确定要删除选中的 ${selectedPaths.size} 个文件吗？文件将移入回收站。`}
        confirmText="删除"
        danger
        onConfirm={handleMultiDelete}
        onCancel={() => setMultiDeleteConfirm(false)}
      />
    </div>
  )
}

function VirtualFileTreeItem({
  node,
  index,
  onToggle,
  isFocused,
  isSelected,
  onItemClick,
  contextMenu,
  hasOpenContextMenu,
  onOpenContextMenu,
  onCloseContextMenu,
}: {
  node: FlatNode
  index: number
  onToggle: (path: string) => void
  isFocused?: boolean
  isSelected?: boolean
  onItemClick: (index: number, path: string, e: React.MouseEvent) => void
  contextMenu: FileTreeItemMenu | null
  hasOpenContextMenu: boolean
  onOpenContextMenu: (path: string, x: number, y: number) => void
  onCloseContextMenu: () => void
}) {
  const { entry, depth, isExpanded } = node
  const [hovered, setHovered] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const dragCountRef = useRef(0)
  const suppressNextMenuOpenRef = useRef(false)
  const openFile = useEditorStore((s) => s.openFile)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const refreshFiles = useVaultStore((s) => s.refreshFiles)
  const toggleFavorite = useVaultStore((s) => s.toggleFavorite)
  const isFavorite = useVaultStore((s) => s.favorites.includes(entry.path))
  const isActive = currentFilePath === entry.path

  const paddingLeft = depth * 14 + 8

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', entry.path)
    e.dataTransfer.setData('application/x-nexusky-path', entry.path)
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!entry.isDirectory) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnter = (e: React.DragEvent) => {
    if (!entry.isDirectory) return
    e.preventDefault()
    dragCountRef.current++
    setDragOver(true)
  }

  const handleDragLeave = () => {
    if (!entry.isDirectory) return
    dragCountRef.current--
    if (dragCountRef.current === 0) setDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    if (!entry.isDirectory) return
    e.preventDefault()
    setDragOver(false)
    dragCountRef.current = 0
    const sourcePath = e.dataTransfer.getData('text/plain')
    if (!sourcePath || sourcePath === entry.path) return
    const fileName = sourcePath.split(/[\\/]/).pop()
    if (!fileName) return
    const destPath = `${entry.path}/${fileName}`
    if (sourcePath === destPath) return
    await window.api.invoke('file:rename', { oldPath: sourcePath, newPath: destPath, vaultPath: vaultPath || undefined })
    onToggle(entry.path)
    await refreshFiles()
  }

  const handleRename = async () => {
    if (!newName.trim()) { setRenaming(false); return }
    const newPath = entry.path.replace(/[^\\/]+$/, entry.isDirectory ? newName.trim() : (newName.trim().endsWith('.md') ? newName.trim() : `${newName.trim()}.md`))
    await window.api.invoke('file:rename', { oldPath: entry.path, newPath, vaultPath: vaultPath || undefined })
    setRenaming(false)
    await refreshFiles()
  }

  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const handleDelete = async () => {
    await window.api.invoke('file:delete', { path: entry.path, vaultPath: vaultPath || undefined })
    if (vaultPath) {
      if (entry.path.endsWith('.md')) {
        await window.api.invoke('db:remove-file', { vaultPath, filePath: entry.path }).catch(() => {})
      } else if (entry.isDirectory) {
        await window.api.invoke('db:remove-folder', { vaultPath, folderPath: entry.path }).catch(() => {})
      }
    }
    await refreshFiles()
    setDeleteConfirm(false)
  }

  const menuItems = entry.isDirectory ? [
    { label: '索引知识图谱', onClick: () => window.dispatchEvent(new CustomEvent('index-and-show-graph', { detail: { path: entry.path, isDirectory: true } })) },
    { label: '在访达中显示', onClick: () => window.api.invoke('file:reveal', { path: entry.path }) },
    { label: '重命名', onClick: () => { setNewName(entry.name); setRenaming(true) } },
    { label: '删除', danger: true, onClick: () => setDeleteConfirm(true) },
  ] : [
    { label: '索引知识图谱', onClick: () => window.dispatchEvent(new CustomEvent('index-and-show-graph', { detail: { path: entry.path, isDirectory: false } })) },
    { label: isFavorite ? '取消收藏' : '收藏', onClick: () => toggleFavorite(entry.path) },
    { label: '在访达中显示', onClick: () => window.api.invoke('file:reveal', { path: entry.path }) },
    { label: '重命名', onClick: () => { setNewName(entry.name.replace(/\.md$/, '')); setRenaming(true) } },
    { label: '删除', danger: true, onClick: () => setDeleteConfirm(true) },
  ]

  if (renaming) {
    return (
      <div style={{ height: ITEM_HEIGHT, paddingLeft: paddingLeft + (entry.isDirectory ? 0 : 16), paddingRight: 8, display: 'flex', alignItems: 'center' }}>
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false) }}
          onBlur={() => setRenaming(false)}
          style={{ width: '100%', height: 24, padding: '0 8px', fontSize: 12, background: 'var(--control-bg)', border: '1px solid var(--accent)', borderRadius: 7, color: 'var(--text-primary)', outline: 'none' }}
        />
      </div>
    )
  }

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => { if (isSelected) return; e.preventDefault(); onOpenContextMenu(entry.path, e.clientX, e.clientY) }}
        onDragOver={entry.isDirectory ? handleDragOver : undefined}
        onDragEnter={entry.isDirectory ? handleDragEnter : undefined}
        onDragLeave={entry.isDirectory ? handleDragLeave : undefined}
        onDrop={entry.isDirectory ? handleDrop : undefined}
        style={{
          height: ITEM_HEIGHT - 4,
          marginTop: 2,
          marginLeft: 4,
          marginRight: 4,
          display: 'flex',
          alignItems: 'center',
          borderRadius: 8,
          background: isSelected || isActive
            ? 'color-mix(in srgb, var(--accent-muted) 68%, var(--panel-bg-soft))'
            : dragOver
              ? 'var(--accent-muted)'
              : hovered || isFocused
                ? 'var(--control-bg)'
                : 'transparent',
          border: dragOver
            ? '1.5px dashed var(--accent)'
            : '1px solid transparent',
          boxShadow: isSelected || isActive ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 16%, transparent)' : 'none',
          transition: 'background 120ms ease-out, border-color 120ms ease-out, box-shadow 120ms ease-out',
        }}
      >
        <button
          draggable
          data-file-path={entry.path}
          onDragStart={handleDragStart}
          onClick={(e) => {
            onItemClick(index, entry.path, e)
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
              entry.isDirectory ? onToggle(entry.path) : openFile(entry.path)
            }
          }}
          style={{
            flex: 1, height: ITEM_HEIGHT, paddingLeft: entry.isDirectory ? paddingLeft : paddingLeft + 16, paddingRight: 4,
            display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8,
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--accent-text)' : 'var(--text-secondary)', textAlign: 'left', minWidth: 0,
          }}
        >
          {entry.isDirectory && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 100ms', color: 'var(--text-tertiary)', flexShrink: 0 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: isActive ? 'var(--accent-text)' : 'var(--text-tertiary)', opacity: isActive ? 0.95 : 0.72 }}>
            {entry.isDirectory
              ? <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              : <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>
            }
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.isDirectory ? entry.name : entry.name.replace(/\.md$/, '')}
          </span>
        </button>
        <button
          onPointerDown={(e) => {
            if (!hasOpenContextMenu) return
            suppressNextMenuOpenRef.current = true
            e.preventDefault()
            e.stopPropagation()
            onCloseContextMenu()
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (suppressNextMenuOpenRef.current) {
              suppressNextMenuOpenRef.current = false
              return
            }
            onOpenContextMenu(entry.path, e.clientX, e.clientY)
          }}
          style={{
            width: 24, height: 24, flexShrink: 0, marginRight: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, border: 'none', cursor: 'pointer',
            background: 'transparent', color: isActive ? 'var(--accent-text)' : 'var(--text-tertiary)',
            opacity: hovered || isSelected || isActive ? 0.72 : 0,
            transition: 'opacity 100ms ease-out, color 100ms ease-out',
          }}
          title="更多操作"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </div>
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={menuItems} onClose={onCloseContextMenu} />}
      <ConfirmModal
        open={deleteConfirm}
        title="删除确认"
        message={`确定要删除「${entry.name}」吗？文件将移入回收站。`}
        confirmText="删除"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
    </>
  )
}
