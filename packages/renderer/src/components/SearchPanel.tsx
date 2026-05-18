import { useState, useEffect, useRef } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'
import type { EmbeddingStatus } from '@shared/types/ipc'

interface SearchResult {
  filePath: string
  title: string
  line: string
  lineNumber: number
  score?: number
}

type SearchMode = 'keyword' | 'semantic' | 'regex'

interface SearchPanelProps {
  open: boolean
  onClose: () => void
}

const HISTORY_KEY = 'nexusky-search-history'
const CACHE_KEY = 'nexusky-search-cache'

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}

function saveToHistory(query: string): void {
  const history = loadHistory()
  const updated = [query, ...history.filter((h) => h !== query)].slice(0, 12)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
}

function loadCache(): Record<string, SearchResult[]> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}

function saveCache(key: string, results: SearchResult[]): void {
  const cache = loadCache()
  cache[key] = results
  const keys = Object.keys(cache)
  if (keys.length > 20) delete cache[keys[0]]
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}

function getCacheKey(vaultPath: string, mode: SearchMode, query: string): string {
  return `${vaultPath}:${mode}:${query.trim()}`
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: 'var(--accent-muted)', color: 'var(--accent-text)', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
      : part
  )
}

export function SearchPanel({ open, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('keyword')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [searching, setSearching] = useState(false)
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipAutoSearchRef = useRef(false)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setHistory(loadHistory())
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!vaultPath) return
    let disposed = false
    const refreshStatus = () => {
      window.api.invoke('db:embedding-status', { vaultPath })
        .then((status) => { if (!disposed) setEmbeddingStatus(status) })
        .catch(() => {})
    }

    refreshStatus()
    const pollTimer = setInterval(refreshStatus, 1500)
    const cleanupProgress = (window.api as any).onEmbedProgress?.((status: EmbeddingStatus) => {
      setEmbeddingStatus(status)
    })

    return () => {
      disposed = true
      clearInterval(pollTimer)
      cleanupProgress?.()
    }
  }, [vaultPath])

  useEffect(() => {
    if (!open || mode === 'semantic' || !query.trim() || !vaultPath) return
    if (skipAutoSearchRef.current) {
      skipAutoSearchRef.current = false
      return
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true)
      setSelectedIndex(0)
      try {
        if (mode === 'regex') {
          const res = await window.api.invoke('db:fulltext-search', { vaultPath, query: query.trim(), regex: true } as any)
          setResults(res)
        } else {
          const res = await window.api.invoke('db:fulltext-search', { vaultPath, query: query.trim() })
          setResults(res)
        }
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [query, mode, vaultPath, open])

  const handleSearch = async (nextQuery = query) => {
    const normalizedQuery = nextQuery.trim()
    if (!normalizedQuery || !vaultPath) return
    const cacheKey = getCacheKey(vaultPath, mode, normalizedQuery)
    const cached = loadCache()[cacheKey]
    if (cached) {
      setResults(cached)
      setSelectedIndex(0)
      saveToHistory(normalizedQuery)
      return
    }

    setSearching(true)
    setResults([])
    setSelectedIndex(0)
    saveToHistory(normalizedQuery)

    try {
      let res: SearchResult[]
      if (mode === 'keyword') {
        res = await window.api.invoke('db:fulltext-search', { vaultPath, query: normalizedQuery })
      } else if (mode === 'regex') {
        res = await window.api.invoke('db:fulltext-search', { vaultPath, query: normalizedQuery, regex: true } as any)
      } else {
        const raw = await window.api.invoke('db:semantic-search', { vaultPath, query: normalizedQuery })
        res = raw.map((r: { filePath: string; title: string; chunk: string; score: number }) => ({
          filePath: r.filePath,
          title: r.title,
          line: r.chunk.slice(0, 150),
          lineNumber: 0,
          score: r.score
        }))
      }
      setResults(res)
      saveCache(cacheKey, res)
    } finally {
      setSearching(false)
    }
  }
  const handleBuildIndex = async () => {
    if (!vaultPath) return
    const total = embeddingStatus?.total || 0
    setEmbeddingStatus({
      state: 'indexing',
      current: 0,
      total,
      embedded: embeddingStatus?.embedded || 0,
      message: '准备建立向量索引',
      updatedAt: Date.now()
    })
    try {
      await window.api.invoke('db:embed-vault', { vaultPath })
      const status = await window.api.invoke('db:embedding-status', { vaultPath })
      setEmbeddingStatus(status)
    } catch (e: any) {
      setEmbeddingStatus((prev) => ({
        state: 'error',
        current: prev?.current || 0,
        total: prev?.total || 0,
        embedded: prev?.embedded || 0,
        message: e?.message || '向量索引失败',
        updatedAt: Date.now()
      }))
    }
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
    skipAutoSearchRef.current = true
    setQuery(h)
    void handleSearch(h)
  }

  if (!open) return null

  const embeddingPercent = embeddingStatus && embeddingStatus.total > 0
    ? Math.round((Math.min(embeddingStatus.current, embeddingStatus.total) / embeddingStatus.total) * 100)
    : 0
  const hasCompleteEmbedding = Boolean(embeddingStatus && embeddingStatus.total > 0 && embeddingStatus.embedded >= embeddingStatus.total)
  const isEmbedding = embeddingStatus?.state === 'indexing'

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
              if (e.key === 'Enter') {
                if (selectedIndex >= 0 && results[selectedIndex]) {
                  handleResultClick(results[selectedIndex])
                } else {
                  handleSearch()
                }
              }
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown' && results.length > 0) {
                e.preventDefault()
                setSelectedIndex((i) => {
                  const next = Math.min(i + 1, results.length - 1)
                  const item = resultsRef.current?.children[next] as HTMLElement
                  if (item) item.scrollIntoView({ block: 'nearest' })
                  return next
                })
              }
              if (e.key === 'ArrowUp' && results.length > 0) {
                e.preventDefault()
                setSelectedIndex((i) => {
                  const next = Math.max(i - 1, 0)
                  const item = resultsRef.current?.children[next] as HTMLElement
                  if (item) item.scrollIntoView({ block: 'nearest' })
                  return next
                })
              }
            }}
            placeholder={mode === 'keyword' ? '关键词搜索...' : '语义搜索（用自然语言描述）...'}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: 'var(--text-primary)' }}
          />
          {query && (
            <button
              onClick={() => handleSearch()}
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
          <button
            onClick={() => setMode('regex')}
            style={{
              padding: '4px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer', fontWeight: 500,
              background: mode === 'regex' ? 'var(--accent-muted)' : 'transparent',
              color: mode === 'regex' ? 'var(--accent-text)' : 'var(--text-tertiary)',
              border: mode === 'regex' ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
            }}
          >
            正则
          </button>
          {mode === 'semantic' && (
            <button
              onClick={handleBuildIndex}
              disabled={isEmbedding}
              style={{
                marginLeft: 'auto', padding: '4px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
                background: hasCompleteEmbedding ? 'var(--accent-muted)' : 'transparent',
                color: hasCompleteEmbedding ? 'var(--accent-text)' : 'var(--text-tertiary)',
                border: hasCompleteEmbedding ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
              }}
            >
              {isEmbedding ? '索引中...' : hasCompleteEmbedding ? '更新索引' : '建立向量索引'}
            </button>
          )}
        </div>

        {mode === 'semantic' && embeddingStatus && (embeddingStatus.state === 'indexing' || embeddingStatus.state === 'error' || !hasCompleteEmbedding) && (
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: embeddingStatus.state === 'error' ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                {embeddingStatus.state === 'indexing'
                  ? `正在建立向量索引 ${embeddingStatus.current}/${embeddingStatus.total}`
                  : embeddingStatus.state === 'error'
                    ? embeddingStatus.message || '向量索引失败'
                    : embeddingStatus.total > 0
                      ? `已索引 ${embeddingStatus.embedded}/${embeddingStatus.total} 篇`
                      : '当前知识库还没有可索引的笔记'}
              </span>
              {embeddingStatus.total > 0 && embeddingStatus.state === 'indexing' && (
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{embeddingPercent}%</span>
              )}
            </div>
            {embeddingStatus.state === 'indexing' && (
              <div style={{ height: 4, overflow: 'hidden', borderRadius: 999, background: 'var(--bg-hover)' }}>
                <div
                  style={{
                    width: `${embeddingPercent}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: embeddingStatus.state === 'error' ? 'var(--danger)' : 'var(--accent)',
                    transition: 'width 180ms ease'
                  }}
                />
              </div>
            )}
            {embeddingStatus.message && embeddingStatus.state !== 'error' && embeddingStatus.state === 'indexing' && (
              <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-tertiary)' }}>{embeddingStatus.message}</div>
            )}
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-subtle)' }} />

        {/* Results / History */}
        <div ref={resultsRef} style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
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
                background: i === selectedIndex ? 'var(--accent-muted)' : 'transparent',
                border: 'none', cursor: 'pointer', display: 'block',
                transition: 'background 80ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-muted)'; setSelectedIndex(i) }}
              onMouseLeave={(e) => { if (i !== selectedIndex) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{r.title}</span>
                {r.lineNumber > 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>行 {r.lineNumber}</span>}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                {mode === 'keyword' ? highlightText(r.line, query) : r.line}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
