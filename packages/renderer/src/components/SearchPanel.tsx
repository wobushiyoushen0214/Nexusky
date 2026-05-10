import { useState, useEffect, useRef } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'

interface SearchResult {
  filePath: string
  title: string
  line: string
  lineNumber: number
}

interface SearchPanelProps {
  open: boolean
  onClose: () => void
}

export function SearchPanel({ open, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const handleSearch = async () => {
    if (!query.trim() || !vaultPath) return
    setSearching(true)
    const res = await window.api.invoke('db:fulltext-search', { vaultPath, query: query.trim() })
    setResults(res)
    setSearching(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] animate-overlay-in" style={{ background: 'rgba(10, 12, 20, 0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } as React.CSSProperties} onClick={onClose}>
      <div
        className="animate-scale-in"
        style={{ width: 560, maxHeight: '60vh', background: 'var(--bg-glass-solid)', backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)', border: '1px solid var(--border-glow)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg), var(--shadow-glow)' } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 12, borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
              if (e.key === 'Escape') onClose()
            }}
            placeholder="搜索笔记内容..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text-primary)' }}
          />
          <button
            onClick={handleSearch}
            style={{ padding: '4px 12px', fontSize: 12, background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            搜索
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
          {searching && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>搜索中...</div>
          )}
          {!searching && results.length === 0 && query && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>无结果</div>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => { openFile(`${vaultPath}/${r.filePath}`); onClose() }}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6,
                background: 'transparent', border: 'none', cursor: 'pointer', display: 'block'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{r.title}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>:{r.lineNumber}</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.line}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
