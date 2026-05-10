import { useState } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import { useVaultStore } from '../../stores/vault-store'
import { ContextMenu } from '../ContextMenu'
import type { FileEntry } from '@shared/types/ipc'

interface FileTreeProps {
  entries: FileEntry[]
  depth?: number
}

export function FileTree({ entries, depth = 0 }: FileTreeProps) {
  if (entries.length === 0) {
    return depth === 0 ? (
      <div style={{ padding: '32px 8px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>空笔记库</p>
      </div>
    ) : null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {entries.map((entry) => (
        <FileTreeItem key={entry.path} entry={entry} depth={depth} />
      ))}
    </div>
  )
}

function FileTreeItem({ entry, depth }: { entry: FileEntry; depth: number }) {
  const [expanded, setExpanded] = useState(depth === 0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const openFile = useEditorStore((s) => s.openFile)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const refreshFiles = useVaultStore((s) => s.refreshFiles)
  const toggleFavorite = useVaultStore((s) => s.toggleFavorite)
  const isFavorite = useVaultStore((s) => s.favorites.includes(entry.path))
  const isActive = currentFilePath === entry.path

  const paddingLeft = depth * 14 + 8

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleRename = async () => {
    if (!newName.trim()) { setRenaming(false); return }
    const dir = entry.path.substring(0, entry.path.lastIndexOf(/[\\/]/.test(entry.path) ? entry.path.match(/[\\/]/)?.[0] || '/' : '/'))
    const newPath = entry.path.replace(/[^\\/]+$/, newName.trim().endsWith('.md') ? newName.trim() : `${newName.trim()}.md`)
    await window.api.invoke('file:rename', { oldPath: entry.path, newPath })
    setRenaming(false)
    await refreshFiles()
  }

  const handleDelete = async () => {
    await window.api.invoke('file:delete', { path: entry.path })
    await refreshFiles()
  }

  const menuItems = [
    { label: isFavorite ? '取消收藏' : '收藏', onClick: () => toggleFavorite(entry.path) },
    { label: '重命名', onClick: () => { setNewName(entry.name.replace(/\.md$/, '')); setRenaming(true) } },
    { label: '删除', danger: true, onClick: handleDelete },
  ]

  if (renaming) {
    return (
      <div style={{ paddingLeft: paddingLeft + (entry.isDirectory ? 0 : 16), paddingRight: 8 }}>
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename()
            if (e.key === 'Escape') setRenaming(false)
          }}
          onBlur={() => setRenaming(false)}
          style={{
            width: '100%', height: 28, padding: '0 8px', fontSize: 12,
            background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
            borderRadius: 4, color: 'var(--text-primary)', outline: 'none'
          }}
        />
      </div>
    )
  }

  if (entry.isDirectory) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          onContextMenu={handleContextMenu}
          style={{
            width: '100%', height: 30, paddingLeft, paddingRight: 8,
            display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6,
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 13, color: 'var(--text-secondary)', textAlign: 'left',
          }}
        >
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 100ms', color: 'var(--text-tertiary)', flexShrink: 0 }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
        </button>
        {expanded && entry.children && <FileTree entries={entry.children} depth={depth + 1} />}
        {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={menuItems} onClose={() => setContextMenu(null)} />}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => openFile(entry.path)}
        onContextMenu={handleContextMenu}
        style={{
          width: '100%', height: 30, paddingLeft: paddingLeft + 16, paddingRight: 8,
          display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6,
          border: 'none', background: isActive ? 'var(--accent-muted)' : 'transparent',
          cursor: 'pointer', fontSize: 13,
          color: isActive ? 'var(--accent-text)' : 'var(--text-secondary)',
          textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name.replace(/\.md$/, '')}</span>
      </button>
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={menuItems} onClose={() => setContextMenu(null)} />}
    </>
  )
}
