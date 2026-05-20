import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../stores/editor-store'
import { toast } from '../../stores/toast-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { updateMarkdownProperty } from '../../utils/frontmatter'
import type { PropertyTableRow } from '@shared/types/ipc'

type ReaderSource = 'all' | 'notion' | 'readwise' | 'pocket'

function propertyText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(' ')
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

export function getReaderSource(row: PropertyTableRow): ReaderSource | null {
  const source = propertyText(row.properties.source).toLowerCase()
  if (source === 'notion' || source === 'readwise' || source === 'pocket') return source
  const path = row.filePath.replace(/\\/g, '/').toLowerCase()
  if (path.startsWith('imports/notion/')) return 'notion'
  if (path.startsWith('imports/readwise/')) return 'readwise'
  if (path.startsWith('imports/pocket/')) return 'pocket'
  return null
}

export function isUnreadReaderRow(row: PropertyTableRow): boolean {
  const status = propertyText(row.properties.status).toLowerCase()
  return status === '' || ['unread', 'new', 'todo', 'to-read'].includes(status)
}

export function getReaderSourceUrl(row: PropertyTableRow): string {
  const url = propertyText(row.properties.url).trim()
  return /^https?:\/\//i.test(url) ? url : ''
}

export function filterReaderRows(rows: PropertyTableRow[], source: ReaderSource, query: string, unreadOnly: boolean): PropertyTableRow[] {
  const q = query.trim().toLowerCase()
  return rows
    .filter((row) => {
      const rowSource = getReaderSource(row)
      if (!rowSource) return false
      if (source !== 'all' && rowSource !== source) return false
      if (unreadOnly && !isUnreadReaderRow(row)) return false
      if (!q) return true
      const haystack = [
        row.title,
        row.filePath,
        propertyText(row.properties.author),
        propertyText(row.properties.url),
        propertyText(row.properties.tags),
        propertyText(row.properties.status)
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export function countUnreadReaderRows(rows: PropertyTableRow[]): number {
  return rows.filter((row) => getReaderSource(row) && isUnreadReaderRow(row)).length
}

export function appendReaderNote(content: string, note: string, now = new Date()): string {
  const clean = note.trim()
  if (!clean) return content
  const stamp = now.toISOString().slice(0, 10)
  const body = clean.split(/\r?\n/).map((line, index) => index === 0 ? line.trim() : `  ${line.trim()}`).join('\n')
  const entry = `- ${stamp}: ${body}`
  const section = /^## Notes\s*$/m.exec(content)
  if (!section) return `${content.trimEnd()}\n\n## Notes\n\n${entry}\n`

  const sectionEnd = section.index + section[0].length
  const afterSection = content.slice(sectionEnd)
  const nextHeading = /\n##\s+/.exec(afterSection)
  const insertAt = nextHeading ? sectionEnd + nextHeading.index : content.length
  const before = content.slice(0, insertAt).trimEnd()
  const after = content.slice(insertAt).replace(/^\n+/, '')
  return `${before}\n\n${entry}${after ? `\n\n${after}` : '\n'}`
}

function sourceLabel(source: ReaderSource | null): string {
  if (source === 'notion') return 'Notion'
  if (source === 'readwise') return 'Readwise'
  if (source === 'pocket') return 'Pocket'
  return 'Reader'
}

function sourceColor(source: ReaderSource | null): string {
  if (source === 'notion') return '#e6b17e'
  if (source === 'readwise') return '#74c69d'
  if (source === 'pocket') return '#ff6b6b'
  return 'var(--accent)'
}

function formatDate(value: number): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ReaderInboxView() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const setMainView = useUIStore((s) => s.setMainView)
  const [rows, setRows] = useState<PropertyTableRow[]>([])
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<ReaderSource>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState<ReaderSource | null>(null)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)

  const loadRows = async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const result = await window.api.invoke('db:get-property-rows', { vaultPath })
      setRows(result)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, [vaultPath])

  useEffect(() => {
    const cleanup = window.api.onVaultChanged(() => {
      void loadRows()
    })
    return () => { cleanup() }
  }, [vaultPath])

  const readerRows = useMemo(() => rows.filter((row) => getReaderSource(row)), [rows])
  const filtered = useMemo(() => filterReaderRows(rows, source, query, unreadOnly), [query, rows, source, unreadOnly])
  const counts = useMemo(() => {
    const next: Record<ReaderSource, number> = { all: readerRows.length, notion: 0, readwise: 0, pocket: 0 }
    for (const row of readerRows) {
      const rowSource = getReaderSource(row)
      if (rowSource) next[rowSource]++
    }
    return next
  }, [readerRows])
  const unreadCount = countUnreadReaderRows(readerRows)

  const openRow = async (row: PropertyTableRow) => {
    if (!vaultPath) return
    await openFile(`${vaultPath}/${row.filePath}`)
    setMainView('editor')
  }

  const importSource = async (target: Exclude<ReaderSource, 'all'>) => {
    if (!vaultPath) return
    setImporting(target)
    try {
      const channel = target === 'notion' ? 'file:import-notion' : target === 'readwise' ? 'file:import-readwise' : 'file:import-pocket'
      const result = await window.api.invoke(channel, { vaultPath })
      if (!result.canceled) {
        toast(t('reader.imported', { count: result.imported }), result.imported > 0 ? 'success' : 'info')
        await loadRows()
      }
    } catch {
      toast(t('reader.importFailed'), 'error')
    } finally {
      setImporting(null)
    }
  }

  const writeStatuses = async (targetRows: PropertyTableRow[], status: 'read' | 'unread') => {
    if (!vaultPath) return
    const changedIds: string[] = []
    try {
      for (const row of targetRows) {
        const path = `${vaultPath}/${row.filePath}`
        const content = await window.api.invoke('file:read', { path })
        const updated = updateMarkdownProperty(content, 'status', status)
        await window.api.invoke('file:write', { path, content: updated, vaultPath })
        await window.api.invoke('db:index-file', { vaultPath, filePath: path })
        changedIds.push(row.id)
      }
      const changed = new Set(changedIds)
      const updatedAt = Date.now()
      setRows((current) => current.map((item) => changed.has(item.id) ? { ...item, properties: { ...item.properties, status }, updatedAt } : item))
      toast(status === 'read' ? t('reader.markedReadCount', { count: changedIds.length }) : t('reader.markedUnread'), 'success')
    } catch {
      toast(t('reader.statusFailed'), 'error')
    }
  }

  const updateStatus = async (row: PropertyTableRow, status: 'read' | 'unread') => {
    await writeStatuses([row], status)
  }

  const markVisibleRead = async () => {
    const unreadRows = filtered.filter(isUnreadReaderRow)
    if (unreadRows.length === 0) return
    await writeStatuses(unreadRows, 'read')
  }

  const openSource = async (row: PropertyTableRow) => {
    const url = getReaderSourceUrl(row)
    if (!url) return
    try {
      await window.api.invoke('app:open-external', { url })
    } catch {
      toast(t('reader.openSourceFailed'), 'error')
    }
  }

  const saveReaderNote = async (row: PropertyTableRow) => {
    if (!vaultPath) return
    const note = (noteDrafts[row.id] || '').trim()
    if (!note) {
      setActiveNoteId(null)
      return
    }
    const path = `${vaultPath}/${row.filePath}`
    setSavingNoteId(row.id)
    try {
      const content = await window.api.invoke('file:read', { path })
      const updated = appendReaderNote(content, note)
      await window.api.invoke('file:write', { path, content: updated, vaultPath })
      await window.api.invoke('db:index-file', { vaultPath, filePath: path })
      const updatedAt = Date.now()
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, updatedAt } : item))
      setNoteDrafts((current) => {
        const next = { ...current }
        delete next[row.id]
        return next
      })
      setActiveNoteId(null)
      toast(t('reader.noteSaved'), 'success')
    } catch {
      toast(t('reader.noteFailed'), 'error')
    } finally {
      setSavingNoteId(null)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--editor-bg)', color: 'var(--text-primary)' }}>
      <div style={{ flexShrink: 0, padding: '22px 28px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, lineHeight: 1.2, fontWeight: 700 }}>{t('reader.title')}</h1>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
              {t('reader.summary', { count: readerRows.length, unread: unreadCount })}
            </div>
          </div>
          <button
            onClick={() => loadRows()}
            disabled={loading}
            style={{ height: 30, padding: '0 11px', border: '1px solid var(--border-subtle)', borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, cursor: loading ? 'default' : 'pointer' }}
          >
            {loading ? t('reader.loading') : t('reader.refresh')}
          </button>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('reader.searchPlaceholder')}
            style={{ width: 320, maxWidth: '100%', height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: 'none', fontSize: 12 }}
          />
          <div style={{ display: 'flex', padding: 2, borderRadius: 7, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            {(['all', 'notion', 'readwise', 'pocket'] as ReaderSource[]).map((item) => (
              <button
                key={item}
                onClick={() => setSource(item)}
                style={{ height: 26, padding: '0 10px', border: 'none', borderRadius: 5, background: source === item ? 'var(--accent-muted)' : 'transparent', color: source === item ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12 }}
              >
                {item === 'all' ? t('reader.allSources') : sourceLabel(item)} · {counts[item]}
              </button>
            ))}
          </div>
          <label style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            {t('reader.unreadOnly')}
          </label>
          <button
            onClick={() => void markVisibleRead()}
            disabled={!filtered.some(isUnreadReaderRow)}
            style={{ height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: filtered.some(isUnreadReaderRow) ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: 12, cursor: filtered.some(isUnreadReaderRow) ? 'pointer' : 'default', opacity: filtered.some(isUnreadReaderRow) ? 1 : 0.55 }}
          >
            {t('reader.markVisibleRead')}
          </button>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['notion', 'readwise', 'pocket'] as const).map((item) => (
              <button
                key={item}
                onClick={() => void importSource(item)}
                disabled={Boolean(importing)}
                style={{ height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, cursor: importing ? 'default' : 'pointer', opacity: importing && importing !== item ? 0.55 : 1 }}
              >
                {importing === item ? t('reader.importing') : t(`reader.import.${item}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px 36px' }}>
        {filtered.length === 0 ? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            {readerRows.length === 0 ? t('reader.emptyImports') : t('reader.emptyFilter')}
          </div>
        ) : (
          <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {filtered.map((row) => {
              const rowSource = getReaderSource(row)
              const color = sourceColor(rowSource)
              const tags = propertyText(row.properties.tags).split(/\s+/).filter(Boolean).slice(0, 3)
              const url = getReaderSourceUrl(row)
              const author = propertyText(row.properties.author)
              const status = propertyText(row.properties.status) || (isUnreadReaderRow(row) ? t('reader.unread') : '')
              const noteActive = activeNoteId === row.id
              return (
                <div
                  key={row.id}
                  onClick={() => openRow(row)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void openRow(row) }}
                  role="button"
                  tabIndex={0}
                  style={{ minHeight: 148, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10, border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', textAlign: 'left', padding: 14, cursor: 'pointer', outline: 'none' }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
                      {sourceLabel(rowSource)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatDate(row.updatedAt)}</span>
                  </span>
                  <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 38, fontSize: 14, lineHeight: 1.35, fontWeight: 700 }}>{row.title}</span>
                  <span style={{ minHeight: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {author || url || row.filePath}
                  </span>
                  <span style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                    {status && <span style={{ padding: '2px 6px', borderRadius: 999, background: 'var(--accent-muted)', color: 'var(--accent-text)', fontSize: 10 }}>{status}</span>}
                    {tags.map((tag) => (
                      <span key={tag} style={{ maxWidth: 86, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 6px', borderRadius: 999, background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', fontSize: 10 }}>{tag}</span>
                    ))}
                  </span>
                  {noteActive && (
                    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        autoFocus
                        value={noteDrafts[row.id] || ''}
                        onChange={(e) => setNoteDrafts((current) => ({ ...current, [row.id]: e.target.value }))}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder={t('reader.notePlaceholder')}
                        rows={3}
                        style={{ width: '100%', resize: 'vertical', minHeight: 62, padding: '8px 9px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.4, outline: 'none' }}
                      />
                      <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveNoteId(null) }}
                          disabled={savingNoteId === row.id}
                          style={{ height: 26, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 11, cursor: savingNoteId === row.id ? 'default' : 'pointer' }}
                        >
                          {t('reader.cancelNote')}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); void saveReaderNote(row) }}
                          disabled={savingNoteId === row.id}
                          style={{ height: 26, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--accent-muted)', color: 'var(--accent-text)', fontSize: 11, cursor: savingNoteId === row.id ? 'default' : 'pointer' }}
                        >
                          {savingNoteId === row.id ? t('reader.savingNote') : t('reader.saveNote')}
                        </button>
                      </span>
                    </div>
                  )}
                  <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setActiveNoteId(noteActive ? null : row.id) }}
                      style={{ height: 26, marginRight: 6, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: noteActive ? 'var(--accent-muted)' : 'var(--bg-elevated)', color: noteActive ? 'var(--accent-text)' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}
                    >
                      {t('reader.addNote')}
                    </button>
                    {url && (
                      <button
                        onClick={(e) => { e.stopPropagation(); void openSource(row) }}
                        style={{ height: 26, marginRight: 6, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}
                      >
                        {t('reader.openSource')}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); void updateStatus(row, isUnreadReaderRow(row) ? 'read' : 'unread') }}
                      style={{ height: 26, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}
                    >
                      {isUnreadReaderRow(row) ? t('reader.markRead') : t('reader.markUnread')}
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
