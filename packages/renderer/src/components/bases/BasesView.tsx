import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import type { PropertyTableRow, PropertyValue } from '@shared/types/ipc'

type SortKey = 'updatedAt' | 'title' | 'filePath'

const PRIMARY_COLUMNS = ['tags', 'aliases', 'cssclasses']

function valueToText(value: PropertyValue | undefined): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

function formatDate(value: number): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString()
}

export function BasesView() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const setMainView = useUIStore((s) => s.setMainView)
  const [rows, setRows] = useState<PropertyTableRow[]>([])
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [selectedTag, setSelectedTag] = useState('')
  const [loading, setLoading] = useState(false)

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

  const propertyKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const row of rows) {
      Object.keys(row.properties).forEach((key) => keys.add(key))
    }
    return Array.from(keys)
      .filter((key) => key !== 'title' && !PRIMARY_COLUMNS.includes(key))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 8)
  }, [rows])

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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--editor-bg)' }}>
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: 0 }}>{t('bases.title')}</div>
          <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-tertiary)' }}>
            {t('bases.summary', { count: rows.length, shown: filteredRows.length })}
          </div>
        </div>
        <button
          onClick={loadRows}
          disabled={loading}
          style={{ height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, cursor: loading ? 'default' : 'pointer', flexShrink: 0 }}
        >
          {loading ? t('bases.loading') : t('bases.refresh')}
        </button>
      </div>

      <div style={{ padding: '10px 18px', display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 160px 160px', gap: 8, borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('bases.searchPlaceholder')}
          style={controlStyle}
        />
        <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} style={controlStyle}>
          <option value="">{t('bases.allTags')}</option>
          {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={controlStyle}>
          <option value="updatedAt">{t('bases.sortUpdated')}</option>
          <option value="title">{t('bases.sortTitle')}</option>
          <option value="filePath">{t('bases.sortPath')}</option>
        </select>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {filteredRows.length === 0 ? (
          <div style={{ padding: 32, color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' }}>
            {loading ? t('bases.loading') : t('bases.empty')}
          </div>
        ) : (
          <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <HeaderCell width={220}>{t('bases.note')}</HeaderCell>
                <HeaderCell width={180}>{t('bases.tags')}</HeaderCell>
                <HeaderCell width={180}>{t('bases.aliases')}</HeaderCell>
                <HeaderCell width={120}>{t('bases.cssclasses')}</HeaderCell>
                {propertyKeys.map((key) => <HeaderCell key={key} width={140}>{key}</HeaderCell>)}
                <HeaderCell width={120}>{t('bases.updated')}</HeaderCell>
                <HeaderCell width={260}>{t('bases.path')}</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <BodyCell>
                    <button onClick={() => openRow(row)} style={{ border: 'none', background: 'transparent', padding: 0, color: 'var(--accent-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'left' }}>
                      {row.title}
                    </button>
                  </BodyCell>
                  <ChipCell value={row.properties.tags} />
                  <ChipCell value={row.properties.aliases} />
                  <ChipCell value={row.properties.cssclasses} subtle />
                  {propertyKeys.map((key) => <BodyCell key={key}>{valueToText(row.properties[key]) || '—'}</BodyCell>)}
                  <BodyCell>{formatDate(row.updatedAt) || '—'}</BodyCell>
                  <BodyCell muted>{row.filePath}</BodyCell>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function HeaderCell({ children, width }: { children: React.ReactNode; width: number }) {
  return (
    <th style={{ width, padding: '9px 10px', position: 'sticky', top: 0, zIndex: 1, background: 'var(--editor-bg)', borderBottom: '1px solid var(--border-default)', color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 700, textAlign: 'left' }}>
      {children}
    </th>
  )
}

function BodyCell({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border-subtle)', color: muted ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
      {children}
    </td>
  )
}

function ChipCell({ value, subtle = false }: { value: PropertyValue | undefined; subtle?: boolean }) {
  const items = Array.isArray(value) ? value.map(String).filter(Boolean) : value ? [String(value)] : []
  return (
    <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'middle' }}>
      <div style={{ display: 'flex', gap: 4, overflow: 'hidden' }}>
        {items.length === 0 ? (
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
        ) : items.slice(0, 3).map((item) => (
          <span key={item} style={{ maxWidth: 92, padding: '2px 6px', borderRadius: 999, background: subtle ? 'var(--bg-hover)' : 'var(--accent-muted)', color: subtle ? 'var(--text-secondary)' : 'var(--accent-text)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {item}
          </span>
        ))}
        {items.length > 3 && <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>+{items.length - 3}</span>}
      </div>
    </td>
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
  outline: 'none'
}
