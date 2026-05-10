import { useState } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import type { FileEntry } from '@shared/types/ipc'

interface FileTreeProps {
  entries: FileEntry[]
  depth?: number
}

export function FileTree({ entries, depth = 0 }: FileTreeProps) {
  return (
    <ul className="space-y-0.5">
      {entries.map((entry) => (
        <FileTreeItem key={entry.path} entry={entry} depth={depth} />
      ))}
    </ul>
  )
}

function FileTreeItem({ entry, depth }: { entry: FileEntry; depth: number }) {
  const [expanded, setExpanded] = useState(depth === 0)
  const openFile = useEditorStore((s) => s.openFile)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const isActive = currentFilePath === entry.path

  if (entry.isDirectory) {
    return (
      <li>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left px-2 py-1 rounded text-sm hover:bg-[var(--accent)] transition-colors flex items-center gap-1"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className="text-xs">{expanded ? '▼' : '▶'}</span>
          <span className="truncate">{entry.name}</span>
        </button>
        {expanded && entry.children && (
          <FileTree entries={entry.children} depth={depth + 1} />
        )}
      </li>
    )
  }

  return (
    <li>
      <button
        onClick={() => openFile(entry.path)}
        className={`w-full text-left px-2 py-1 rounded text-sm transition-colors truncate ${
          isActive
            ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
            : 'hover:bg-[var(--accent)]'
        }`}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
      >
        {entry.name.replace(/\.md$/, '')}
      </button>
    </li>
  )
}
