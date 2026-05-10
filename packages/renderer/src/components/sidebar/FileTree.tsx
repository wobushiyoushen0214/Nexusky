import { useState } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import type { FileEntry } from '@shared/types/ipc'

interface FileTreeProps {
  entries: FileEntry[]
  depth?: number
}

export function FileTree({ entries, depth = 0 }: FileTreeProps) {
  if (entries.length === 0) {
    return depth === 0 ? (
      <div className="px-2 py-8 text-center">
        <p className="text-[11px] text-[var(--text-tertiary)]">空笔记库</p>
      </div>
    ) : null
  }

  return (
    <div className="space-y-px">
      {entries.map((entry) => (
        <FileTreeItem key={entry.path} entry={entry} depth={depth} />
      ))}
    </div>
  )
}

function FileTreeItem({ entry, depth }: { entry: FileEntry; depth: number }) {
  const [expanded, setExpanded] = useState(depth === 0)
  const openFile = useEditorStore((s) => s.openFile)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const isActive = currentFilePath === entry.path

  const paddingLeft = depth * 12 + 8

  if (entry.isDirectory) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full h-7 text-left rounded-md text-[12px] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-1.5 text-[var(--text-secondary)] group"
          style={{ paddingLeft }}
        >
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-100 text-[var(--text-tertiary)] ${expanded ? 'rotate-90' : ''}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="truncate">{entry.name}</span>
        </button>
        {expanded && entry.children && (
          <FileTree entries={entry.children} depth={depth + 1} />
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => openFile(entry.path)}
      className={`w-full h-7 text-left rounded-md text-[12px] transition-colors flex items-center gap-1.5 truncate ${
        isActive
          ? 'bg-[var(--accent-muted)] text-[var(--accent-text)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
      style={{ paddingLeft: paddingLeft + 14 }}
    >
      <span className="truncate">{entry.name.replace(/\.md$/, '')}</span>
    </button>
  )
}
