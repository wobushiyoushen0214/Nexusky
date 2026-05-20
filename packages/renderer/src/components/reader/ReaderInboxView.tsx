import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../stores/editor-store'
import { toast } from '../../stores/toast-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { updateMarkdownProperty } from '../../utils/frontmatter'
import { safeGetJSON, safeSet, safeSetJSON } from '../../utils/storage'
import type { PropertyTableRow } from '@shared/types/ipc'

type ReaderSource = 'all' | 'notion' | 'readwise' | 'pocket'
type ReaderSort = 'updated' | 'oldest' | 'title' | 'source'
type ReaderTriageStage = 'next' | 'connect' | 'later' | 'archived'
type ReaderTranslator = ReturnType<typeof useTranslation>['t']
interface ReaderViewSettings {
  source: ReaderSource
  sort: ReaderSort
  unreadOnly: boolean
  showArchived: boolean
}

const READER_VIEW_SETTINGS_KEY = 'nexusky-reader-view-settings'
const PENDING_CANVAS_FOCUS_KEY = 'nexusky-pending-canvas-focus'
const READER_SOURCES: ReaderSource[] = ['all', 'notion', 'readwise', 'pocket']
const READER_SORTS: ReaderSort[] = ['updated', 'oldest', 'title', 'source']
const READER_TRIAGE_STAGES: ReaderTriageStage[] = ['next', 'connect', 'later', 'archived']
const DEFAULT_READER_VIEW_SETTINGS: ReaderViewSettings = {
  source: 'all',
  sort: 'updated',
  unreadOnly: false,
  showArchived: false
}

function isReaderSource(value: unknown): value is ReaderSource {
  return typeof value === 'string' && READER_SOURCES.includes(value as ReaderSource)
}

function isReaderSort(value: unknown): value is ReaderSort {
  return typeof value === 'string' && READER_SORTS.includes(value as ReaderSort)
}

export function normalizeReaderViewSettings(value: unknown): ReaderViewSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_READER_VIEW_SETTINGS }
  const input = value as Partial<ReaderViewSettings>
  return {
    source: isReaderSource(input.source) ? input.source : DEFAULT_READER_VIEW_SETTINGS.source,
    sort: isReaderSort(input.sort) ? input.sort : DEFAULT_READER_VIEW_SETTINGS.sort,
    unreadOnly: typeof input.unreadOnly === 'boolean' ? input.unreadOnly : DEFAULT_READER_VIEW_SETTINGS.unreadOnly,
    showArchived: typeof input.showArchived === 'boolean' ? input.showArchived : DEFAULT_READER_VIEW_SETTINGS.showArchived
  }
}

function loadReaderViewSettings(): ReaderViewSettings {
  return normalizeReaderViewSettings(safeGetJSON<unknown>(READER_VIEW_SETTINGS_KEY, DEFAULT_READER_VIEW_SETTINGS))
}

function saveReaderViewSettings(settings: ReaderViewSettings): void {
  safeSetJSON(READER_VIEW_SETTINGS_KEY, settings)
}

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

export function isArchivedReaderRow(row: PropertyTableRow): boolean {
  return propertyText(row.properties.status).toLowerCase() === 'archived'
}

export function getReaderTriageStage(row: PropertyTableRow): ReaderTriageStage {
  const status = propertyText(row.properties.status).toLowerCase()
  if (status === 'archived') return 'archived'
  if (['unread', 'new', 'todo', 'to-read'].includes(status)) return 'next'
  if (['read', 'done', 'processed', 'connected'].includes(status)) return 'connect'
  if (['later', 'someday', 'parked'].includes(status)) return 'later'
  if (propertyText(row.properties.tags).trim()) return 'connect'
  if (getReaderSource(row) === 'readwise') return 'connect'
  if (!status) return 'next'
  return 'later'
}

export function countReaderRowsByTriage(rows: PropertyTableRow[]): Record<ReaderTriageStage, number> {
  const counts: Record<ReaderTriageStage, number> = { next: 0, connect: 0, later: 0, archived: 0 }
  for (const row of rows) {
    if (!getReaderSource(row)) continue
    counts[getReaderTriageStage(row)]++
  }
  return counts
}

export function getReaderSourceUrl(row: PropertyTableRow): string {
  const url = propertyText(row.properties.url).trim()
  return /^https?:\/\//i.test(url) ? url : ''
}

export function filterReaderRows(rows: PropertyTableRow[], source: ReaderSource, query: string, unreadOnly: boolean, hideArchived = false, sort: ReaderSort = 'updated'): PropertyTableRow[] {
  const q = query.trim().toLowerCase()
  return rows
    .filter((row) => {
      const rowSource = getReaderSource(row)
      if (!rowSource) return false
      if (source !== 'all' && rowSource !== source) return false
      if (hideArchived && isArchivedReaderRow(row)) return false
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
    .sort((a, b) => {
      if (sort === 'oldest') return (a.updatedAt || 0) - (b.updatedAt || 0) || a.title.localeCompare(b.title)
      if (sort === 'title') return a.title.localeCompare(b.title) || (b.updatedAt || 0) - (a.updatedAt || 0)
      if (sort === 'source') return sourceLabel(getReaderSource(a)).localeCompare(sourceLabel(getReaderSource(b))) || (b.updatedAt || 0) - (a.updatedAt || 0)
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    })
}

export function countUnreadReaderRows(rows: PropertyTableRow[]): number {
  return rows.filter((row) => getReaderSource(row) && isUnreadReaderRow(row)).length
}

export function countReaderRowsBySource(rows: PropertyTableRow[]): Record<ReaderSource, number> {
  const counts: Record<ReaderSource, number> = { all: 0, notion: 0, readwise: 0, pocket: 0 }
  for (const row of rows) {
    const source = getReaderSource(row)
    if (!source) continue
    counts.all++
    counts[source]++
  }
  return counts
}

export function getNextUnreadReaderRow(rows: PropertyTableRow[]): PropertyTableRow | null {
  return rows.find((row) => getReaderSource(row) && isUnreadReaderRow(row)) || null
}

export function getAdjacentReaderRow(rows: PropertyTableRow[], currentId: string | null | undefined, direction: 1 | -1): PropertyTableRow | null {
  const readerRows = rows.filter((row) => getReaderSource(row))
  if (readerRows.length === 0) return null
  const currentIndex = currentId ? readerRows.findIndex((row) => row.id === currentId) : -1
  if (currentIndex < 0) return direction === 1 ? readerRows[0] : readerRows[readerRows.length - 1]
  const nextIndex = currentIndex + direction
  if (nextIndex >= 0 && nextIndex < readerRows.length) return readerRows[nextIndex]
  return null
}

export function getNextReaderQueueRow(rows: PropertyTableRow[], currentId: string | null | undefined): PropertyTableRow | null {
  const next = getAdjacentReaderRow(rows, currentId, 1)
  if (next) return next
  return getAdjacentReaderRow(rows, currentId, -1)
}

export function getArchivableReaderRows(rows: PropertyTableRow[]): PropertyTableRow[] {
  return rows.filter((row) => getReaderSource(row) && !isArchivedReaderRow(row))
}

export function getUnarchivableReaderRows(rows: PropertyTableRow[]): PropertyTableRow[] {
  return rows.filter((row) => getReaderSource(row) && isArchivedReaderRow(row))
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

function compactDigestLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 260)
}

export function extractReaderDigestExcerpts(content: string, maxItems = 3): string[] {
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const lines = withoutFrontmatter.split(/\r?\n/)
  const excerpts: string[] = []
  const seen = new Set<string>()

  const add = (value: string) => {
    const compact = compactDigestLine(value)
    if (!compact || compact.length < 8) return
    const key = compact.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    excerpts.push(compact)
  }

  for (const line of lines) {
    const quote = line.match(/^>\s*(.+)$/)
    if (quote) add(quote[1])
    if (excerpts.length >= maxItems) return excerpts
  }

  let inNotes = false
  for (const line of lines) {
    if (/^##\s+/i.test(line)) inNotes = /^##\s+Notes\s*$/i.test(line)
    if (!inNotes) continue
    const item = line.match(/^[-*]\s+(.+)$/)
    if (item && !/^(source|path|highlighted|added):/i.test(item[1])) add(item[1])
    if (excerpts.length >= maxItems) return excerpts
  }

  for (const line of lines) {
    if (/^#|^>|^[-*]\s|^\s*$/.test(line)) continue
    if (/^(author|source|added):/i.test(line)) continue
    add(line)
    if (excerpts.length >= maxItems) return excerpts
  }

  return excerpts
}

function digestLinkPart(value: string): string {
  return value.replace(/[\[\]\r\n|]/g, '').trim()
}

export function getReaderDigestLink(row: PropertyTableRow): string {
  const target = digestLinkPart(row.filePath.replace(/\\/g, '/').replace(/\.md$/i, ''))
  const alias = digestLinkPart(row.title)
  if (!target) return alias ? `[[${alias}]]` : '[[Untitled]]'
  return alias ? `[[${target}|${alias}]]` : `[[${target}]]`
}

export function createReaderDigestMarkdown(rows: PropertyTableRow[], now = new Date(), excerptsByPath: Record<string, string[]> = {}): string {
  const date = now.toISOString().slice(0, 10)
  const readerRows = rows.filter((row) => getReaderSource(row))
  const lines = [
    '---',
    'source: reader-inbox',
    `created: ${date}`,
    `items: ${readerRows.length}`,
    'source_paths:',
    ...readerRows.map((row) => `  - ${row.filePath}`),
    '---',
    '',
    `# Reading Digest ${date}`,
    '',
    '## Focus',
    '',
    '- ',
    '',
    '## Reading Queue',
    ''
  ]

  for (const row of readerRows) {
    const source = sourceLabel(getReaderSource(row))
    const author = propertyText(row.properties.author)
    const status = propertyText(row.properties.status) || (isUnreadReaderRow(row) ? 'unread' : '')
    const url = getReaderSourceUrl(row)
    const meta = [source, author, status].filter(Boolean).join(' · ')
    lines.push(`- ${getReaderDigestLink(row)}${meta ? ` - ${meta}` : ''}`)
    lines.push(`  - Path: ${row.filePath}`)
    if (url) lines.push(`  - Source: ${url}`)
    const excerpts = excerptsByPath[row.filePath] || []
    for (const excerpt of excerpts) lines.push(`  - Excerpt: ${excerpt}`)
    lines.push('  - Notes: ')
  }

  lines.push('', '## Connections', '', '- ')
  return `${lines.join('\n')}\n`
}

export function createReaderDigestionPrompt(rows: PropertyTableRow[], excerptsByPath: Record<string, string[]> = {}, maxRows = 12): string {
  const readerRows = rows.filter((row) => getReaderSource(row)).slice(0, maxRows)
  const lines = [
    '请把下面这些阅读收件箱条目当作待消化的信息流处理。',
    '',
    '请输出：',
    '1. 值得立刻阅读/处理的 Top 3，并说明原因。',
    '2. 每条内容的核心观点或可执行启发。',
    '3. 可能关联的已有笔记主题或应该新建的笔记标题，用 [[wikilink]] 表示。',
    '4. 建议动作：保留、归档、转任务、写入项目笔记，或丢弃。',
    '5. 一个 15 分钟内可以完成的处理顺序。',
    '',
    `条目数量：${readerRows.length}${rows.length > readerRows.length ? `（已截取前 ${readerRows.length} 条）` : ''}`,
    ''
  ]

  for (const [index, row] of readerRows.entries()) {
    const source = sourceLabel(getReaderSource(row))
    const author = propertyText(row.properties.author)
    const status = propertyText(row.properties.status) || (isUnreadReaderRow(row) ? 'unread' : '')
    const url = getReaderSourceUrl(row)
    lines.push(`${index + 1}. ${row.title}`)
    lines.push(`   - Path: ${row.filePath}`)
    lines.push(`   - Source: ${source}${author ? ` / ${author}` : ''}${status ? ` / ${status}` : ''}`)
    if (url) lines.push(`   - URL: ${url}`)
    const excerpts = excerptsByPath[row.filePath] || []
    for (const excerpt of excerpts) lines.push(`   - Excerpt: ${excerpt}`)
  }

  return `${lines.join('\n')}\n`
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

function triageColor(stage: ReaderTriageStage): string {
  if (stage === 'next') return '#8fb3ff'
  if (stage === 'connect') return '#74c69d'
  if (stage === 'later') return '#c9a66b'
  return 'var(--text-tertiary)'
}

function getReaderTriageReason(row: PropertyTableRow, t: ReaderTranslator): string {
  const status = propertyText(row.properties.status).toLowerCase()
  const stage = getReaderTriageStage(row)
  if (stage === 'archived') return t('reader.triageReason.archived')
  if (stage === 'next') return t('reader.triageReason.unread')
  if (['read', 'done', 'processed', 'connected'].includes(status)) return t('reader.triageReason.read')
  if (propertyText(row.properties.tags).trim()) return t('reader.triageReason.tagged')
  if (getReaderSourceUrl(row)) return t('reader.triageReason.source')
  return t('reader.triageReason.later')
}

function formatDate(value: number): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const iconButtonBaseStyle: CSSProperties = {
  width: 32,
  height: 32,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  cursor: 'pointer'
}

const smallIconButtonBaseStyle: CSSProperties = {
  ...iconButtonBaseStyle,
  width: 26,
  height: 26
}

const quietButtonStyle: CSSProperties = {
  height: 30,
  padding: '0 10px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  cursor: 'pointer'
}

const detailLabelStyle: CSSProperties = {
  marginBottom: 5,
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-tertiary)'
}

const detailValueStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 12,
  lineHeight: 1.45,
  color: 'var(--text-secondary)'
}

const readerShellStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  gridTemplateColumns: '230px minmax(340px, 0.9fr) minmax(420px, 1.1fr)',
  gap: 0,
  background: 'var(--editor-bg)',
  color: 'var(--text-primary)'
}

const readerRailStyle: CSSProperties = {
  minHeight: 0,
  padding: '22px 16px 18px 20px',
  borderRight: '1px solid var(--border-subtle)',
  background: 'color-mix(in srgb, var(--bg-surface) 54%, var(--editor-bg))',
  display: 'flex',
  flexDirection: 'column',
  gap: 18
}

const readerSectionLabelStyle: CSSProperties = {
  marginBottom: 8,
  fontSize: 10,
  fontWeight: 760,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-tertiary)'
}

const readerFlowButtonBaseStyle: CSSProperties = {
  width: '100%',
  minHeight: 34,
  padding: '8px 9px',
  border: 'none',
  borderRadius: 7,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 8,
  alignItems: 'center',
  textAlign: 'left',
  color: 'var(--text-secondary)',
  cursor: 'pointer'
}

const readerToggleStyle: CSSProperties = {
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  cursor: 'pointer'
}

async function getAvailableReaderDigestPath(vaultPath: string, date: string): Promise<string> {
  const base = `${vaultPath}/Reader Digests/Reading Digest ${date}`
  for (let i = 0; i < 1000; i++) {
    const path = `${base}${i === 0 ? '' : ` ${i + 1}`}.md`
    try {
      await window.api.invoke('file:stat', { path })
    } catch {
      return path
    }
  }
  return `${base} ${Date.now()}.md`
}

export function ReaderInboxView() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const setMainView = useUIStore((s) => s.setMainView)
  const setRightPanel = useUIStore((s) => s.setRightPanel)
  const [rows, setRows] = useState<PropertyTableRow[]>([])
  const [query, setQuery] = useState('')
  const [viewSettings, setViewSettings] = useState<ReaderViewSettings>(loadReaderViewSettings)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState<ReaderSource | null>(null)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)
  const [creatingDigest, setCreatingDigest] = useState(false)
  const [preparingDigestion, setPreparingDigestion] = useState(false)
  const [preparingRowDigestId, setPreparingRowDigestId] = useState<string | null>(null)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [stageFocus, setStageFocus] = useState<ReaderTriageStage | 'all'>('all')
  const { source, sort, unreadOnly, showArchived } = viewSettings

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

  useEffect(() => {
    saveReaderViewSettings(viewSettings)
  }, [viewSettings])

  const readerRows = useMemo(() => rows.filter((row) => getReaderSource(row)), [rows])
  const baseFiltered = useMemo(() => filterReaderRows(rows, source, query, unreadOnly, !showArchived, sort), [query, rows, showArchived, sort, source, unreadOnly])
  const filtered = useMemo(() => stageFocus === 'all' ? baseFiltered : baseFiltered.filter((row) => getReaderTriageStage(row) === stageFocus), [baseFiltered, stageFocus])
  const sourceCountRows = useMemo(() => filterReaderRows(rows, 'all', query, unreadOnly, !showArchived, 'updated'), [query, rows, showArchived, unreadOnly])
  const counts = useMemo(() => countReaderRowsBySource(sourceCountRows), [sourceCountRows])
  const triageCounts = useMemo(() => countReaderRowsByTriage(baseFiltered), [baseFiltered])
  const triageGroups = useMemo(() => READER_TRIAGE_STAGES
    .map((stage) => ({ stage, rows: filtered.filter((row) => getReaderTriageStage(row) === stage) }))
    .filter((group) => group.rows.length > 0), [filtered])
  const unreadCount = countUnreadReaderRows(readerRows)
  const archivableVisibleRows = useMemo(() => getArchivableReaderRows(filtered), [filtered])
  const unarchivableVisibleRows = useMemo(() => getUnarchivableReaderRows(filtered), [filtered])
  const nextUnreadRow = useMemo(() => getNextUnreadReaderRow(filtered), [filtered])
  const selectedRow = useMemo(() => filtered.find((row) => row.id === selectedRowId) || nextUnreadRow || filtered[0] || null, [filtered, nextUnreadRow, selectedRowId])

  useEffect(() => {
    if (selectedRowId && !filtered.some((row) => row.id === selectedRowId)) setSelectedRowId(null)
  }, [filtered, selectedRowId])

  const openRow = async (row: PropertyTableRow) => {
    if (!vaultPath) return
    await openFile(`${vaultPath}/${row.filePath}`)
    setMainView('editor')
  }

  const openRowInKnowledgeSpace = (row: PropertyTableRow) => {
    safeSet(PENDING_CANVAS_FOCUS_KEY, JSON.stringify({ filePath: row.filePath, mode: 'space' }))
    setMainView('canvas')
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

  const writeStatuses = async (targetRows: PropertyTableRow[], status: 'read' | 'unread' | 'archived'): Promise<boolean> => {
    if (!vaultPath) return false
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
      const message = status === 'read'
        ? t('reader.markedReadCount', { count: changedIds.length })
        : status === 'archived'
          ? t('reader.archivedCount', { count: changedIds.length })
          : t('reader.markedUnreadCount', { count: changedIds.length })
      toast(message, 'success')
      return true
    } catch {
      toast(t('reader.statusFailed'), 'error')
      return false
    }
  }

  const updateStatus = async (row: PropertyTableRow, status: 'read' | 'unread' | 'archived'): Promise<boolean> => {
    return writeStatuses([row], status)
  }

  const markVisibleRead = async () => {
    const unreadRows = filtered.filter(isUnreadReaderRow)
    if (unreadRows.length === 0) return
    await writeStatuses(unreadRows, 'read')
  }

  const archiveVisible = async () => {
    if (archivableVisibleRows.length === 0) return
    await writeStatuses(archivableVisibleRows, 'archived')
  }

  const unarchiveVisible = async () => {
    if (unarchivableVisibleRows.length === 0) return
    await writeStatuses(unarchivableVisibleRows, 'unread')
  }

  const selectAdjacentRow = (direction: 1 | -1) => {
    const target = getAdjacentReaderRow(filtered, selectedRow?.id, direction)
    if (target) setSelectedRowId(target.id)
  }

  const completeAndSelectNext = async (row: PropertyTableRow) => {
    const next = getNextReaderQueueRow(filtered, row.id)
    const status = isUnreadReaderRow(row) ? 'read' : 'archived'
    const updated = await updateStatus(row, status)
    if (updated) setSelectedRowId(next?.id || null)
  }

  const createDigest = async () => {
    if (!vaultPath || filtered.length === 0) return
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    setCreatingDigest(true)
    try {
      const readerRows = filtered.filter((row) => getReaderSource(row))
      const excerptEntries = await Promise.all(readerRows.map(async (row) => {
        try {
          const content = await window.api.invoke('file:read', { path: `${vaultPath}/${row.filePath}` })
          return [row.filePath, extractReaderDigestExcerpts(content)] as const
        } catch {
          return [row.filePath, []] as const
        }
      }))
      const content = createReaderDigestMarkdown(filtered, now, Object.fromEntries(excerptEntries))
      const path = await getAvailableReaderDigestPath(vaultPath, date)
      await window.api.invoke('file:create', { path, content, vaultPath })
      await window.api.invoke('db:index-file', { vaultPath, filePath: path })
      await useVaultStore.getState().refreshFiles([path])
      await openFile(path)
      setMainView('editor')
      toast(t('reader.digestCreated'), 'success')
    } catch {
      toast(t('reader.digestFailed'), 'error')
    } finally {
      setCreatingDigest(false)
    }
  }

  const prepareAiDigestRows = async (targetRows: PropertyTableRow[], maxRows = 12, maxExcerpts = 2): Promise<boolean> => {
    if (!vaultPath || targetRows.length === 0) return false
    try {
      const readerRows = targetRows.filter((row) => getReaderSource(row)).slice(0, maxRows)
      const excerptEntries = await Promise.all(readerRows.map(async (row) => {
        try {
          const content = await window.api.invoke('file:read', { path: `${vaultPath}/${row.filePath}` })
          return [row.filePath, extractReaderDigestExcerpts(content, maxExcerpts)] as const
        } catch {
          return [row.filePath, []] as const
        }
      }))
      const draft = {
        mode: 'chat' as const,
        agentMode: true,
        prompt: createReaderDigestionPrompt(targetRows, Object.fromEntries(excerptEntries), maxRows)
      }
      safeSet('nexusky-pending-ai-draft', JSON.stringify(draft))
      setRightPanel('chat')
      window.dispatchEvent(new CustomEvent('ai-command-draft', { detail: draft }))
      toast(t('reader.aiDigestReady'), 'success')
      return true
    } catch {
      toast(t('reader.aiDigestFailed'), 'error')
      return false
    }
  }

  const askAiToDigestVisible = async () => {
    if (filtered.length === 0) return
    setPreparingDigestion(true)
    try {
      await prepareAiDigestRows(filtered)
    } finally {
      setPreparingDigestion(false)
    }
  }

  const askAiToDigestRow = async (row: PropertyTableRow) => {
    setPreparingRowDigestId(row.id)
    try {
      await prepareAiDigestRows([row], 1, 3)
    } finally {
      setPreparingRowDigestId(null)
    }
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
    <div style={readerShellStyle}>
      <aside style={readerRailStyle}>
        <div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 760, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('reader.intake')}</div>
          <h1 style={{ margin: '8px 0 0', fontSize: 22, lineHeight: 1.14, fontWeight: 760 }}>{t('reader.title')}</h1>
          <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.55, color: 'var(--text-tertiary)' }}>
            {t('reader.summary', { count: readerRows.length, unread: unreadCount })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <ReaderMetric label={t('reader.inboxMetric')} value={readerRows.length} />
          <ReaderMetric label={t('reader.unreadMetric')} value={unreadCount} />
          <ReaderMetric label={t('reader.visibleMetric')} value={filtered.length} />
        </div>

        <div>
          <div style={readerSectionLabelStyle}>{t('reader.sourceLabel')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {READER_SOURCES.map((item) => {
              const active = source === item
              return (
                <button
                  key={item}
                  onClick={() => setViewSettings((current) => ({ ...current, source: item }))}
                  style={{ ...readerFlowButtonBaseStyle, background: active ? 'var(--bg-elevated)' : 'transparent', outline: active ? '1px solid var(--border-subtle)' : 'none' }}
                >
                  <span style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: item === 'all' ? 'var(--text-tertiary)' : sourceColor(item) }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: active ? 700 : 560, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {item === 'all' ? t('reader.allSources') : sourceLabel(item)}
                    </span>
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{counts[item]}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div style={readerSectionLabelStyle}>{t('reader.flowLabel')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <ReaderStageButton active={stageFocus === 'all'} label={t('reader.allStages')} count={baseFiltered.length} color="var(--text-tertiary)" onClick={() => setStageFocus('all')} />
            {READER_TRIAGE_STAGES.map((stage) => (
              <ReaderStageButton key={stage} active={stageFocus === stage} label={t(`reader.triage.${stage}`)} count={triageCounts[stage]} color={triageColor(stage)} onClick={() => setStageFocus(stage)} />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ ...readerToggleStyle, justifyContent: 'space-between' }}>
            <span>{t('reader.unreadOnly')}</span>
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setViewSettings((current) => ({ ...current, unreadOnly: e.target.checked }))} />
          </label>
          <label style={{ ...readerToggleStyle, justifyContent: 'space-between' }}>
            <span>{t('reader.showArchived')}</span>
            <input type="checkbox" checked={showArchived} onChange={(e) => setViewSettings((current) => ({ ...current, showArchived: e.target.checked }))} />
          </label>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {(['notion', 'readwise', 'pocket'] as const).map((item) => (
            <button
              key={item}
              onClick={() => void importSource(item)}
              disabled={Boolean(importing)}
              style={{ ...quietButtonStyle, width: '100%', justifyContent: 'space-between', opacity: importing && importing !== item ? 0.55 : 1, cursor: importing ? 'default' : 'pointer' }}
            >
              <span>{importing === item ? t('reader.importing') : t(`reader.import.${item}`)}</span>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: sourceColor(item) }} />
            </button>
          ))}
        </div>
      </aside>

      <main style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-subtle)' }}>
        <div style={{ flexShrink: 0, padding: '20px 20px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('reader.searchPlaceholder')}
              style={{ width: '100%', height: 34, padding: '0 11px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: 'none', fontSize: 12 }}
            />
            <select
              value={sort}
              onChange={(e) => setViewSettings((current) => ({ ...current, sort: e.target.value as ReaderSort }))}
              style={{ height: 34, padding: '0 9px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, outline: 'none' }}
            >
              <option value="updated">{t('reader.sortUpdated')}</option>
              <option value="oldest">{t('reader.sortOldest')}</option>
              <option value="title">{t('reader.sortTitle')}</option>
              <option value="source">{t('reader.sortSource')}</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => loadRows()} disabled={loading} title={loading ? t('reader.loading') : t('reader.refresh')} aria-label={loading ? t('reader.loading') : t('reader.refresh')} style={{ ...iconButtonBaseStyle, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.65 : 1 }}><RefreshIcon /></button>
            <button onClick={() => { if (nextUnreadRow) void openRow(nextUnreadRow) }} disabled={!nextUnreadRow} title={t('reader.openNextUnread')} aria-label={t('reader.openNextUnread')} style={{ ...iconButtonBaseStyle, background: nextUnreadRow ? 'var(--accent-muted)' : 'var(--bg-elevated)', color: nextUnreadRow ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: nextUnreadRow ? 'pointer' : 'default', opacity: nextUnreadRow ? 1 : 0.55 }}><NextIcon /></button>
            <button onClick={() => void markVisibleRead()} disabled={!filtered.some(isUnreadReaderRow)} title={t('reader.markVisibleRead')} aria-label={t('reader.markVisibleRead')} style={{ ...iconButtonBaseStyle, color: filtered.some(isUnreadReaderRow) ? 'var(--text-secondary)' : 'var(--text-tertiary)', cursor: filtered.some(isUnreadReaderRow) ? 'pointer' : 'default', opacity: filtered.some(isUnreadReaderRow) ? 1 : 0.55 }}><CheckIcon /></button>
            <button onClick={() => void archiveVisible()} disabled={archivableVisibleRows.length === 0} title={t('reader.archiveVisible')} aria-label={t('reader.archiveVisible')} style={{ ...iconButtonBaseStyle, color: archivableVisibleRows.length > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)', cursor: archivableVisibleRows.length > 0 ? 'pointer' : 'default', opacity: archivableVisibleRows.length > 0 ? 1 : 0.55 }}><ArchiveIcon /></button>
            <button onClick={() => void unarchiveVisible()} disabled={unarchivableVisibleRows.length === 0} title={t('reader.unarchiveVisible')} aria-label={t('reader.unarchiveVisible')} style={{ ...iconButtonBaseStyle, color: unarchivableVisibleRows.length > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)', cursor: unarchivableVisibleRows.length > 0 ? 'pointer' : 'default', opacity: unarchivableVisibleRows.length > 0 ? 1 : 0.55 }}><UnarchiveIcon /></button>
            <button onClick={() => void askAiToDigestVisible()} disabled={filtered.length === 0 || preparingDigestion} title={preparingDigestion ? t('reader.preparingAiDigest') : t('reader.aiDigestVisible')} aria-label={preparingDigestion ? t('reader.preparingAiDigest') : t('reader.aiDigestVisible')} style={{ ...iconButtonBaseStyle, background: filtered.length > 0 && !preparingDigestion ? 'var(--accent-muted)' : 'var(--bg-elevated)', color: filtered.length > 0 && !preparingDigestion ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: filtered.length > 0 && !preparingDigestion ? 'pointer' : 'default', opacity: filtered.length > 0 && !preparingDigestion ? 1 : 0.55 }}><SparkIcon /></button>
            <button onClick={() => void createDigest()} disabled={filtered.length === 0 || creatingDigest} title={creatingDigest ? t('reader.creatingDigest') : t('reader.createDigest')} aria-label={creatingDigest ? t('reader.creatingDigest') : t('reader.createDigest')} style={{ ...iconButtonBaseStyle, color: filtered.length > 0 && !creatingDigest ? 'var(--text-secondary)' : 'var(--text-tertiary)', cursor: filtered.length > 0 && !creatingDigest ? 'pointer' : 'default', opacity: filtered.length > 0 && !creatingDigest ? 1 : 0.55 }}><DigestIcon /></button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 16px 28px' }}>
          {filtered.length === 0 ? (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>
              {readerRows.length === 0 ? t('reader.emptyImports') : t('reader.emptyFilter')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={readerSectionLabelStyle}>{stageFocus === 'all' ? t('reader.queue') : t(`reader.triage.${stageFocus}`)}</div>
                  <div style={{ marginTop: -4, color: 'var(--text-tertiary)', fontSize: 12 }}>{t('reader.visibleSummary', { count: filtered.length })}</div>
                </div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{filtered.length}</div>
              </div>

              {triageGroups.map((group) => (
                <div key={group.stage}>
                  <div style={{ margin: '0 4px 7px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 760, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: triageColor(group.stage) }} />
                      {t(`reader.triage.${group.stage}`)}
                    </div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{group.rows.length}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {group.rows.map((row) => {
                      const rowSource = getReaderSource(row)
                      const active = selectedRow?.id === row.id
                      const status = propertyText(row.properties.status) || (isUnreadReaderRow(row) ? t('reader.unread') : '')
                      return (
                        <button
                          key={row.id}
                          onClick={() => setSelectedRowId(row.id)}
                          style={{ width: '100%', minHeight: 82, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, padding: '12px 13px', border: '1px solid var(--border-subtle)', borderRadius: 8, background: active ? 'var(--bg-elevated)' : 'color-mix(in srgb, var(--bg-surface) 74%, transparent)', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', boxShadow: active ? '0 14px 32px rgba(0,0,0,0.18)' : 'none' }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <span style={{ width: 7, height: 7, borderRadius: 999, background: sourceColor(rowSource), flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: active ? 740 : 650 }}>{row.title}</span>
                            </span>
                            <span style={{ display: 'block', marginTop: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-tertiary)' }}>
                              {sourceLabel(rowSource)}{status ? ` · ${status}` : ''} · {formatDate(row.updatedAt)}
                            </span>
                            <span style={{ display: 'block', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-tertiary)' }}>
                              {row.filePath}
                            </span>
                          </span>
                          <span style={{ alignSelf: 'start', color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 760, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t(`reader.triage.${getReaderTriageStage(row)}`)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <div style={{ minWidth: 0, minHeight: 0, padding: '20px 22px 24px', overflow: 'hidden' }}>
        {selectedRow ? (
          <ReaderBrief
            row={selectedRow}
            activeNoteId={activeNoteId}
            noteDraft={noteDrafts[selectedRow.id] || ''}
            savingNote={savingNoteId === selectedRow.id}
            onOpen={() => void openRow(selectedRow)}
            onOpenInKnowledgeSpace={() => openRowInKnowledgeSpace(selectedRow)}
            onOpenSource={() => void openSource(selectedRow)}
            onAiDigest={() => void askAiToDigestRow(selectedRow)}
            onPrevious={() => selectAdjacentRow(-1)}
            onNext={() => selectAdjacentRow(1)}
            onCompleteNext={() => void completeAndSelectNext(selectedRow)}
            onToggleNote={() => setActiveNoteId(activeNoteId === selectedRow.id ? null : selectedRow.id)}
            onNoteChange={(value) => setNoteDrafts((current) => ({ ...current, [selectedRow.id]: value }))}
            onCancelNote={() => setActiveNoteId(null)}
            onSaveNote={() => void saveReaderNote(selectedRow)}
            onToggleRead={() => void updateStatus(selectedRow, isUnreadReaderRow(selectedRow) ? 'read' : 'unread')}
            onToggleArchive={() => void updateStatus(selectedRow, isArchivedReaderRow(selectedRow) ? 'unread' : 'archived')}
            hasPrevious={Boolean(getAdjacentReaderRow(filtered, selectedRow.id, -1))}
            hasNext={Boolean(getAdjacentReaderRow(filtered, selectedRow.id, 1))}
            digesting={preparingRowDigestId === selectedRow.id}
            t={t}
          />
        ) : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            {readerRows.length === 0 ? t('reader.emptyImports') : t('reader.emptyFilter')}
          </div>
        )}
      </div>
    </div>
  )
}

function IconSvg({ children }: { children: ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

function RefreshIcon() {
  return <IconSvg><path d="M20 11a8 8 0 0 0-14.8-4.2L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.8 4.2L20 16" /><path d="M20 20v-4h-4" /></IconSvg>
}

function NextIcon() {
  return <IconSvg><path d="M5 5l7 7-7 7" /><path d="M13 5l7 7-7 7" /></IconSvg>
}

function PreviousIcon() {
  return <IconSvg><path d="M19 5l-7 7 7 7" /><path d="M11 5l-7 7 7 7" /></IconSvg>
}

function CheckIcon() {
  return <IconSvg><path d="M20 6L9 17l-5-5" /></IconSvg>
}

function UnreadIcon() {
  return <IconSvg><circle cx="12" cy="12" r="7" /><path d="M12 8v4l3 2" /></IconSvg>
}

function ArchiveIcon() {
  return <IconSvg><path d="M3 7h18" /><path d="M5 7l1 13h12l1-13" /><path d="M9 11h6" /><path d="M4 4h16v3H4z" /></IconSvg>
}

function UnarchiveIcon() {
  return <IconSvg><path d="M3 7h18" /><path d="M5 7l1 13h12l1-13" /><path d="M12 16V10" /><path d="M9 13l3-3 3 3" /><path d="M4 4h16v3H4z" /></IconSvg>
}

function SparkIcon() {
  return <IconSvg><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></IconSvg>
}

function DigestIcon() {
  return <IconSvg><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5" /><path d="M10 12h6" /><path d="M10 16h6" /></IconSvg>
}

function SpaceIcon() {
  return <IconSvg><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="9" y="14" width="6" height="6" rx="1.5" /><path d="M10 7h4" /><path d="M12 10v4" /></IconSvg>
}

function NoteIcon() {
  return <IconSvg><path d="M5 4h14v16H5z" /><path d="M8 8h8" /><path d="M8 12h5" /><path d="M16 17h3" /><path d="M17.5 15.5v3" /></IconSvg>
}

function ExternalLinkIcon() {
  return <IconSvg><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" /></IconSvg>
}

function FolderIcon() {
  return <IconSvg><path d="M4 6h6l2 2h8v10a2 2 0 0 1-2 2H4z" /><path d="M4 6v12a2 2 0 0 0 2 2" /></IconSvg>
}

function ReaderMetric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ minWidth: 0, textAlign: 'left' }}>
      <div style={{ color: 'var(--text-primary)', fontSize: 18, lineHeight: 1.05, fontWeight: 740, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ marginTop: 4, color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
    </div>
  )
}

function ReaderStageButton({ active, label, count, color, onClick }: { active: boolean; label: string; count: number; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...readerFlowButtonBaseStyle, background: active ? 'var(--bg-elevated)' : 'transparent', outline: active ? '1px solid var(--border-subtle)' : 'none' }}>
      <span style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: active ? 700 : 560, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
      </span>
      <span style={{ color: 'var(--text-tertiary)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </button>
  )
}

function ReaderBrief({
  row,
  activeNoteId,
  noteDraft,
  savingNote,
  onOpen,
  onOpenInKnowledgeSpace,
  onOpenSource,
  onAiDigest,
  onPrevious,
  onNext,
  onCompleteNext,
  onToggleNote,
  onNoteChange,
  onCancelNote,
  onSaveNote,
  onToggleRead,
  onToggleArchive,
  hasPrevious,
  hasNext,
  digesting,
  t
}: {
  row: PropertyTableRow
  activeNoteId: string | null
  noteDraft: string
  savingNote: boolean
  onOpen: () => void
  onOpenInKnowledgeSpace: () => void
  onOpenSource: () => void
  onAiDigest: () => void
  onPrevious: () => void
  onNext: () => void
  onCompleteNext: () => void
  onToggleNote: () => void
  onNoteChange: (value: string) => void
  onCancelNote: () => void
  onSaveNote: () => void
  onToggleRead: () => void
  onToggleArchive: () => void
  hasPrevious: boolean
  hasNext: boolean
  digesting: boolean
  t: ReaderTranslator
}) {
  const source = getReaderSource(row)
  const color = sourceColor(source)
  const sourceUrl = getReaderSourceUrl(row)
  const author = propertyText(row.properties.author)
  const status = propertyText(row.properties.status) || (isUnreadReaderRow(row) ? t('reader.unread') : '')
  const tags = propertyText(row.properties.tags).split(/\s+/).filter(Boolean).slice(0, 8)
  const stage = getReaderTriageStage(row)
  const triageReason = getReaderTriageReason(row, t)
  const noteActive = activeNoteId === row.id
  const archived = isArchivedReaderRow(row)

  return (
    <section style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-surface)' }}>
      <div style={{ padding: '18px 20px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 20%, transparent)` }} />
            <span>{sourceLabel(source)}</span>
            {status && <span style={{ color: 'var(--text-tertiary)' }}>· {status}</span>}
          </div>
          <span style={{ flexShrink: 0, color: 'var(--text-tertiary)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{formatDate(row.updatedAt)}</span>
        </div>
        <h2 style={{ margin: '14px 0 0', fontSize: 22, lineHeight: 1.22, fontWeight: 720, color: 'var(--text-primary)' }}>{row.title}</h2>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px 18px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={detailLabelStyle}>{t('reader.detailSource')}</div>
            <div style={detailValueStyle}>{sourceLabel(source)}</div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={detailLabelStyle}>{t('reader.detailUpdated')}</div>
            <div style={detailValueStyle}>{formatDate(row.updatedAt) || t('reader.unknownDate')}</div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={detailLabelStyle}>{t('reader.detailAuthor')}</div>
            <div style={detailValueStyle}>{author || t('reader.noAuthor')}</div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={detailLabelStyle}>{t('reader.detailStatus')}</div>
            <div style={detailValueStyle}>{status || t('reader.noStatus')}</div>
          </div>
        </div>

        <div style={{ padding: '12px 13px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--editor-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: triageColor(stage) }} />
            <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 690 }}>{t(`reader.triage.${stage}`)}</div>
          </div>
          <div style={{ marginTop: 7, color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.5 }}>{triageReason}</div>
        </div>

        <div>
          <div style={detailLabelStyle}>{t('reader.detailPath')}</div>
          <div style={{ ...detailValueStyle, display: 'flex', alignItems: 'center', gap: 7 }}>
            <FolderIcon />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.filePath}</span>
          </div>
        </div>

        {tags.length > 0 && (
          <div>
            <div style={detailLabelStyle}>{t('reader.detailTags')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tags.map((tag) => (
                <span key={tag} style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '3px 7px', borderRadius: 999, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 11 }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {noteActive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={detailLabelStyle}>{t('reader.addNote')}</div>
            <textarea
              autoFocus
              value={noteDraft}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={t('reader.notePlaceholder')}
              rows={5}
              style={{ width: '100%', resize: 'vertical', minHeight: 96, padding: '10px 11px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.55, outline: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7 }}>
              <button onClick={onCancelNote} disabled={savingNote} style={{ ...quietButtonStyle, opacity: savingNote ? 0.55 : 1, cursor: savingNote ? 'default' : 'pointer' }}>
                {t('reader.cancelNote')}
              </button>
              <button onClick={onSaveNote} disabled={savingNote} style={{ ...quietButtonStyle, borderColor: 'var(--accent-muted)', background: 'var(--accent-muted)', color: 'var(--accent-text)', opacity: savingNote ? 0.7 : 1, cursor: savingNote ? 'default' : 'pointer' }}>
                {savingNote ? t('reader.savingNote') : t('reader.saveNote')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTop: '1px solid var(--border-subtle)', background: 'var(--editor-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <button onClick={onPrevious} disabled={!hasPrevious} title={t('reader.previousItem')} aria-label={t('reader.previousItem')} style={{ ...smallIconButtonBaseStyle, opacity: hasPrevious ? 1 : 0.45, cursor: hasPrevious ? 'pointer' : 'default' }}>
            <PreviousIcon />
          </button>
          <button onClick={onNext} disabled={!hasNext} title={t('reader.nextItem')} aria-label={t('reader.nextItem')} style={{ ...smallIconButtonBaseStyle, opacity: hasNext ? 1 : 0.45, cursor: hasNext ? 'pointer' : 'default' }}>
            <NextIcon />
          </button>
          <button onClick={onCompleteNext} style={{ ...quietButtonStyle, borderColor: 'var(--accent-muted)', background: 'var(--accent-muted)', color: 'var(--accent-text)' }}>
            <CheckIcon />
            {t('reader.completeNext')}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={onOpen} title={t('reader.openItem')} aria-label={t('reader.openItem')} style={smallIconButtonBaseStyle}>
            <ExternalLinkIcon />
          </button>
          <button onClick={onOpenInKnowledgeSpace} title={t('reader.openInSpace')} aria-label={t('reader.openInSpace')} style={smallIconButtonBaseStyle}>
            <SpaceIcon />
          </button>
          <button onClick={onAiDigest} disabled={digesting} title={digesting ? t('reader.preparingAiDigestItem') : t('reader.aiDigestItem')} aria-label={digesting ? t('reader.preparingAiDigestItem') : t('reader.aiDigestItem')} style={{ ...smallIconButtonBaseStyle, background: digesting ? 'var(--accent-muted)' : 'var(--bg-elevated)', color: digesting ? 'var(--accent-text)' : 'var(--text-secondary)', cursor: digesting ? 'default' : 'pointer', opacity: digesting ? 0.75 : 1 }}>
            <SparkIcon />
          </button>
          <button onClick={onToggleNote} title={t('reader.addNote')} aria-label={t('reader.addNote')} style={{ ...smallIconButtonBaseStyle, background: noteActive ? 'var(--accent-muted)' : 'var(--bg-elevated)', color: noteActive ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
            <NoteIcon />
          </button>
          <button onClick={onOpenSource} disabled={!sourceUrl} title={t('reader.openSource')} aria-label={t('reader.openSource')} style={{ ...smallIconButtonBaseStyle, opacity: sourceUrl ? 1 : 0.45, cursor: sourceUrl ? 'pointer' : 'default' }}>
            <ExternalLinkIcon />
          </button>
          <button onClick={onToggleRead} disabled={archived} title={isUnreadReaderRow(row) ? t('reader.markRead') : t('reader.markUnread')} aria-label={isUnreadReaderRow(row) ? t('reader.markRead') : t('reader.markUnread')} style={{ ...smallIconButtonBaseStyle, opacity: archived ? 0.45 : 1, cursor: archived ? 'default' : 'pointer' }}>
            {isUnreadReaderRow(row) ? <CheckIcon /> : <UnreadIcon />}
          </button>
          <button onClick={onToggleArchive} title={archived ? t('reader.unarchive') : t('reader.archive')} aria-label={archived ? t('reader.unarchive') : t('reader.archive')} style={smallIconButtonBaseStyle}>
            {archived ? <UnarchiveIcon /> : <ArchiveIcon />}
          </button>
        </div>
      </div>
    </section>
  )
}
