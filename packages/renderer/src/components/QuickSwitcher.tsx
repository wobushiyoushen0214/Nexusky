import { useState, useEffect, useRef } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'
import type { NoteSearchResult } from '@shared/types/ipc'

interface QuickSwitcherProps {
  open: boolean
  onClose: () => void
}

export function QuickSwitcher({ open, onClose }: QuickSwitcherProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NoteSearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!vaultPath || !open) return
    if (!query.trim()) {
      window.api.invoke('db:get-all-notes', { vaultPath }).then(setResults)
      return
    }
    window.api.invoke('db:search-notes', { vaultPath, query: query.trim() }).then(setResults)
  }, [query, vaultPath, open])

  const handleSelect = (result: NoteSearchResult) => {
    if (!vaultPath) return
    const fullPath = `${vaultPath}/${result.filePath}`
    openFile(fullPath)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] animate-overlay-in" style={{ background: 'rgba(10, 12, 20, 0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } as React.CSSProperties} onClick={onClose}>
      <div
        className="animate-scale-in"
        style={{ width: 480, background: 'var(--bg-glass-solid)', backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)', borderRadius: 14, border: '1px solid var(--border-glow)', overflow: 'hidden', boxShadow: 'var(--shadow-lg), var(--shadow-glow)' } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-[var(--border-subtle)]">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="搜索笔记..."
            className="w-full bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-[var(--text-tertiary)]">
              {query ? '没有找到匹配的笔记' : '暂无笔记'}
            </div>
          ) : (
            results.map((result, i) => (
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${
                  i === selectedIndex ? 'bg-[var(--accent-muted)]' : 'hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span className={`text-[13px] truncate ${i === selectedIndex ? 'text-[var(--accent-text)]' : 'text-[var(--text-primary)]'}`}>
                  {result.title}
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)] truncate ml-auto shrink-0">
                  {result.filePath}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
