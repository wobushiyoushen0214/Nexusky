import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import type { PropertyTableRow } from '@shared/types/ipc'
import { Button } from '../ui/button'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

type TimelineMode = 'updatedAt' | 'createdAt'

function formatDay(value: number): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short'
  })
}

function formatDayNumber(value: number): string {
  return new Date(value).toLocaleDateString(undefined, { day: '2-digit' })
}

function formatMonth(value: number): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
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
      <div className="glass-divider-bottom" style={{ flexShrink: 0, padding: '24px 30px 18px', borderBottom: '0', boxShadow: 'var(--glass-divider-shadow-bottom)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 24, alignItems: 'end' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 720, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{mode === 'updatedAt' ? t('timeline.updatedTrack') : t('timeline.createdTrack')}</div>
            <h1 style={{ margin: '7px 0 0', fontSize: 24, lineHeight: 1.15, fontWeight: 760 }}>{t('timeline.title')}</h1>
            <div style={{ marginTop: 7, fontSize: 12, color: 'var(--text-tertiary)' }}>
              {t('timeline.summary', { count: rows.length, today: todayCount, week: weekCount })}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 18, alignItems: 'end' }}>
            <TimelineMetric label={t('timeline.totalMetric')} value={rows.length} />
            <TimelineMetric label={t('timeline.todayMetric')} value={todayCount} />
            <TimelineMetric label={t('timeline.weekMetric')} value={weekCount} />
          </div>
        </div>
        <div style={{ maxWidth: 1080, margin: '18px auto 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('timeline.searchPlaceholder')}
            style={{ width: 340, maxWidth: '100%', height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: 'none', fontSize: 12 }}
          />
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(value) => {
              if (value) setMode(value as TimelineMode)
            }}
            style={{ padding: 2, borderRadius: 7, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
          >
            {(['updatedAt', 'createdAt'] as TimelineMode[]).map((item) => (
              <ToggleGroupItem key={item} value={item} style={{ minHeight: 26, borderRadius: 5 }}>
                {item === 'updatedAt' ? t('timeline.updated') : t('timeline.created')}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            type="button"
            variant="outline"
            onClick={() => loadRows()}
            disabled={loading}
          >
            {loading ? t('timeline.loading') : t('timeline.refresh')}
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 30px 42px' }}>
        {groups.length === 0 ? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            {t('timeline.empty')}
          </div>
        ) : (
          <div style={{ maxWidth: 980, margin: '0 auto' }}>
            {groups.map(([day, items]) => {
              const stamp = items[0]?.[mode] || 0
              return (
                <section key={day} style={{ display: 'grid', gridTemplateColumns: '118px minmax(0, 1fr)', gap: 22, marginBottom: 30 }}>
                  <div style={{ position: 'sticky', top: 0, height: 62, paddingTop: 2 }}>
                    {stamp ? (
                      <>
                        <div style={{ fontSize: 30, lineHeight: 1, fontWeight: 760, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatDayNumber(stamp)}</div>
                        <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-tertiary)' }}>{formatMonth(stamp)}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 650 }}>{t('timeline.unknownDate')}</div>
                    )}
                  </div>
                  <div style={{ position: 'relative', paddingLeft: 20 }}>
                    <div style={{ position: 'absolute', left: 5, top: 6, bottom: -20, width: 2, borderRadius: 999, background: 'linear-gradient(180deg, transparent, var(--glass-divider-line-strong) 10%, var(--glass-divider-highlight) 50%, var(--glass-divider-line) 90%, transparent)', boxShadow: '0 0 10px color-mix(in srgb, var(--glass-highlight) 28%, transparent)' }} />
                    {items.map((row, index) => {
                      const tags = getTextValues(row.properties.tags).slice(0, 3)
                      return (
                        <Button
                          key={row.id}
                          type="button"
                          variant="ghost"
                          onClick={() => openRow(row)}
                          style={{ position: 'relative', width: '100%', height: 'auto', minHeight: 58, marginBottom: index === items.length - 1 ? 0 : 10, display: 'grid', gridTemplateColumns: '58px minmax(0, 1fr) auto', alignItems: 'center', justifyContent: 'stretch', gap: 14, border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', padding: '8px 10px' }}
                        >
                          <span style={{ position: 'absolute', left: -20, top: 25, width: 11, height: 11, borderRadius: 999, background: index === 0 ? 'var(--accent)' : 'var(--bg-elevated)', border: '1px solid var(--border-default)' }} />
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{row[mode] ? formatTime(row[mode]) : '--:--'}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 680 }}>{row.title}</span>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3, fontSize: 11, color: 'var(--text-tertiary)' }}>{getFolder(row.filePath) || t('timeline.root')}</span>
                          </span>
                          <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', minWidth: 0 }}>
                            {tags.map((tag) => (
                              <span key={tag} style={{ maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 6px', borderRadius: 999, background: 'var(--accent-muted)', color: 'var(--accent-text)', fontSize: 10 }}>{tag}</span>
                            ))}
                          </span>
                        </Button>
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

function TimelineMetric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ color: 'var(--text-primary)', fontSize: 18, lineHeight: 1.05, fontWeight: 740, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ marginTop: 4, color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}
