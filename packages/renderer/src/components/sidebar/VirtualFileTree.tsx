import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import { useVaultStore } from '../../stores/vault-store'
import { ContextMenu } from '../ContextMenu'
import type { FileEntry } from '@shared/types/ipc'

interface FlatNode {
  entry: FileEntry
  depth: number
  isExpanded: boolean
  hasChildren: boolean
}

const ITEM_HEIGHT = 30
const OVERSCAN = 5

interface VirtualFileTreeProps {
  entries: FileEntry[]
  defaultExpanded?: boolean
}

export function VirtualFileTree({ entries, defaultExpanded = true }: VirtualFileTreeProps) {
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

  useEffect(() => {
    if (defaultExpanded) {
      const set = new Set<string>()
      function collectDirs(items: FileEntry[]) {
        for (const item of items) {
          if (item.isDirectory) {
            set.add(item.path)
            if (item.children) collectDirs(item.children)
          }
        }
      }
      collectDirs(entries)
      setExpandedPaths(set)
    } else {
      setExpandedPaths(new Set())
    }
  }, [defaultExpanded, entries])

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
      <div style={{ padding: '32px 8px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>空笔记库</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      style={{ height: '100%', overflowY: 'auto', position: 'relative', outline: 'none' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: startIndex * ITEM_HEIGHT, left: 0, right: 0 }}>
          {visibleNodes.map((node, i) => (
            <VirtualFileTreeItem
              key={node.entry.path}
              node={node}
              onToggle={toggleExpand}
              isFocused={startIndex + i === focusedIndex}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function VirtualFileTreeItem({ node, onToggle, isFocused }: { node: FlatNode; onToggle: (path: string) => void; isFocused?: boolean }) {
  const { entry, depth, isExpanded } = node
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [hovered, setHovered] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const dragCountRef = useRef(0)
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
    e.dataTransfer.effectAllowed = 'move'
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

  const handleDelete = async () => {
    await window.api.invoke('file:delete', { path: entry.path, vaultPath: vaultPath || undefined })
    await refreshFiles()
  }

  const menuItems = entry.isDirectory ? [
    { label: '重命名', onClick: () => { setNewName(entry.name); setRenaming(true) } },
    { label: '删除', danger: true, onClick: handleDelete },
  ] : [
    { label: isFavorite ? '取消收藏' : '收藏', onClick: () => toggleFavorite(entry.path) },
    { label: '重命名', onClick: () => { setNewName(entry.name.replace(/\.md$/, '')); setRenaming(true) } },
    { label: '删除', danger: true, onClick: handleDelete },
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
          style={{ width: '100%', height: 24, padding: '0 8px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none' }}
        />
      </div>
    )
  }

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }}
        onDragOver={entry.isDirectory ? handleDragOver : undefined}
        onDragEnter={entry.isDirectory ? handleDragEnter : undefined}
        onDragLeave={entry.isDirectory ? handleDragLeave : undefined}
        onDrop={entry.isDirectory ? handleDrop : undefined}
        style={{
          height: ITEM_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          borderRadius: 6,
          background: isActive ? 'var(--accent-muted)' : dragOver ? 'var(--accent-muted)' : isFocused ? 'var(--bg-hover)' : 'transparent',
          outline: dragOver ? '1px dashed var(--accent)' : 'none',
        }}
      >
        <button
          draggable
          data-file-path={entry.path}
          onDragStart={handleDragStart}
          onClick={() => entry.isDirectory ? onToggle(entry.path) : openFile(entry.path)}
          style={{
            flex: 1, height: ITEM_HEIGHT, paddingLeft: entry.isDirectory ? paddingLeft : paddingLeft + 16, paddingRight: 4,
            display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6,
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 13, color: isActive ? 'var(--accent-text)' : 'var(--text-secondary)', textAlign: 'left', minWidth: 0,
          }}
        >
          {entry.isDirectory && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 100ms', color: 'var(--text-tertiary)', flexShrink: 0 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: isActive ? 'var(--accent-text)' : 'var(--text-tertiary)', opacity: 0.7 }}>
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
          onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY }) }}
          style={{
            width: 22, height: 22, flexShrink: 0, marginRight: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4, border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'var(--text-tertiary)',
            opacity: hovered ? 1 : 0, transition: 'opacity 100ms',
          }}
          title="更多操作"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </div>
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={menuItems} onClose={() => setContextMenu(null)} />}
    </>
  )
}
