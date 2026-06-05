import { useState, useEffect, useRef } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'
import { getErrorMessage } from '../utils/errors'
import { safeGetJSON, safeSetJSON } from '../utils/storage'
import type { SearchIndexStatus } from '@shared/types/ipc'

interface SearchResult {
  filePath: string
  title: string
  line: string
  lineNumber: number
  score?: number
}

type SearchMode = 'keyword' | 'related' | 'regex'

interface SearchPanelProps {
  open: boolean
  onClose: () => void
}

const HISTORY_KEY = 'nexusky-search-history'
const CACHE_KEY = 'nexusky-search-cache'

function loadHistory(): string[] {
  return safeGetJSON<string[]>(HISTORY_KEY, [])
}

function saveToHistory(query: string): void {
  const history = loadHistory()
  const updated = [query, ...history.filter((h) => h !== query)].slice(0, 12)
  safeSetJSON(HISTORY_KEY, updated)
}

function loadCache(): Record<string, SearchResult[]> {
  return safeGetJSON<Record<string, SearchResult[]>>(CACHE_KEY, {})
}

function saveCache(key: string, results: SearchResult[]): void {
  const cache = loadCache()
  cache[key] = results
  const keys = Object.keys(cache)
  if (keys.length > 20) delete cache[keys[0]]
  safeSetJSON(CACHE_KEY, cache)
}

function clearCacheForVault(vaultPath: string): void {
  const cache = loadCache()
  const prefix = `${vaultPath}:`
  let changed = false
  for (const key of Object.keys(cache)) {
    if (key.startsWith(prefix)) {
      delete cache[key]
      changed = true
    }
  }
  if (changed) safeSetJSON(CACHE_KEY, cache)
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
  const [searchIndexStatus, setSearchIndexStatus] = useState<SearchIndexStatus | null>(null)
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
      window.api.invoke('db:search-index-status', { vaultPath })
        .then((status) => { if (!disposed) setSearchIndexStatus(status) })
        .catch(() => {})
    }

    refreshStatus()
    const pollTimer = setInterval(refreshStatus, 1500)
    const cleanupProgress = window.api.onSearchIndexProgress((status: SearchIndexStatus) => {
      setSearchIndexStatus(status)
      if (status.state === 'done') clearCacheForVault(vaultPath)
    })

    return () => {
      disposed = true
      clearInterval(pollTimer)
      cleanupProgress?.()
    }
  }, [vaultPath])

  useEffect(() => {
    if (!vaultPath) return
    const cleanup = window.api.onVaultChanged(() => {
      clearCacheForVault(vaultPath)
      setResults([])
      setSelectedIndex(0)
    })
    return cleanup
  }, [vaultPath])

  useEffect(() => {
    if (!open || mode === 'related' || !query.trim() || !vaultPath) return
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
          const res = await window.api.invoke('db:fulltext-search', { vaultPath, query: query.trim(), regex: true })
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
        res = await window.api.invoke('db:fulltext-search', { vaultPath, query: normalizedQuery, regex: true })
      } else {
        const raw = await window.api.invoke('db:lexical-search', { vaultPath, query: normalizedQuery })
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
    const total = searchIndexStatus?.total || 0
    setSearchIndexStatus({
      state: 'indexing',
      current: 0,
      total,
      indexed: searchIndexStatus?.indexed || 0,
      message: '准备建立本地检索索引',
      updatedAt: Date.now()
    })
    try {
      await window.api.invoke('db:build-search-index', { vaultPath })
      const status = await window.api.invoke('db:search-index-status', { vaultPath })
      setSearchIndexStatus(status)
    } catch (e: unknown) {
      setSearchIndexStatus((prev) => ({
        state: 'error',
        current: prev?.current || 0,
        total: prev?.total || 0,
        indexed: prev?.indexed || 0,
        message: getErrorMessage(e, '本地检索索引失败'),
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

  const searchIndexPercent = searchIndexStatus && searchIndexStatus.total > 0
    ? Math.round((Math.min(searchIndexStatus.current, searchIndexStatus.total) / searchIndexStatus.total) * 100)
    : 0
  const hasCompleteSearchIndex = Boolean(searchIndexStatus && searchIndexStatus.total > 0 && searchIndexStatus.indexed >= searchIndexStatus.total)
  const isIndexing = searchIndexStatus?.state === 'indexing'
  const searchPlaceholder = mode === 'keyword'
    ? '关键词搜索...'
    : mode === 'regex'
      ? '正则搜索...'
      : '相关内容搜索（按词语重合排序）...'

  return (
    <div
      className="animate-overlay-in glass-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh', background: 'var(--overlay-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(150%)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(150%)' } as React.CSSProperties}
      onClick={onClose}
    >
      <div
        className="animate-scale-in glass-popover"
        style={{ width: 560, maxHeight: '58vh', background: 'var(--bg-glass-dense, var(--bg-glass-solid))', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-popover)', backdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)', WebkitBackdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)' }}
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
            placeholder={searchPlaceholder}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: 'var(--text-primary)' }}
          />
          {query && (
            <button
              onClick={() => handleSearch()}
              style={{ height: 28, padding: '0 11px', fontSize: 12, background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600, boxShadow: '0 8px 18px var(--accent-glow)' }}
            >
              搜索
            </button>
          )}
          <kbd style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '2px 6px', borderRadius: 5, background: 'var(--control-bg)', border: '1px solid var(--control-border)', boxShadow: 'inset 0 1px 0 var(--glass-highlight)' }}>ESC</kbd>
        </div>

        {/* Mode toggle */}
        <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setMode('keyword')}
            style={{
              height: 26, padding: '0 10px', fontSize: 11, borderRadius: 7, cursor: 'pointer', fontWeight: 500,
              background: mode === 'keyword' ? 'var(--accent-muted)' : 'var(--control-bg)',
              color: mode === 'keyword' ? 'var(--accent-text)' : 'var(--text-tertiary)',
              border: mode === 'keyword' ? '1px solid color-mix(in srgb, var(--accent) 35%, var(--border-subtle))' : '1px solid var(--border-subtle)',
            }}
          >
            关键词
          </button>
          <button
            onClick={() => setMode('related')}
            style={{
              height: 26, padding: '0 10px', fontSize: 11, borderRadius: 7, cursor: 'pointer', fontWeight: 500,
              background: mode === 'related' ? 'var(--accent-muted)' : 'var(--control-bg)',
              color: mode === 'related' ? 'var(--accent-text)' : 'var(--text-tertiary)',
              border: mode === 'related' ? '1px solid color-mix(in srgb, var(--accent) 35%, var(--border-subtle))' : '1px solid var(--border-subtle)',
            }}
          >
            相关
          </button>
          <button
            onClick={() => setMode('regex')}
            style={{
              height: 26, padding: '0 10px', fontSize: 11, borderRadius: 7, cursor: 'pointer', fontWeight: 500,
              background: mode === 'regex' ? 'var(--accent-muted)' : 'var(--control-bg)',
              color: mode === 'regex' ? 'var(--accent-text)' : 'var(--text-tertiary)',
              border: mode === 'regex' ? '1px solid color-mix(in srgb, var(--accent) 35%, var(--border-subtle))' : '1px solid var(--border-subtle)',
            }}
          >
            正则
          </button>
          {mode === 'related' && (
            <button
              onClick={handleBuildIndex}
              disabled={isIndexing}
              style={{
                marginLeft: 'auto', height: 26, padding: '0 10px', fontSize: 11, borderRadius: 7, cursor: 'pointer',
                background: hasCompleteSearchIndex ? 'var(--accent-muted)' : 'var(--control-bg)',
                color: hasCompleteSearchIndex ? 'var(--accent-text)' : 'var(--text-tertiary)',
                border: hasCompleteSearchIndex ? '1px solid color-mix(in srgb, var(--accent) 35%, var(--border-subtle))' : '1px solid var(--border-subtle)',
              }}
            >
              {isIndexing ? '索引中...' : hasCompleteSearchIndex ? '更新索引' : '建立本地索引'}
            </button>
          )}
        </div>

        {mode === 'related' && searchIndexStatus && (searchIndexStatus.state === 'indexing' || searchIndexStatus.state === 'error' || !hasCompleteSearchIndex) && (
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: searchIndexStatus.state === 'error' ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                {searchIndexStatus.state === 'indexing'
                  ? `正在建立本地检索索引 ${searchIndexStatus.current}/${searchIndexStatus.total}`
                  : searchIndexStatus.state === 'error'
                    ? searchIndexStatus.message || '本地检索索引失败'
                    : searchIndexStatus.total > 0
                      ? `已索引 ${searchIndexStatus.indexed}/${searchIndexStatus.total} 篇`
                      : '当前 vault 还没有可索引的 Markdown 笔记'}
              </span>
              {searchIndexStatus.total > 0 && searchIndexStatus.state === 'indexing' && (
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{searchIndexPercent}%</span>
              )}
            </div>
            {searchIndexStatus.state === 'indexing' && (
              <div style={{ height: 4, overflow: 'hidden', borderRadius: 999, background: 'var(--bg-hover)' }}>
                <div
                  style={{
                    width: `${searchIndexPercent}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: 'var(--accent)',
                    transition: 'width 180ms ease'
                  }}
                />
              </div>
            )}
            {searchIndexStatus.message && searchIndexStatus.state !== 'error' && searchIndexStatus.state === 'indexing' && (
              <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-tertiary)' }}>{searchIndexStatus.message}</div>
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
                    style={{ height: 26, padding: '0 10px', fontSize: 11, borderRadius: 7, background: 'var(--control-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!searching && results.length === 0 && !query && history.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
              {mode === 'keyword'
                ? '输入关键词后按 Enter 搜索'
                : mode === 'regex'
                  ? '输入正则表达式后按 Enter 搜索'
                  : '输入词语或短句查找相关内容'}
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
