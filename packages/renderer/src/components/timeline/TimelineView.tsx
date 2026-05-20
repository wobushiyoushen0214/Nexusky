import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import type { PropertyTableRow } from '@shared/types/ipc'

type TimelineMode = 'updatedAt' | 'createdAt'

function formatDay(value: number): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short'
  })
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function getFolder(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}

function getTextValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return []
}

export function TimelineView() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const setMainView = useUIStore((s) => s.setMainView)
  const [rows, setRows] = useState<PropertyTableRow[]>([])
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<TimelineMode>('updatedAt')
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

  useEffect(() => {
    const cleanup = window.api.onVaultChanged(() => {
      void loadRows()
    })
    return () => { cleanup() }
  }, [vaultPath])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((row) => {
        if (!q) return true
        const tags = getTextValues(row.properties.tags).join(' ')
        const aliases = getTextValues(row.properties.aliases).join(' ')
        return [row.title, row.filePath, tags, aliases].some((value) => value.toLowerCase().includes(q))
      })
      .sort((a, b) => (b[mode] || 0) - (a[mode] || 0))
  }, [mode, query, rows])

  const groups = useMemo(() => {
    const next = new Map<string, PropertyTableRow[]>()
    for (const row of filtered) {
      const stamp = row[mode] || 0
      const key = stamp ? new Date(stamp).toISOString().slice(0, 10) : 'unknown'
      next.set(key, [...(next.get(key) || []), row])
    }
    return Array.from(next.entries())
  }, [filtered, mode])

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000
  const todayCount = rows.filter((row) => row.updatedAt >= todayStart.getTime()).length
  const weekCount = rows.filter((row) => row.updatedAt >= weekStart).length

  const openRow = async (row: PropertyTableRow) => {
    if (!vaultPath) return
    await openFile(`${vaultPath}/${row.filePath}`)
    setMainView('editor')
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--editor-bg)', color: 'var(--text-primary)' }}>
      <div style={{ flexShrink: 0, padding: '22px 28px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, lineHeight: 1.2, fontWeight: 700 }}>{t('timeline.title')}</h1>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
              {t('timeline.summary', { count: rows.length, today: todayCount, week: weekCount })}
            </div>
          </div>
          <button
            onClick={() => loadRows()}
            disabled={loading}
            style={{ height: 30, padding: '0 11px', border: '1px solid var(--border-subtle)', borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, cursor: loading ? 'default' : 'pointer' }}
          >
            {loading ? t('timeline.loading') : t('timeline.refresh')}
          </button>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('timeline.searchPlaceholder')}
            style={{ width: 300, maxWidth: '100%', height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: 'none', fontSize: 12 }}
          />
          <div style={{ display: 'flex', padding: 2, borderRadius: 7, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            {(['updatedAt', 'createdAt'] as TimelineMode[]).map((item) => (
              <button
                key={item}
                onClick={() => setMode(item)}
                style={{ height: 26, padding: '0 10px', border: 'none', borderRadius: 5, background: mode === item ? 'var(--accent-muted)' : 'transparent', color: mode === item ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12 }}
              >
                {item === 'updatedAt' ? t('timeline.updated') : t('timeline.created')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px 36px' }}>
        {groups.length === 0 ? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            {t('timeline.empty')}
          </div>
        ) : (
          <div style={{ maxWidth: 920, margin: '0 auto' }}>
            {groups.map(([day, items]) => {
              const stamp = items[0]?.[mode] || 0
              return (
                <section key={day} style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: 18, marginBottom: 22 }}>
                  <div style={{ position: 'sticky', top: 0, height: 24, paddingTop: 3, fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                    {stamp ? formatDay(stamp) : t('timeline.unknownDate')}
                  </div>
                  <div style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: 18 }}>
                    {items.map((row) => {
                      const tags = getTextValues(row.properties.tags).slice(0, 3)
                      return (
                        <button
                          key={row.id}
                          onClick={() => openRow(row)}
                          style={{ width: '100%', minHeight: 54, marginBottom: 8, display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr) auto', alignItems: 'center', gap: 12, border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', padding: '9px 12px' }}
                        >
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{row[mode] ? formatTime(row[mode]) : '--:--'}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600 }}>{row.title}</span>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3, fontSize: 11, color: 'var(--text-tertiary)' }}>{getFolder(row.filePath) || t('timeline.root')}</span>
                          </span>
                          <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', minWidth: 0 }}>
                            {tags.map((tag) => (
                              <span key={tag} style={{ maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 6px', borderRadius: 999, background: 'var(--accent-muted)', color: 'var(--accent-text)', fontSize: 10 }}>{tag}</span>
                            ))}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
