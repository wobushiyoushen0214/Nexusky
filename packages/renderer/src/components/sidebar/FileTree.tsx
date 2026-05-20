import { useState, useRef } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import { useVaultStore } from '../../stores/vault-store'
import { ContextMenu } from '../ContextMenu'
import { ConfirmModal } from '../ConfirmModal'
import type { FileEntry } from '@shared/types/ipc'

interface FileTreeProps {
  entries: FileEntry[]
  depth?: number
  defaultExpanded?: boolean
}

export function FileTree({ entries, depth = 0, defaultExpanded = true }: FileTreeProps) {
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
        <FileTreeItem key={entry.path} entry={entry} depth={depth} defaultExpanded={defaultExpanded} />
      ))}
    </div>
  )
}

function FileTreeItem({ entry, depth, defaultExpanded = true }: { entry: FileEntry; depth: number; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null)
  const [createName, setCreateName] = useState('')
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
    setExpanded(true)
    await refreshFiles()
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
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
    await refreshFiles()
    setDeleteConfirm(false)
  }

  const handleCreate = async () => {
    if (!createName.trim()) { setCreating(null); return }
    const basePath = entry.isDirectory ? entry.path : entry.path.substring(0, entry.path.lastIndexOf('/'))
    if (creating === 'folder') {
      const folderPath = `${basePath}/${createName.trim()}`
      await window.api.invoke('file:create', { path: `${folderPath}/.gitkeep`, content: '', vaultPath: vaultPath || undefined })
    } else {
      const name = createName.trim().endsWith('.md') ? createName.trim() : `${createName.trim()}.md`
      const path = `${basePath}/${name}`
      await window.api.invoke('file:create', { path, content: `# ${createName.trim().replace(/\.md$/, '')}\n\n`, vaultPath: vaultPath || undefined })
      await refreshFiles()
      await openFile(path)
      setCreating(null)
      setCreateName('')
      return
    }
    setCreating(null)
    setCreateName('')
    await refreshFiles()
  }

  const menuItems = entry.isDirectory ? [
    { label: '新建笔记', onClick: () => { setCreating('file'); setExpanded(true) } },
    { label: '新建文件夹', onClick: () => { setCreating('folder'); setExpanded(true) } },
    { label: '重命名', onClick: () => { setNewName(entry.name); setRenaming(true) } },
    { label: '删除', danger: true, onClick: () => setDeleteConfirm(true) },
  ] : [
    { label: isFavorite ? '取消收藏' : '收藏', onClick: () => toggleFavorite(entry.path) },
    { label: '重命名', onClick: () => { setNewName(entry.name.replace(/\.md$/, '')); setRenaming(true) } },
    { label: '删除', danger: true, onClick: () => setDeleteConfirm(true) },
  ]

  const [hovered, setHovered] = useState(false)

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
      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onContextMenu={handleContextMenu}
          style={{
            display: 'flex', alignItems: 'center', borderRadius: 6,
            background: dragOver ? 'var(--accent-muted)' : 'transparent',
            outline: dragOver ? '1px dashed var(--accent)' : 'none',
            transition: 'background 100ms',
          }}
        >
          <button
            draggable
            data-file-path={entry.path}
            onDragStart={handleDragStart}
            onClick={() => setExpanded(!expanded)}
            style={{
              flex: 1, height: 30, paddingLeft, paddingRight: 4,
              display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6,
              border: 'none', cursor: 'pointer',
              fontSize: 13, color: 'var(--text-secondary)', textAlign: 'left',
              background: 'transparent', minWidth: 0,
            }}
          >
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 100ms', color: 'var(--text-tertiary)', flexShrink: 0 }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-tertiary)', opacity: 0.7 }}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
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
        {expanded && creating && (
          <div style={{ paddingLeft: (depth + 1) * 14 + 8 + 16, paddingRight: 8, paddingTop: 2, paddingBottom: 2 }}>
            <input
              autoFocus
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreating(null); setCreateName('') }
              }}
              onBlur={() => { setCreating(null); setCreateName('') }}
              placeholder={creating === 'folder' ? '文件夹名' : '文件名'}
              style={{
                width: '100%', height: 26, padding: '0 8px', fontSize: 12,
                background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
                borderRadius: 4, color: 'var(--text-primary)', outline: 'none'
              }}
            />
          </div>
        )}
        {expanded && entry.children && <FileTree entries={entry.children} depth={depth + 1} defaultExpanded={defaultExpanded} />}
        {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={menuItems} onClose={() => setContextMenu(null)} />}
      </div>
    )
  }

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={handleContextMenu}
        style={{
          display: 'flex', alignItems: 'center', borderRadius: 6,
          background: isActive ? 'var(--accent-muted)' : 'transparent',
        }}
      >
        <button
          draggable
          data-file-path={entry.path}
          onDragStart={handleDragStart}
          onClick={() => openFile(entry.path)}
          style={{
            flex: 1, height: 30, paddingLeft: paddingLeft + 16, paddingRight: 4,
            display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6,
            border: 'none', background: 'transparent',
            cursor: 'pointer', fontSize: 13,
            color: isActive ? 'var(--accent-text)' : 'var(--text-secondary)',
            textAlign: 'left', minWidth: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: isActive ? 'var(--accent-text)' : 'var(--text-tertiary)', opacity: 0.7 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name.replace(/\.md$/, '')}</span>
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
