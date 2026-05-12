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
      window.api.invoke('db:get-recent-notes', { vaultPath, limit: 50 }).then((notes) => {
        const recent = useEditorStore.getState().recentFiles
        const sorted = [...notes].sort((a, b) => {
          const aIdx = recent.indexOf(`${vaultPath}/${a.filePath}`)
          const bIdx = recent.indexOf(`${vaultPath}/${b.filePath}`)
          if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx
          if (aIdx >= 0) return -1
          if (bIdx >= 0) return 1
          return 0
        })
        setResults(sorted)
      })
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

  const listRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => {
        const next = Math.min(i + 1, results.length - 1)
        scrollToItem(next)
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => {
        const next = Math.max(i - 1, 0)
        scrollToItem(next)
        return next
      })
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const scrollToItem = (index: number) => {
    const container = listRef.current
    if (!container) return
    const item = container.children[index] as HTMLElement
    if (item) item.scrollIntoView({ block: 'nearest' })
  }

  if (!open) return null

  return (
    <div
      className="animate-overlay-in"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '18vh', background: 'rgba(0, 0, 0, 0.4)' }}
      onClick={onClose}
    >
      <div
        className="animate-scale-in"
        style={{ width: 520, background: 'var(--bg-elevated)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="搜索笔记..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: 'var(--text-primary)' }}
          />
          <kbd style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '2px 6px', borderRadius: 4, background: 'var(--bg-hover)' }}>ESC</kbd>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-subtle)' }} />

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 340, overflowY: 'auto', padding: '6px' }}>
          {results.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
              {query ? '没有找到匹配的笔记' : '暂无笔记'}
            </div>
          ) : (
            results.map((result, i) => (
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  background: i === selectedIndex ? 'var(--accent-muted)' : 'transparent',
                  transition: 'background 80ms',
                }}
              >
                <span style={{ fontSize: 14, color: i === selectedIndex ? 'var(--accent-text)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {result.title}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'right' }}>
                  {result.filePath.replace(/[^\\/]+$/, '').replace(/[\\/]$/, '') || '/'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
