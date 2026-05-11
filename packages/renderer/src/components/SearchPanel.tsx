import { useState, useEffect, useRef } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'

interface SearchResult {
  filePath: string
  title: string
  line: string
  lineNumber: number
  score?: number
}

type SearchMode = 'keyword' | 'semantic'

interface SearchPanelProps {
  open: boolean
  onClose: () => void
}

const HISTORY_KEY = 'nexusky-search-history'

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}

function saveToHistory(query: string): void {
  const history = loadHistory()
  const updated = [query, ...history.filter((h) => h !== query)].slice(0, 12)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
}

export function SearchPanel({ open, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('keyword')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setHistory(loadHistory())
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const handleSearch = async () => {
    if (!query.trim() || !vaultPath) return
    setSearching(true)
    setResults([])
    saveToHistory(query.trim())

    if (mode === 'keyword') {
      const res = await window.api.invoke('db:fulltext-search', { vaultPath, query: query.trim() })
      setResults(res)
    } else {
      const res = await window.api.invoke('db:semantic-search', { vaultPath, query: query.trim() })
      setResults(res.map((r) => ({
        filePath: r.filePath,
        title: r.title,
        line: r.chunk.slice(0, 150),
        lineNumber: 0,
        score: r.score
      })))
    }
    setSearching(false)
  }
  const handleBuildIndex = async () => {
    if (!vaultPath) return
    setIndexing(true)
    await window.api.invoke('db:embed-vault', { vaultPath })
    setIndexing(false)
  }

  const handleResultClick = (r: SearchResult) => {
    const fullPath = r.filePath.startsWith('/') ? r.filePath : `${vaultPath}/${r.filePath}`
    openFile(fullPath)
    if (r.lineNumber > 0) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('editor-goto-line', { detail: { line: r.lineNumber } }))
      }, 200)
    }
    onClose()
  }

  const handleHistoryClick = (h: string) => {
    setQuery(h)
    setTimeout(() => handleSearch(), 0)
  }

  if (!open) return null

  return (
    <div
      className="animate-overlay-in"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh', background: 'rgba(0, 0, 0, 0.4)' }}
      onClick={onClose}
    >
      <div
        className="animate-scale-in"
        style={{ width: 560, maxHeight: '55vh', background: 'var(--bg-elevated)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}
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
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
              if (e.key === 'Escape') onClose()
            }}
            placeholder={mode === 'keyword' ? '关键词搜索...' : '语义搜索（用自然语言描述）...'}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: 'var(--text-primary)' }}
          />
          {query && (
            <button
              onClick={handleSearch}
              style={{ padding: '4px 10px', fontSize: 12, background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
            >
              搜索
            </button>
          )}
          <kbd style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '2px 6px', borderRadius: 4, background: 'var(--bg-hover)' }}>ESC</kbd>
        </div>

        {/* Mode toggle */}
        <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setMode('keyword')}
            style={{
              padding: '4px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer', fontWeight: 500,
              background: mode === 'keyword' ? 'var(--accent-muted)' : 'transparent',
              color: mode === 'keyword' ? 'var(--accent-text)' : 'var(--text-tertiary)',
              border: mode === 'keyword' ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
            }}
          >
            关键词
          </button>
          <button
            onClick={() => setMode('semantic')}
            style={{
              padding: '4px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer', fontWeight: 500,
              background: mode === 'semantic' ? 'var(--accent-muted)' : 'transparent',
              color: mode === 'semantic' ? 'var(--accent-text)' : 'var(--text-tertiary)',
              border: mode === 'semantic' ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
            }}
          >
            语义
          </button>
          {mode === 'semantic' && (
            <button
              onClick={handleBuildIndex}
              disabled={indexing}
              style={{
                marginLeft: 'auto', padding: '4px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
                background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)',
              }}
            >
              {indexing ? '索引中...' : '建立向量索引'}
            </button>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-subtle)' }} />

        {/* Results / History */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
          {searching && (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>搜索中...</div>
          )}
          {!searching && results.length === 0 && query && (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>无结果</div>
          )}
          {!searching && results.length === 0 && !query && history.length > 0 && (
            <div style={{ padding: '8px 10px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, padding: '0 4px' }}>搜索历史</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => handleHistoryClick(h)}
                    style={{ padding: '4px 10px', fontSize: 11, borderRadius: 5, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!searching && results.length === 0 && !query && history.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
              {mode === 'keyword' ? '输入关键词后按 Enter 搜索' : '用自然语言描述你要找的内容'}
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleResultClick(r)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                background: 'transparent', border: 'none', cursor: 'pointer', display: 'block',
                transition: 'background 80ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{r.title}</span>
                {r.score !== undefined && (
                  <span style={{ fontSize: 10, color: 'var(--accent-text)', background: 'var(--accent-muted)', padding: '1px 5px', borderRadius: 3 }}>
                    {(r.score * 100).toFixed(0)}%
                  </span>
                )}
                {r.lineNumber > 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>行 {r.lineNumber}</span>}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                {r.line}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
