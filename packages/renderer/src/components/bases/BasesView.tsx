import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { toast } from '../../stores/toast-store'
import { updateMarkdownProperty } from '../../utils/frontmatter'
import { safeGetJSON, safeSetJSON } from '../../utils/storage'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../ui/empty'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Spinner } from '../ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { PropertyTableRow, PropertyValue } from '@shared/types/ipc'

type SortKey = 'updatedAt' | 'title' | 'filePath'
type EditState = { rowId: string; key: string; value: string; list: boolean } | null

const PRIMARY_COLUMNS = ['tags', 'aliases', 'cssclasses']
const ALL_TAGS_VALUE = '__all__'

function getColumnsStorageKey(vaultPath: string): string {
  return `nexusky-bases-columns:${encodeURIComponent(vaultPath)}`
}

function valueToText(value: PropertyValue | undefined): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

function formatDate(value: number): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString()
}

function parseEditedPropertyValue(value: string, current: PropertyValue | undefined, list: boolean): PropertyValue {
  if (list) return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean)
  const trimmed = value.trim()
  if (typeof current === 'number') {
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : trimmed
  }
  if (typeof current === 'boolean') {
    if (/^(true|1|yes|on)$/i.test(trimmed)) return true
    if (/^(false|0|no|off)$/i.test(trimmed)) return false
    return trimmed
  }
  return trimmed
}

export function BasesView() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const setMainView = useUIStore((s) => s.setMainView)
  const consumePendingBasesFocus = useUIStore((s) => s.consumePendingBasesFocus)
  const [rows, setRows] = useState<PropertyTableRow[]>([])
  const [query, setQuery] = useState('')
  const [highlightedFilePath, setHighlightedFilePath] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [selectedTag, setSelectedTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<EditState>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [selectedPropertyKeys, setSelectedPropertyKeys] = useState<string[]>([])

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

  const allPropertyKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const row of rows) {
      Object.keys(row.properties).forEach((key) => keys.add(key))
    }
    return Array.from(keys)
      .filter((key) => key !== 'title' && !PRIMARY_COLUMNS.includes(key))
      .sort((a, b) => a.localeCompare(b))
  }, [rows])

  useEffect(() => {
    if (!vaultPath) return
    const saved = safeGetJSON<{ keys?: string[] }>(getColumnsStorageKey(vaultPath), {})
    const validSaved = Array.isArray(saved.keys) ? saved.keys.filter((key) => allPropertyKeys.includes(key)) : null
    setSelectedPropertyKeys(validSaved ?? allPropertyKeys.slice(0, 8))
  }, [vaultPath, allPropertyKeys.join('\n')])

  useEffect(() => {
    if (rows.length === 0) return
    const pending = consumePendingBasesFocus()
    if (!pending) return
    const filename = pending.filePath.split('/').pop()?.replace(/\.md$/, '') || pending.filePath
    setQuery(filename)
    setHighlightedFilePath(pending.filePath)
    const tid = setTimeout(() => setHighlightedFilePath(null), 3000)
    return () => clearTimeout(tid)
  }, [rows.length, consumePendingBasesFocus])

  const propertyKeys = useMemo(() => {
    const selected = new Set(selectedPropertyKeys)
    return allPropertyKeys.filter((key) => selected.has(key))
  }, [allPropertyKeys, selectedPropertyKeys])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const row of rows) {
      const value = row.properties.tags
      if (Array.isArray(value)) value.forEach((tag) => tags.add(String(tag)))
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visible = rows.filter((row) => {
      const values = [
        row.title,
        row.filePath,
        ...Object.values(row.properties).map(valueToText),
      ].join(' ').toLowerCase()
      const tagValue = row.properties.tags
      const tags = Array.isArray(tagValue) ? tagValue.map(String) : []
      return (!q || values.includes(q)) && (!selectedTag || tags.includes(selectedTag))
    })

    return visible.sort((a, b) => {
      if (sortKey === 'updatedAt') return b.updatedAt - a.updatedAt
      return String(a[sortKey]).localeCompare(String(b[sortKey]))
    })
  }, [rows, query, selectedTag, sortKey])

  const openRow = async (row: PropertyTableRow) => {
    if (!vaultPath) return
    setMainView('editor')
    await openFile(`${vaultPath}/${row.filePath}`)
  }

  const startEdit = (row: PropertyTableRow, key: string, list: boolean) => {
    setEditing({ rowId: row.id, key, value: valueToText(row.properties[key]), list })
  }

  const saveEdit = async () => {
    if (!editing || !vaultPath) return
    const row = rows.find((item) => item.id === editing.rowId)
    if (!row) return
    try {
      const path = `${vaultPath}/${row.filePath}`
      const content = await window.api.invoke('file:read', { path })
      const nextValue = parseEditedPropertyValue(editing.value, row.properties[editing.key], editing.list)
      const nextContent = updateMarkdownProperty(content, editing.key, nextValue)
      await window.api.invoke('file:write', { path, content: nextContent, vaultPath })
      await window.api.invoke('db:index-file', { vaultPath, filePath: path })
      setEditing(null)
      await loadRows()
      toast(t('bases.propertySaved'), 'success')
    } catch {
      toast(t('bases.propertySaveFailed'), 'error')
    }
  }

  const cancelEdit = () => setEditing(null)

  const saveSelectedColumns = (keys: string[]) => {
    setSelectedPropertyKeys(keys)
    if (vaultPath) safeSetJSON(getColumnsStorageKey(vaultPath), { keys })
  }

  const toggleColumn = (key: string) => {
    const selected = new Set(selectedPropertyKeys)
    if (selected.has(key)) selected.delete(key)
    else selected.add(key)
    saveSelectedColumns(allPropertyKeys.filter((item) => selected.has(item)))
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--editor-bg)' }}>
      <div className="glass-divider-bottom" style={{ padding: '14px 18px 12px', borderBottom: '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, boxShadow: 'var(--glass-divider-shadow-bottom)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: 0 }}>{t('bases.title')}</div>
          <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-tertiary)' }}>
            {t('bases.summary', { count: rows.length, shown: filteredRows.length })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowGuide((value) => !value)}
            style={headerButtonStyle}
          >
            {t('bases.guide')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadRows}
            disabled={loading}
            style={{ ...headerButtonStyle, cursor: loading ? 'default' : 'pointer' }}
          >
            {loading ? t('bases.loading') : t('bases.refresh')}
          </Button>
        </div>
      </div>

      <div className="glass-divider-bottom" style={{ padding: '10px 18px', display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 160px 160px 120px', gap: 8, borderBottom: '0', flexShrink: 0, boxShadow: 'var(--glass-divider-shadow-bottom)' }}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('bases.searchPlaceholder')}
          style={controlStyle}
        />
        <Select
          value={selectedTag || ALL_TAGS_VALUE}
          onValueChange={(value) => setSelectedTag(value === ALL_TAGS_VALUE ? '' : value)}
        >
          <SelectTrigger style={controlStyle}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_TAGS_VALUE}>{t('bases.allTags')}</SelectItem>
              {allTags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
          <SelectTrigger style={controlStyle}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="updatedAt">{t('bases.sortUpdated')}</SelectItem>
              <SelectItem value="title">{t('bases.sortTitle')}</SelectItem>
              <SelectItem value="filePath">{t('bases.sortPath')}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={() => setColumnsOpen((value) => !value)} style={headerButtonStyle}>
          {t('bases.columns', { count: propertyKeys.length })}
        </Button>
      </div>

      {columnsOpen && (
        <div style={{ margin: '12px 18px 0', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{t('bases.columnsTitle')}</div>
              <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-tertiary)' }}>{t('bases.columnsHint')}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Button type="button" variant="outline" size="xs" onClick={() => saveSelectedColumns(allPropertyKeys)} style={miniButtonStyle}>{t('bases.showAllColumns')}</Button>
              <Button type="button" variant="outline" size="xs" onClick={() => saveSelectedColumns(allPropertyKeys.slice(0, 8))} style={miniButtonStyle}>{t('bases.resetColumns')}</Button>
            </div>
          </div>
          {allPropertyKeys.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('bases.noCustomColumns')}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {allPropertyKeys.map((key) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: selectedPropertyKeys.includes(key) ? 'var(--accent-muted)' : 'var(--bg-base)', color: selectedPropertyKeys.includes(key) ? 'var(--accent-text)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                  <Checkbox checked={selectedPropertyKeys.includes(key)} onCheckedChange={() => toggleColumn(key)} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {showGuide && (
        <div style={{ margin: '12px 18px 0', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.7, flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{t('bases.guideTitle')}</div>
          <div>{t('bases.guideFrontmatter')}</div>
          <div>{t('bases.guideSearch')}</div>
          <div>{t('bases.guideEdit')}</div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 18px 34px' }}>
        {filteredRows.length === 0 ? (
          <Empty style={{ minHeight: 260, maxWidth: 520, margin: '0 auto' }}>
            {loading && <Spinner aria-hidden="true" />}
            <EmptyHeader>
              <EmptyTitle>{loading ? t('bases.loading') : t('bases.empty')}</EmptyTitle>
              {!loading && <EmptyDescription>{t('bases.emptyHint')}</EmptyDescription>}
            </EmptyHeader>
          </Empty>
        ) : (
          <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(210px, 260px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
            <aside style={{ position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={insightPanelStyle}>
                <div style={sectionEyebrowStyle}>{t('bases.propertyMap')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                  <Metric label={t('bases.notesMetric')} value={String(rows.length)} />
                  <Metric label={t('bases.shownMetric')} value={String(filteredRows.length)} />
                  <Metric label={t('bases.tagsMetric')} value={String(allTags.length)} />
                  <Metric label={t('bases.fieldsMetric')} value={String(allPropertyKeys.length)} />
                </div>
              </div>
              <div style={insightPanelStyle}>
                <div style={sectionEyebrowStyle}>{t('bases.tagLens')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  <Button type="button" variant="ghost" size="xs" onClick={() => setSelectedTag('')} style={{ ...lensButtonStyle, background: selectedTag ? 'transparent' : 'var(--accent-muted)', color: selectedTag ? 'var(--text-secondary)' : 'var(--accent-text)' }}>
                    {t('bases.allTags')}
                  </Button>
                  {allTags.slice(0, 14).map((tag) => (
                    <Button key={tag} type="button" variant="ghost" size="xs" onClick={() => setSelectedTag(tag)} style={{ ...lensButtonStyle, background: selectedTag === tag ? 'var(--accent-muted)' : 'transparent', color: selectedTag === tag ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                      {tag}
                    </Button>
                  ))}
                </div>
              </div>
            </aside>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredRows.map((row) => (
                <PropertyNoteCard
                  key={row.id}
                  row={row}
                  propertyKeys={propertyKeys}
                  editHint={t('bases.editHint')}
                  editing={editing}
                  highlighted={highlightedFilePath === row.filePath}
                  onOpen={() => void openRow(row)}
                  onEdit={(key, list) => startEdit(row, key, list)}
                  onChange={(value) => setEditing(editing ? { ...editing, value } : editing)}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: 'var(--text-primary)', fontSize: 18, lineHeight: 1.1, fontWeight: 720, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ marginTop: 3, color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}

function PropertyNoteCard({
  row,
  propertyKeys,
  editHint,
  editing,
  highlighted,
  onOpen,
  onEdit,
  onChange,
  onSave,
  onCancel
}: {
  row: PropertyTableRow
  propertyKeys: string[]
  editHint: string
  editing: EditState
  highlighted: boolean
  onOpen: () => void
  onEdit: (key: string, list: boolean) => void
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const visibleProperties = propertyKeys
    .map((key) => [key, valueToText(row.properties[key])] as const)
    .filter(([, value]) => value)
    .slice(0, 6)

  return (
    <article
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.25fr) minmax(240px, 0.75fr)',
        gap: 16,
        padding: '14px 0',
        borderBottom: '0',
        boxShadow: 'var(--glass-divider-shadow-bottom)',
        background: highlighted ? 'color-mix(in srgb, var(--accent-muted) 35%, transparent)' : 'transparent',
        transition: 'background 0.3s ease',
        borderRadius: highlighted ? 6 : 0
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Button type="button" variant="ghost" onClick={onOpen} style={{ width: 'fit-content', height: 'auto', border: 'none', background: 'transparent', padding: 0, color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.35, fontWeight: 720, cursor: 'pointer', textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', justifyContent: 'flex-start' }}>
          {row.title}
        </Button>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, color: 'var(--text-tertiary)', fontSize: 11 }}>
          <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{formatDate(row.updatedAt) || '—'}</span>
          <span style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--border-default)', flexShrink: 0 }} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.filePath}</span>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <PropertyPills label="tags" value={row.properties.tags} editHint={editHint} editing={editing?.rowId === row.id && editing.key === 'tags'} editValue={editing?.value || ''} onEdit={() => onEdit('tags', true)} onChange={onChange} onSave={onSave} onCancel={onCancel} />
          <PropertyPills label="aliases" value={row.properties.aliases} editHint={editHint} editing={editing?.rowId === row.id && editing.key === 'aliases'} editValue={editing?.value || ''} onEdit={() => onEdit('aliases', true)} onChange={onChange} onSave={onSave} onCancel={onCancel} />
          <PropertyPills label="css" value={row.properties.cssclasses} editHint={editHint} subtle editing={editing?.rowId === row.id && editing.key === 'cssclasses'} editValue={editing?.value || ''} onEdit={() => onEdit('cssclasses', true)} onChange={onChange} onSave={onSave} onCancel={onCancel} />
        </div>
      </div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {visibleProperties.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.5 }}>{editHint}</div>
        ) : visibleProperties.map(([key, value]) => (
          <EditablePropertyLine
            key={key}
            label={key}
            value={value}
            editHint={editHint}
            editing={editing?.rowId === row.id && editing.key === key}
            editValue={editing?.value || ''}
            onEdit={() => onEdit(key, Array.isArray(row.properties[key]))}
            onChange={onChange}
            onSave={onSave}
            onCancel={onCancel}
          />
        ))}
      </div>
    </article>
  )
}

function EditablePropertyLine({
  label,
  value,
  editHint,
  editing,
  editValue,
  onEdit,
  onChange,
  onSave,
  onCancel
}: {
  label: string
  value: string
  editHint: string
  editing: boolean
  editValue: string
  onEdit: () => void
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  if (editing) {
    return (
      <div>
        <Input
          autoFocus
          value={editValue}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onSave}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSave()
            if (event.key === 'Escape') onCancel()
          }}
          style={{ ...cellInputStyle, width: '100%' }}
        />
      </div>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" onDoubleClick={onEdit} aria-label={`${label} · ${editHint}`} style={{ width: '100%', height: 'auto', minWidth: 0, display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr)', justifyContent: 'stretch', gap: 10, alignItems: 'baseline', padding: '4px 0', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'text', textAlign: 'left' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{value || '—'}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{editHint}</TooltipContent>
    </Tooltip>
  )
}

function PropertyPills({
  label,
  value,
  editHint,
  subtle = false,
  onEdit,
  editing,
  editValue,
  onChange,
  onSave,
  onCancel
}: {
  label: string
  value: PropertyValue | undefined
  editHint: string
  subtle?: boolean
  onEdit: () => void
  editing: boolean
  editValue: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const items = Array.isArray(value) ? value.map(String).filter(Boolean) : value ? [String(value)] : []
  if (editing) {
    return (
      <div>
        <Input
          autoFocus
          value={editValue}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onSave}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSave()
            if (event.key === 'Escape') onCancel()
          }}
          style={{ ...cellInputStyle, width: '100%' }}
        />
      </div>
    )
  }
  const hint = `${label} · ${editHint}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" onDoubleClick={onEdit} aria-label={hint} style={{ width: '100%', height: 'auto', minWidth: 0, padding: 0, border: 'none', background: 'transparent', cursor: 'text', textAlign: 'left', justifyContent: 'stretch' }}>
          <div style={{ marginBottom: 5, color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          <div style={{ display: 'flex', gap: 4, overflow: 'hidden', minHeight: 19 }}>
            {items.length === 0 ? (
              <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
            ) : items.slice(0, 3).map((item) => (
              <Badge key={item} variant={subtle ? 'secondary' : 'default'} style={{ maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
                {item}
              </Badge>
            ))}
            {items.length > 3 && <Badge variant="secondary">+{items.length - 3}</Badge>}
          </div>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

const controlStyle: React.CSSProperties = {
  height: 30,
  minWidth: 0,
  padding: '0 9px',
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
  boxShadow: 'none'
}

const headerButtonStyle: React.CSSProperties = {
  height: 30,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  cursor: 'pointer',
  flexShrink: 0
}

const miniButtonStyle: React.CSSProperties = {
  height: 26,
  padding: '0 9px',
  borderRadius: 5,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  cursor: 'pointer'
}

const insightPanelStyle: React.CSSProperties = {
  padding: '14px 14px 15px',
  borderRadius: 8,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface)'
}

const sectionEyebrowStyle: React.CSSProperties = {
  color: 'var(--text-tertiary)',
  fontSize: 10,
  fontWeight: 720,
  textTransform: 'uppercase',
  letterSpacing: '0.06em'
}

const lensButtonStyle: React.CSSProperties = {
  minWidth: 0,
  maxWidth: '100%',
  height: 24,
  padding: '0 8px',
  borderRadius: 999,
  border: '1px solid var(--border-subtle)',
  fontSize: 11,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  cursor: 'pointer'
}

const cellInputStyle: React.CSSProperties = {
  height: 28,
  padding: '0 8px',
  borderRadius: 5,
  border: '1px solid var(--accent)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
  boxShadow: 'none'
}
