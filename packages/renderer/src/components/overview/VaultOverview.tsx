import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { AIUsageRecord, PropertyTableRow, VaultHealthSummary } from '@shared/types/ipc'
import { useVaultStore } from '../../stores/vault-store'
import { useOverviewData } from './hooks/useOverviewData'
import { OverviewCard } from './OverviewCard'
import { DonutChart } from '../maintenance/DonutChart'
import { DiaryHeatmapChart, TokenUsageAreaChart, type DiaryHeatmapPoint, type TokenUsagePoint } from './OverviewCharts'
import './vault-overview.css'

const DAY_MS = 24 * 60 * 60 * 1000
const TOKEN_WINDOW_DAYS = 30

function normalizeTimestamp(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function formatCompactTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return value.toLocaleString()
}

function buildTokenUsageSeries(records: AIUsageRecord[], days = TOKEN_WINDOW_DAYS): TokenUsagePoint[] {
  const today = startOfLocalDay(new Date())
  const byDate = new Map<string, TokenUsagePoint>()

  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(today.getTime() - offset * DAY_MS)
    const key = formatDateKey(date)
    byDate.set(key, {
      label: formatShortDate(date),
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    })
  }

  for (const record of records) {
    const timestamp = normalizeTimestamp(record.completedAt)
    if (!Number.isFinite(timestamp)) continue
    const key = formatDateKey(new Date(timestamp))
    const point = byDate.get(key)
    if (!point) continue

    point.inputTokens += Math.max(0, record.inputTokens || 0)
    point.outputTokens += Math.max(0, record.outputTokens || 0)
    point.totalTokens += Math.max(0, record.totalTokens || record.inputTokens + record.outputTokens || 0)
  }

  return Array.from(byDate.values())
}

function isDiaryNote(note: PropertyTableRow): boolean {
  const path = note.filePath.replace(/\\/g, '/').toLowerCase()
  const title = note.title.toLowerCase()
  const fileName = path.split('/').pop() || ''

  return /(^|\/)(daily|dailies|diary|diaries|journal|journals|日记)(\/|$)/.test(path) ||
    /(^|\/)\d{4}[-_/]\d{2}[-_/]\d{2}([\-_. ].*)?\.md$/.test(path) ||
    /(^|\/)\d{8}([\-_. ].*)?\.md$/.test(path) ||
    fileName.startsWith('daily-note') ||
    title.includes('日记') ||
    title.includes('daily note')
}

function buildDiaryHeatmap(notes: PropertyTableRow[]): {
  data: DiaryHeatmapPoint[]
  startDate: string
  endDate: string
  diaryCount: number
  editCount: number
} {
  const year = new Date().getFullYear()
  const yearStart = startOfLocalDay(new Date(year, 0, 1))
  const yearEnd = startOfLocalDay(new Date(year, 11, 31))
  const byDate = new Map<string, number>()

  for (const date = new Date(yearStart); date <= yearEnd; date.setDate(date.getDate() + 1)) {
    byDate.set(formatDateKey(date), 0)
  }

  const diaryNotes = notes.filter(isDiaryNote)
  let diaryCount = 0
  for (const note of diaryNotes) {
    const timestamp = normalizeTimestamp(note.updatedAt)
    if (!Number.isFinite(timestamp)) continue
    const key = formatDateKey(new Date(timestamp))
    if (!byDate.has(key)) continue
    diaryCount += 1
    byDate.set(key, (byDate.get(key) || 0) + 1)
  }

  const data = Array.from(byDate.entries()).map(([date, value]) => ({ date, value }))
  return {
    data,
    startDate: data[0]?.date || formatDateKey(yearStart),
    endDate: data[data.length - 1]?.date || formatDateKey(yearEnd),
    diaryCount,
    editCount: data.reduce((sum, point) => sum + point.value, 0)
  }
}

function buildCompositionData(
  health: VaultHealthSummary | null,
  fallbackNoteCount: number,
  labels: { active: string; orphan: string; stale: string }
) {
  const noteCount = health?.noteCount ?? fallbackNoteCount
  if (noteCount <= 0) return []

  const orphanCount = Math.min(Math.max(0, health?.orphanCount ?? 0), noteCount)
  const staleCapacity = Math.max(0, noteCount - orphanCount)
  const staleCount = Math.min(Math.max(0, health?.staleNoteCount ?? 0), staleCapacity)
  const activeCount = Math.max(0, noteCount - orphanCount - staleCount)

  return [
    { label: labels.active, value: activeCount, tone: 'high' as const },
    { label: labels.orphan, value: orphanCount, tone: 'medium' as const },
    { label: labels.stale, value: staleCount, tone: 'low' as const },
  ].filter((entry) => entry.value > 0)
}

export function VaultOverview() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const { data, loading, reload } = useOverviewData(vaultPath)
  const vaultName = vaultPath?.split(/[\\/]/).pop() || ''

  const tokenUsageData = useMemo(() => buildTokenUsageSeries(data.usageRecords), [data.usageRecords])
  const diaryHeatmap = useMemo(() => buildDiaryHeatmap(data.notes), [data.notes])
  const compositionData = useMemo(() => buildCompositionData(data.health, data.notes.length, {
    active: t('overviewPage.charts.composition.active'),
    orphan: t('overviewPage.charts.composition.orphan'),
    stale: t('overviewPage.charts.composition.stale'),
  }), [data.health, data.notes.length, t])

  const totalTokens = tokenUsageData.reduce((sum, point) => sum + point.totalTokens, 0)

  return (
    <div className="vault-overview">
      <div className="vault-overview__shell">
        <header className="vault-overview__header">
          <div>
            <span className="vault-overview__eyebrow">{vaultName}</span>
            <h1>{t('overviewPage.title')}</h1>
          </div>
          <div className="vault-overview__header-meta">
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading}
              aria-label={loading ? t('overviewPage.refreshing') : t('overviewPage.refresh')}
            >
              {loading ? t('overviewPage.refreshing') : t('overviewPage.refresh')}
            </button>
          </div>
        </header>

        <div className="vault-overview__dashboard">
          <OverviewCard
            title={t('overviewPage.charts.tokens.title')}
            subtitle={t('overviewPage.charts.tokens.subtitle', { count: formatCompactTokens(totalTokens) })}
            className="vault-overview__card--tokens"
          >
            <div className="vault-overview__chart-frame">
              <TokenUsageAreaChart
                data={tokenUsageData}
                inputLabel={t('overviewPage.charts.tokens.input')}
                outputLabel={t('overviewPage.charts.tokens.output')}
                className="vault-overview__chart"
              />
            </div>
          </OverviewCard>

          <OverviewCard
            title={t('overviewPage.charts.diary.title')}
            subtitle={t('overviewPage.charts.diary.subtitle', {
              count: diaryHeatmap.diaryCount,
              edits: diaryHeatmap.editCount
            })}
            className="vault-overview__card--diary"
          >
            <div className="vault-overview__chart-frame">
              <DiaryHeatmapChart
                data={diaryHeatmap.data}
                startDate={diaryHeatmap.startDate}
                endDate={diaryHeatmap.endDate}
                className="vault-overview__chart"
              />
            </div>
          </OverviewCard>

          <OverviewCard
            title={t('overviewPage.charts.composition.title')}
            subtitle={t('overviewPage.charts.composition.subtitle', { count: data.health?.noteCount ?? data.notes.length })}
            className="vault-overview__card--composition"
          >
            {compositionData.length > 0 ? (
              <DonutChart data={compositionData} className="vault-overview__chart vault-overview__chart--donut" />
            ) : (
              <div className="vault-overview__empty">{loading ? t('overviewPage.loading') : t('overviewPage.charts.composition.empty')}</div>
            )}
          </OverviewCard>
        </div>
      </div>
    </div>
  )
}
