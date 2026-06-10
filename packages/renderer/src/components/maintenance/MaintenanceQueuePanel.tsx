import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { toast } from '../../stores/toast-store'
import { MaintenanceFeedbackChart, MaintenanceHealthTrendPanel, MaintenanceQueueComposition } from './MaintenanceCharts'
import type {
  AppLanguage,
  KnowledgeMaintenanceItem,
  KnowledgeMaintenanceType,
  MaintenanceFeedbackStatus,
  MaintenanceFeedbackSummary,
  LongContextCognitiveReviewResult,
  MaintenanceApplyAction,
  MaintenanceApplyPreview,
  MaintenanceScanGroup,
  MaintenanceScanStatus,
  VaultHealthSummary
} from '@shared/types/ipc'
import './maintenance.css'

const TYPE_FILTERS: { value: 'all' | KnowledgeMaintenanceType; key: string }[] = [
  { value: 'all', key: 'all' },
  { value: 'fix_unresolved_link', key: 'fix_unresolved_link' },
  { value: 'connect_orphan', key: 'connect_orphan' },
  { value: 'link_unlinked_reference', key: 'link_unlinked_reference' },
  { value: 'review_overdue_tasks', key: 'review_overdue_tasks' },
  { value: 'review_due_today_tasks', key: 'review_due_today_tasks' },
  { value: 'review_high_priority_tasks', key: 'review_high_priority_tasks' },
  { value: 'review_scheduled_tasks', key: 'review_scheduled_tasks' },
  { value: 'review_started_tasks', key: 'review_started_tasks' },
  { value: 'review_blocked_tasks', key: 'review_blocked_tasks' },
  { value: 'review_recurring_tasks', key: 'review_recurring_tasks' },
  { value: 'review_upcoming_tasks', key: 'review_upcoming_tasks' },
  { value: 'review_open_tasks', key: 'review_open_tasks' },
  { value: 'resolve_duplicate_alias', key: 'resolve_duplicate_alias' },
  { value: 'fill_missing_property', key: 'fill_missing_property' },
  { value: 'refresh_memory', key: 'refresh_memory' },
  { value: 'fill_empty_note', key: 'fill_empty_note' },
  { value: 'resolve_duplicate_title', key: 'resolve_duplicate_title' },
  { value: 'split_large_note', key: 'split_large_note' },
  { value: 'maintain_bridge', key: 'maintain_bridge' }
]

const GROUP_FILTERS: { value: 'all' | MaintenanceScanGroup; key: string }[] = [
  { value: 'all', key: 'all' },
  { value: 'links', key: 'links' },
  { value: 'tasks', key: 'tasks' },
  { value: 'properties', key: 'properties' },
  { value: 'memory', key: 'memory' },
  { value: 'structure', key: 'structure' },
  { value: 'bridge', key: 'bridge' }
]

const ACTIONS_BY_TYPE: Record<KnowledgeMaintenanceType, MaintenanceApplyAction[]> = {
  fix_unresolved_link: ['open_note', 'create_target'],
  review_overdue_tasks: ['open_note', 'mark_done'],
  review_due_today_tasks: ['open_note', 'mark_done'],
  review_high_priority_tasks: ['open_note', 'mark_done'],
  review_scheduled_tasks: ['open_note', 'mark_done'],
  review_started_tasks: ['open_note', 'mark_done'],
  review_blocked_tasks: ['open_note', 'mark_done'],
  review_recurring_tasks: ['open_note', 'mark_done'],
  review_upcoming_tasks: ['open_note', 'mark_done'],
  connect_orphan: ['open_note', 'archive'],
  fill_empty_note: ['open_note', 'archive'],
  resolve_duplicate_title: ['open_note', 'add_alias'],
  resolve_duplicate_alias: ['open_note'],
  review_open_tasks: ['open_note', 'mark_done'],
  link_unlinked_reference: ['open_note'],
  refresh_memory: ['open_note'],
  split_large_note: ['open_note'],
  fill_missing_property: ['open_note'],
  maintain_bridge: ['open_note']
}

const MUTATING_ACTIONS = new Set<MaintenanceApplyAction>(['create_target', 'mark_done', 'archive', 'add_alias'])
const MAINTENANCE_SCAN_TYPES = Object.keys(ACTIONS_BY_TYPE) as KnowledgeMaintenanceType[]
const MAINTENANCE_SCAN_GROUPS: MaintenanceScanGroup[] = ['links', 'tasks', 'properties', 'memory', 'structure', 'bridge']

const MAINTENANCE_TYPES_BY_SCAN_GROUP: Record<MaintenanceScanGroup, KnowledgeMaintenanceType[]> = {
  links: ['fix_unresolved_link', 'connect_orphan', 'link_unlinked_reference'],
  tasks: [
    'review_overdue_tasks',
    'review_due_today_tasks',
    'review_high_priority_tasks',
    'review_scheduled_tasks',
    'review_started_tasks',
    'review_blocked_tasks',
    'review_recurring_tasks',
    'review_upcoming_tasks',
    'review_open_tasks'
  ],
  properties: ['resolve_duplicate_alias', 'fill_missing_property'],
  memory: ['refresh_memory'],
  structure: ['fill_empty_note', 'resolve_duplicate_title', 'split_large_note'],
  bridge: ['maintain_bridge']
}

const MAINTENANCE_SCAN_GROUP_BY_TYPE = new Map<KnowledgeMaintenanceType, MaintenanceScanGroup>(
  MAINTENANCE_SCAN_GROUPS.flatMap((group) =>
    MAINTENANCE_TYPES_BY_SCAN_GROUP[group].map((type) => [type, group] as const)
  )
)

type MaintenanceCounts = Partial<Record<KnowledgeMaintenanceType, number>>
type MaintenanceTypeFilter = 'all' | KnowledgeMaintenanceType
type MaintenanceGroupFilter = 'all' | MaintenanceScanGroup

export function buildMaintenanceAgentGoal(items: KnowledgeMaintenanceItem[], limit = 3): { goal: string; description: string } {
  const selected = items.slice(0, Math.max(1, limit))
  const lines = selected.map((item, index) => [
    `${index + 1}. ${item.type}: ${item.title}`,
    `   file: ${item.filePath}`,
    `   priority: ${item.priority}`,
    `   why: ${item.reason || item.detail || item.action}`
  ].join('\n'))
  return {
    goal: `Safely execute a maintenance batch for ${selected.length} high-priority item${selected.length === 1 ? '' : 's'}`,
    description: [
      'Use preview-first Agent steps. Read affected notes before writing, prefer structured step kinds such as create_link, apply_tag, update_frontmatter, rename_file, or task_update, and keep every write rollbackable.',
      '',
      ...lines
    ].join('\n')
  }
}

export function getMaintenanceScanGroupsForFilter(activeFilter: 'all' | KnowledgeMaintenanceType): MaintenanceScanGroup[] {
  if (activeFilter === 'all') return [...MAINTENANCE_SCAN_GROUPS]
  const group = MAINTENANCE_SCAN_GROUP_BY_TYPE.get(activeFilter)
  return group ? [group] : [...MAINTENANCE_SCAN_GROUPS]
}

export function getMaintenanceScanGroupsForSelection(
  activeGroupFilter: MaintenanceGroupFilter,
  activeTypeFilter: MaintenanceTypeFilter
): MaintenanceScanGroup[] {
  if (activeTypeFilter !== 'all') return getMaintenanceScanGroupsForFilter(activeTypeFilter)
  if (activeGroupFilter !== 'all') return [activeGroupFilter]
  return [...MAINTENANCE_SCAN_GROUPS]
}

export function getMaintenanceGroupCount(
  counts: MaintenanceCounts,
  activeGroupFilter: MaintenanceGroupFilter,
  allCount = 0
): number {
  if (activeGroupFilter === 'all') return allCount
  return MAINTENANCE_TYPES_BY_SCAN_GROUP[activeGroupFilter].reduce((total, type) => total + (counts[type] ?? 0), 0)
}

function getMaintenanceTypeFiltersForGroup(activeGroupFilter: MaintenanceGroupFilter): typeof TYPE_FILTERS {
  if (activeGroupFilter === 'all') return TYPE_FILTERS
  const types = new Set(MAINTENANCE_TYPES_BY_SCAN_GROUP[activeGroupFilter])
  return TYPE_FILTERS.filter((filter) => filter.value === 'all' || types.has(filter.value as KnowledgeMaintenanceType))
}

function getMaintenanceScanTypesForGroups(scanGroups: MaintenanceScanGroup[]): KnowledgeMaintenanceType[] {
  const types = new Set<KnowledgeMaintenanceType>()
  for (const group of scanGroups) {
    for (const type of MAINTENANCE_TYPES_BY_SCAN_GROUP[group]) types.add(type)
  }
  return Array.from(types)
}

function mergeMaintenanceCounts(base: MaintenanceCounts, next: MaintenanceCounts): MaintenanceCounts {
  const merged = { ...base }
  for (const type of MAINTENANCE_SCAN_TYPES) {
    const count = next[type]
    if (typeof count === 'number') merged[type] = (merged[type] ?? 0) + count
  }
  return merged
}

function mergeMaintenanceTypes(base: KnowledgeMaintenanceType[], next: KnowledgeMaintenanceType[]): KnowledgeMaintenanceType[] {
  return Array.from(new Set([...base, ...next]))
}

function sortMaintenanceItems(items: KnowledgeMaintenanceItem[]): KnowledgeMaintenanceItem[] {
  return [...items].sort((a, b) => b.priority - a.priority || a.filePath.localeCompare(b.filePath) || a.action.localeCompare(b.action))
}

function getPendingScanTypes(activeGroupFilter: MaintenanceGroupFilter, activeTypeFilter: MaintenanceTypeFilter): KnowledgeMaintenanceType[] {
  if (activeTypeFilter !== 'all') return [activeTypeFilter]
  return getMaintenanceScanTypesForGroups(getMaintenanceScanGroupsForSelection(activeGroupFilter, activeTypeFilter))
}

function createPendingScanStatus(activeGroupFilter: MaintenanceGroupFilter, activeTypeFilter: MaintenanceTypeFilter): MaintenanceScanStatus {
  return {
    state: 'pending',
    completedTypes: [],
    pendingTypes: getPendingScanTypes(activeGroupFilter, activeTypeFilter),
    completedGroups: [],
    pendingGroups: getMaintenanceScanGroupsForSelection(activeGroupFilter, activeTypeFilter),
    updatedAt: Date.now()
  }
}

function createErrorScanStatus(error: unknown): MaintenanceScanStatus {
  return {
    state: 'error',
    completedTypes: [],
    pendingTypes: [],
    updatedAt: Date.now(),
    message: error instanceof Error ? error.message : String(error)
  }
}

function formatMaintenanceDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function localizeMaintenanceGeneratedText(value: string, language: AppLanguage): string {
  if (value.startsWith('Updated: ')) {
    const formatted = formatMaintenanceDateTime(value.slice('Updated: '.length))
    return language === 'en' ? `Updated: ${formatted}` : `更新于：${formatted}`
  }
  if (value.startsWith('更新于：')) {
    const formatted = formatMaintenanceDateTime(value.slice('更新于：'.length))
    return language === 'en' ? `Updated: ${formatted}` : `更新于：${formatted}`
  }
  return value
}

function formatMaintenanceTimestamp(value: number): string {
  return formatMaintenanceDateTime(new Date(value).toISOString())
}

function formatScanDuration(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return ''
  if (value < 1000) return `${Math.round(value)}ms`
  return `${(value / 1000).toFixed(1)}s`
}

function getMaintenancePriorityClass(priority: number): string {
  if (priority >= 85) return 'is-critical'
  if (priority >= 70) return 'is-high'
  return 'is-normal'
}

interface PendingMaintenancePreview {
  item: KnowledgeMaintenanceItem
  action: MaintenanceApplyAction
  payload?: Record<string, unknown>
  preview: MaintenanceApplyPreview
}

interface LastMaintenanceUndo {
  item: KnowledgeMaintenanceItem
  action: MaintenanceApplyAction
  undoToken: string
}

export function MaintenanceQueuePanel() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const language = useUIStore((s) => s.language)
  const sendToAgent = useUIStore((s) => s.sendToAgent)
  const [items, setItems] = useState<KnowledgeMaintenanceItem[]>([])
  const [counts, setCounts] = useState<Partial<Record<KnowledgeMaintenanceType, number>>>({})
  const [loading, setLoading] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [weeklyReview, setWeeklyReview] = useState<LongContextCognitiveReviewResult | null>(null)
  const [scanStatus, setScanStatus] = useState<MaintenanceScanStatus | null>(null)
  const [healthSummary, setHealthSummary] = useState<VaultHealthSummary | null>(null)
  const [feedbackSummary, setFeedbackSummary] = useState<MaintenanceFeedbackSummary | null>(null)
  const [activeGroupFilter, setActiveGroupFilter] = useState<MaintenanceGroupFilter>('all')
  const [activeTypeFilter, setActiveTypeFilter] = useState<MaintenanceTypeFilter>('all')
  const [pendingPreview, setPendingPreview] = useState<PendingMaintenancePreview | null>(null)
  const [lastUndo, setLastUndo] = useState<LastMaintenanceUndo | null>(null)
  const [insightsExpanded, setInsightsExpanded] = useState(false)
  const [queueExpanded, setQueueExpanded] = useState(false)
  const [queueVisibleCount, setQueueVisibleCount] = useState(20)
  const refreshSeq = useRef(0)
  const typeFilters = useMemo(() => getMaintenanceTypeFiltersForGroup(activeGroupFilter), [activeGroupFilter])
  const handleGroupFilterChange = useCallback((nextGroup: MaintenanceGroupFilter) => {
    setActiveGroupFilter(nextGroup)
    setActiveTypeFilter('all')
    setQueueExpanded(false)
    setQueueVisibleCount(20)
  }, [])
  const handleTypeFilterChange = useCallback((nextType: MaintenanceTypeFilter) => {
    setActiveTypeFilter(nextType)
    setQueueExpanded(false)
    if (nextType !== 'all') {
      setActiveGroupFilter(MAINTENANCE_SCAN_GROUP_BY_TYPE.get(nextType) ?? 'all')
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!vaultPath) return
    const seq = refreshSeq.current + 1
    refreshSeq.current = seq
    const isCurrentRefresh = () => refreshSeq.current === seq
    const scanGroups = getMaintenanceScanGroupsForSelection(activeGroupFilter, activeTypeFilter)
    const startedAt = Date.now()
    setLoading(true)
    setItems([])
    setCounts({})
    setHealthSummary(null)
    setFeedbackSummary(null)
    setScanStatus(createPendingScanStatus(activeGroupFilter, activeTypeFilter))
    try {
      window.api.invoke('vault:health-scan', { vaultPath })
        .then((summary) => {
          if (isCurrentRefresh()) setHealthSummary(summary)
        })
        .catch(() => {
          if (isCurrentRefresh()) setHealthSummary(null)
        })
      window.api.invoke('maintenance:get-feedback-summary', { vaultPath })
        .then((summary) => {
          if (isCurrentRefresh()) setFeedbackSummary(summary)
        })
        .catch(() => {
          if (isCurrentRefresh()) setFeedbackSummary(null)
        })
      if (activeTypeFilter !== 'all') {
        const result = await window.api.invoke('maintenance:get-queue', {
          vaultPath,
          type: activeTypeFilter,
          scanGroups,
          limit: 200,
          language
        })
        if (!isCurrentRefresh()) return
        setItems(result.items)
        setCounts(result.counts as MaintenanceCounts)
        setScanStatus(result.scan)
        return
      }

      let nextItems: KnowledgeMaintenanceItem[] = []
      let nextCounts: MaintenanceCounts = {}
      let completedTypes: KnowledgeMaintenanceType[] = []
      for (let index = 0; index < scanGroups.length; index += 1) {
        const group = scanGroups[index]
        const result = await window.api.invoke('maintenance:get-queue', {
          vaultPath,
          scanGroups: [group],
          limit: 200,
          language
        })
        if (!isCurrentRefresh()) return
        nextItems = sortMaintenanceItems([...nextItems, ...result.items]).slice(0, 200)
        nextCounts = mergeMaintenanceCounts(nextCounts, result.counts as MaintenanceCounts)
        completedTypes = mergeMaintenanceTypes(completedTypes, result.scan.completedTypes)

        const completedGroups = scanGroups.slice(0, index + 1)
        const pendingGroups = scanGroups.slice(index + 1)
        setItems(nextItems)
        setCounts(nextCounts)
        setScanStatus({
          state: pendingGroups.length > 0 ? 'partial' : 'complete',
          completedTypes,
          pendingTypes: getMaintenanceScanTypesForGroups(pendingGroups),
          completedGroups,
          pendingGroups,
          updatedAt: Date.now(),
          durationMs: Date.now() - startedAt
        })
      }
    } catch (err) {
      if (!isCurrentRefresh()) return
      setScanStatus(createErrorScanStatus(err))
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      if (isCurrentRefresh()) setLoading(false)
    }
  }, [vaultPath, activeGroupFilter, activeTypeFilter, language])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runFix = useCallback(async (
    item: KnowledgeMaintenanceItem,
    action: MaintenanceApplyAction,
    payload?: Record<string, unknown>,
    expectedBeforeHash?: string
  ) => {
    if (!vaultPath) return
    const applyPayload = expectedBeforeHash ? { ...(payload || {}), expectedBeforeHash } : payload
    const result = await window.api.invoke('maintenance:apply-fix', { vaultPath, item, action, mode: 'apply', payload: applyPayload, language })
    if (!result.ok) {
      toast(result.resultMessage, 'error')
      return
    }
    if (result.undoToken) setLastUndo({ item, action, undoToken: result.undoToken })
    toast(result.resultMessage, 'success')
    if (action === 'open_note' && result.filePath) {
      await useEditorStore.getState().openFile(`${vaultPath}/${result.filePath}`)
    }
    void refresh()
  }, [vaultPath, refresh, language])

  const previewFix = useCallback(async (item: KnowledgeMaintenanceItem, action: MaintenanceApplyAction, payload?: Record<string, unknown>) => {
    if (!vaultPath) return
    if (!MUTATING_ACTIONS.has(action)) {
      await runFix(item, action, payload)
      return
    }

    const result = await window.api.invoke('maintenance:apply-fix', { vaultPath, item, action, mode: 'preview', payload, language })
    if (!result.ok || !result.preview) {
      toast(result.resultMessage, 'error')
      return
    }
    setPendingPreview({ item, action, payload, preview: result.preview })
  }, [vaultPath, runFix, language])

  const undoLastFix = useCallback(async () => {
    if (!vaultPath || !lastUndo) return
    const result = await window.api.invoke('maintenance:apply-fix', {
      vaultPath,
      item: lastUndo.item,
      action: lastUndo.action,
      mode: 'undo',
      payload: { undoToken: lastUndo.undoToken },
      language
    })
    if (!result.ok) {
      toast(result.resultMessage, 'error')
      return
    }
    setLastUndo(null)
    toast(result.resultMessage, 'success')
    void refresh()
  }, [vaultPath, lastUndo, refresh, language])

  const recordFeedback = useCallback(async (item: KnowledgeMaintenanceItem, status: MaintenanceFeedbackStatus) => {
    if (!vaultPath) return
    const snoozeUntil = status === 'snoozed'
      ? Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
      : null
    try {
      await window.api.invoke('maintenance:record-feedback', { vaultPath, item, status, snoozeUntil })
      toast(t(`maintenance.feedback.toast.${status}`), 'success')
      void refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [vaultPath, refresh, t])

  const handOffBatchToAgent = useCallback(() => {
    const candidates = items.slice(0, 3)
    if (candidates.length === 0) {
      toast(t('maintenance.agentBatch.empty'), 'info')
      return
    }
    sendToAgent(buildMaintenanceAgentGoal(candidates, 3))
  }, [items, sendToAgent, t])

  const generateWeeklyReview = useCallback(async (write: boolean) => {
    if (!vaultPath) return
    if (write) setReviewSaving(true)
    else setReviewLoading(true)
    try {
      const result = await window.api.invoke('long-context:generate-cognitive-review', { vaultPath, write })
      setWeeklyReview(result)
      if (write && result.filePath) {
        toast(t('maintenance.weeklyReview.saved', { filePath: result.filePath }), 'success')
        await useEditorStore.getState().openFile(`${vaultPath}/${result.filePath}`)
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      if (write) setReviewSaving(false)
      else setReviewLoading(false)
    }
  }, [vaultPath, t])

  const grouped = useMemo(() => items, [items])
  const priorityItems = useMemo(() => grouped.slice(0, 3), [grouped])
  const remainingItems = useMemo(() => grouped.slice(priorityItems.length), [grouped, priorityItems.length])

  return (
    <div className="maintenance-panel">
      <div className="maintenance-panel__header">
        <div className="maintenance-panel__header-left">
          <h2 className="maintenance-panel__title">{t('maintenance.title')}</h2>
        </div>
        <div className="maintenance-panel__header-actions">
          <button
            type="button"
            className="maintenance-panel__refresh"
            onClick={handOffBatchToAgent}
            disabled={!vaultPath || items.length === 0}
            title={t('maintenance.agentBatch.title')}
          >
            {t('maintenance.agentBatch.action')}
          </button>
          {lastUndo && (
            <button
              type="button"
              className="maintenance-panel__refresh"
              onClick={() => void undoLastFix()}
              disabled={!vaultPath}
            >
              {t('maintenance.undoLast')}
            </button>
          )}
          <button
            type="button"
            className="maintenance-panel__refresh"
            onClick={() => void refresh()}
            disabled={loading || !vaultPath}
          >
            {loading ? t('maintenance.refreshing') : t('maintenance.refresh')}
          </button>
        </div>
      </div>
      <MaintenanceQueueToolbar
        itemCount={items.length}
        priorityCount={priorityItems.length}
        activeGroupFilter={activeGroupFilter}
        activeTypeFilter={activeTypeFilter}
        counts={counts}
        typeFilters={typeFilters}
        onGroupFilterChange={handleGroupFilterChange}
        onTypeFilterChange={handleTypeFilterChange}
        loading={loading}
      />
      {vaultPath && scanStatus && <MaintenanceScanStatusBar status={scanStatus} itemCount={items.length} />}
      <div className="maintenance-panel__body">
        {!vaultPath && <div className="maintenance-panel__empty">{t('maintenance.noVault')}</div>}
        {vaultPath && grouped.length === 0 && !loading && (
          <div className="maintenance-panel__empty">{t('maintenance.empty')}</div>
        )}
        {vaultPath && priorityItems.length > 0 && (
              <section className="maintenance-panel__today" aria-labelledby="maintenance-today-title">
                <div className="maintenance-panel__today-head">
                  <h3 id="maintenance-today-title">{t('maintenance.today.title')}</h3>
                  <div className="maintenance-panel__today-head-actions">
                    <span>{t('maintenance.today.count', { count: priorityItems.length })}</span>
                  </div>
                </div>
                <div className="maintenance-panel__today-list">
                  {priorityItems.map((item, idx) => (
                    <MaintenanceItemCard
                      key={`${item.filePath}-${item.type}-priority-${idx}`}
                      item={item}
                      rank={idx + 1}
                      onAction={(action) => void previewFix(item, action)}
                      onFeedback={(status) => void recordFeedback(item, status)}
                      onFocusInBases={() => useUIStore.getState().focusInBases(item.filePath)}
                    />
                  ))}
                </div>
              </section>
            )}
            {vaultPath && remainingItems.length > 0 && (
              <section
                className={`maintenance-panel__queue-list is-summary-only${queueExpanded ? ' is-expanded' : ''}`}
                aria-label={t('maintenance.today.remaining', { count: remainingItems.length })}
              >
                <div className="maintenance-panel__section-label">
                  {t('maintenance.queueMore.title')}
                </div>
                <div className="maintenance-panel__queue-summary">
                  <div>
                    <strong>{remainingItems.length.toLocaleString()}</strong>
                    <span>{t('maintenance.today.remaining', { count: remainingItems.length })}</span>
                  </div>
                  <button
                    type="button"
                    className="maintenance-panel__more-btn"
                    onClick={() => setQueueExpanded((expanded) => !expanded)}
                    aria-expanded={queueExpanded}
                  >
                    {queueExpanded ? t('maintenance.queueMore.collapse') : t('maintenance.queueMore.action')}
                  </button>
                </div>
                {queueExpanded && (
                  <>
                    <div className="maintenance-panel__queue-list-items">
                      {remainingItems.slice(0, queueVisibleCount).map((item, idx) => (
                        <MaintenanceItemCard
                          key={`${item.filePath}-${item.type}-rest-${idx}`}
                          item={item}
                          onAction={(action) => void previewFix(item, action)}
                          onFeedback={(status) => void recordFeedback(item, status)}
                          onFocusInBases={() => useUIStore.getState().focusInBases(item.filePath)}
                        />
                      ))}
                    </div>
                    {queueVisibleCount < remainingItems.length && (
                      <div className="maintenance-panel__queue-load-more">
                        <button
                          type="button"
                          className="maintenance-panel__load-more-btn"
                          onClick={() => setQueueVisibleCount((prev) => prev + 20)}
                        >
                          {t('maintenance.queueMore.loadMore', { count: Math.min(20, remainingItems.length - queueVisibleCount) })}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
            {vaultPath && (
              <MaintenanceInsightsPanel
                expanded={insightsExpanded}
                onToggle={() => setInsightsExpanded((expanded) => !expanded)}
                healthSummary={healthSummary}
                feedbackSummary={feedbackSummary}
                itemCount={items.length}
                counts={counts}
                review={weeklyReview}
                reviewLoading={reviewLoading}
                reviewSaving={reviewSaving}
                onGenerateReview={() => void generateWeeklyReview(false)}
                onSaveReview={() => void generateWeeklyReview(true)}
              />
            )}
          </div>
        {pendingPreview && (
          <MaintenancePreviewModal
            pending={pendingPreview}
            onCancel={() => setPendingPreview(null)}
            onConfirm={async () => {
              const pending = pendingPreview
              setPendingPreview(null)
              await runFix(pending.item, pending.action, pending.payload, pending.preview.beforeHash)
            }}
          />
        )}
      </div>
  )
}

interface MaintenanceScanStatusBarProps {
  status: MaintenanceScanStatus
  itemCount: number
}

interface MaintenanceQueueToolbarProps {
  itemCount: number
  priorityCount: number
  activeGroupFilter: MaintenanceGroupFilter
  activeTypeFilter: MaintenanceTypeFilter
  counts: Partial<Record<KnowledgeMaintenanceType, number>>
  typeFilters: typeof TYPE_FILTERS
  onGroupFilterChange: (filter: MaintenanceGroupFilter) => void
  onTypeFilterChange: (filter: MaintenanceTypeFilter) => void
  loading: boolean
}

interface WeeklyReviewPanelProps {
  review: LongContextCognitiveReviewResult | null
  loading: boolean
  saving: boolean
  onGenerate: () => void
  onSave: () => void
}

interface MaintenanceInsightsPanelProps {
  expanded: boolean
  onToggle: () => void
  healthSummary: VaultHealthSummary | null
  feedbackSummary: MaintenanceFeedbackSummary | null
  itemCount: number
  counts: Partial<Record<KnowledgeMaintenanceType, number>>
  review: LongContextCognitiveReviewResult | null
  reviewLoading: boolean
  reviewSaving: boolean
  onGenerateReview: () => void
  onSaveReview: () => void
}

function getWeeklyFeedbackTotal(feedbackSummary: MaintenanceFeedbackSummary | null): number {
  const weeklyFeedback = feedbackSummary?.last7Days
  if (!weeklyFeedback) return 0
  return weeklyFeedback.done + weeklyFeedback.skipped + weeklyFeedback.snoozed + weeklyFeedback.not_relevant
}

function MaintenanceQueueToolbar({
  itemCount,
  priorityCount,
  activeGroupFilter,
  activeTypeFilter,
  counts,
  typeFilters,
  onGroupFilterChange,
  onTypeFilterChange,
  loading
}: MaintenanceQueueToolbarProps) {
  const { t } = useTranslation()
  const selectedScopeCount = getMaintenanceGroupCount(counts, activeGroupFilter, itemCount)
  return (
    <section className="maintenance-panel__queuebar" aria-label={t('maintenance.summary.title')}>
      <div className="maintenance-panel__queuebar-top">
        <div className="maintenance-panel__queuebar-copy">
          <span>{loading ? t('maintenance.refreshing') : t('maintenance.summary.title')}</span>
          <strong>{itemCount.toLocaleString()}</strong>
          <small>
            {t('maintenance.summary.ready')} / {t('maintenance.summary.priority')} {priorityCount.toLocaleString()}
          </small>
        </div>
        <label className="maintenance-panel__filter-select">
          <select
            value={activeTypeFilter}
            onChange={(event) => onTypeFilterChange(event.currentTarget.value as MaintenanceTypeFilter)}
            aria-label={t('maintenance.filters.types')}
          >
            {typeFilters.map((filter) => {
              const count = filter.value === 'all'
                ? selectedScopeCount
                : counts[filter.value as KnowledgeMaintenanceType] ?? 0
              return (
                <option key={filter.value} value={filter.value}>
                  {t(`maintenance.filters.${filter.key}`)} ({count})
                </option>
              )
            })}
          </select>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </label>
      </div>
      <div className="maintenance-panel__filters" aria-label={t('maintenance.filters.label')}>
        <div className="maintenance-panel__group-filters" role="list" aria-label={t('maintenance.filters.groups')}>
          {GROUP_FILTERS.map((filter) => {
            const count = getMaintenanceGroupCount(counts, filter.value, itemCount)
            return (
              <button
                key={filter.value}
                type="button"
                className={`maintenance-panel__group-filter${activeGroupFilter === filter.value ? ' is-active' : ''}`}
                onClick={() => onGroupFilterChange(filter.value)}
                aria-pressed={activeGroupFilter === filter.value}
              >
                <span>{t(`maintenance.filterGroups.${filter.key}`)}</span>
                <small>{count.toLocaleString()}</small>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function MaintenanceInsightsPanel({
  expanded,
  onToggle,
  healthSummary,
  feedbackSummary,
  itemCount,
  counts,
  review,
  reviewLoading,
  reviewSaving,
  onGenerateReview,
  onSaveReview
}: MaintenanceInsightsPanelProps) {
  const { t } = useTranslation()
  const weeklyTotal = getWeeklyFeedbackTotal(feedbackSummary)
  return (
    <section className={`maintenance-insights${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="maintenance-insights__summary"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="maintenance-insights__copy">
          <strong>{t('maintenance.insights.title')}</strong>
          <span>{t('maintenance.insights.subtitle')}</span>
        </span>
        <span className="maintenance-insights__metrics">
          <span>
            <strong>{healthSummary?.score ?? '--'}</strong>
            <small>{t('maintenance.summary.health')}</small>
          </span>
          <span>
            <strong>{weeklyTotal.toLocaleString()}</strong>
            <small>{t('maintenance.summary.reviewed')}</small>
          </span>
        </span>
        <svg className="maintenance-insights__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="maintenance-insights__details">
          {healthSummary && (
            <MaintenanceHealthTrendPanel summary={healthSummary} feedbackSummary={feedbackSummary} />
          )}
          <MaintenanceQueueComposition itemCount={itemCount} counts={counts} typeFilters={TYPE_FILTERS} />
          <MaintenanceFeedbackChart feedbackSummary={feedbackSummary} />
          <WeeklyReviewPanel
            review={review}
            loading={reviewLoading}
            saving={reviewSaving}
            onGenerate={onGenerateReview}
            onSave={onSaveReview}
          />
        </div>
      )}
    </section>
  )
}

function WeeklyReviewPanel({ review, loading, saving, onGenerate, onSave }: WeeklyReviewPanelProps) {
  const { t } = useTranslation()
  const stats = review?.stats
  return (
    <section className="maintenance-weekly-review" aria-labelledby="maintenance-weekly-review-title">
      <div className="maintenance-weekly-review__head">
        <div>
          <h3 id="maintenance-weekly-review-title">{t('maintenance.weeklyReview.title')}</h3>
          <p>{t('maintenance.weeklyReview.desc')}</p>
        </div>
        <div className="maintenance-weekly-review__actions">
          <button type="button" className="maintenance-card__btn" onClick={onGenerate} disabled={loading || saving}>
            {loading ? t('maintenance.weeklyReview.generating') : t('maintenance.weeklyReview.generate')}
          </button>
          <button type="button" className="maintenance-card__btn" onClick={onSave} disabled={loading || saving}>
            {saving ? t('maintenance.weeklyReview.saving') : t('maintenance.weeklyReview.save')}
          </button>
        </div>
      </div>
      {review && (
        <>
          <div className="maintenance-weekly-review__stats">
            <span>{t('maintenance.weeklyReview.stats.relations', { count: stats?.newRelations ?? 0 })}</span>
            <span>{t('maintenance.weeklyReview.stats.themes', { count: stats?.themeChanges ?? 0 })}</span>
            <span>{t('maintenance.weeklyReview.stats.blockers', { count: stats?.blockers ?? 0 })}</span>
            <span>{t('maintenance.weeklyReview.stats.resurfaced', { count: stats?.resurfacedContexts ?? 0 })}</span>
          </div>
          <pre className="maintenance-weekly-review__preview">{review.markdown}</pre>
        </>
      )}
    </section>
  )
}

function MaintenanceScanStatusBar({ status, itemCount }: MaintenanceScanStatusBarProps) {
  const { t } = useTranslation()
  const duration = formatScanDuration(status.durationMs)
  const completed = status.completedGroups?.length ?? status.completedTypes.length
  const pending = status.pendingGroups?.length ?? status.pendingTypes.length
  const total = completed + pending
  const detail = status.state === 'error'
    ? t('maintenance.scan.error.detail', { message: status.message || t('maintenance.scan.error.unknown') })
    : status.state === 'partial'
      ? t('maintenance.scan.partial.detail', { completed, pending, total })
      : status.state === 'pending'
        ? t('maintenance.scan.pending.detail')
        : t('maintenance.scan.complete.detail', {
          count: itemCount,
          duration: duration ? t('maintenance.scan.duration', { duration }) : ''
        })

  return (
    <div className={`maintenance-panel__scan is-${status.state}`} role={status.state === 'error' ? 'alert' : 'status'}>
      <div className="maintenance-panel__scan-main">
        <span className="maintenance-panel__scan-dot" aria-hidden="true" />
        <span className="maintenance-panel__scan-label">
          {status.state === 'complete'
            ? t('maintenance.scan.complete.label', { time: formatMaintenanceTimestamp(status.updatedAt) })
            : t(`maintenance.scan.${status.state}.label`)}
        </span>
      </div>
      <span className="maintenance-panel__scan-detail">{detail}</span>
    </div>
  )
}

interface MaintenanceItemCardProps {
  item: KnowledgeMaintenanceItem
  rank?: number
  onAction: (action: MaintenanceApplyAction) => void
  onFeedback: (status: MaintenanceFeedbackStatus) => void
  onFocusInBases: () => void
}

function MaintenanceItemCard({ item, rank, onAction, onFeedback, onFocusInBases }: MaintenanceItemCardProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)
  const actions = ACTIONS_BY_TYPE[item.type] || ['open_note']
  const detail = localizeMaintenanceGeneratedText(item.detail || item.reason, language)
  const priorityClass = getMaintenancePriorityClass(item.priority)

  return (
    <div className={`maintenance-card ${priorityClass}`}>
      <div className="maintenance-card__header">
        <div className="maintenance-card__meta">
          {rank != null && <span className="maintenance-card__rank">{rank}</span>}
          <span className="maintenance-card__type">{t(`maintenance.types.${item.type}`)}</span>
          {item.priority >= 80 && (
            <span className="maintenance-card__priority">{item.priority}</span>
          )}
        </div>
      </div>
      <div className="maintenance-card__body">
        <div className="maintenance-card__title">{item.title}</div>
        {detail && <div className="maintenance-card__detail">{detail}</div>}
        <div className="maintenance-card__path">{item.filePath}</div>
      </div>
      <div className="maintenance-card__actions">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className={`maintenance-card__btn${MUTATING_ACTIONS.has(action) ? ' is-mutating' : ''}`}
            onClick={() => onAction(action)}
          >
            {t(`maintenance.actions.${action}`)}
          </button>
        ))}
        <select
          className="maintenance-card__feedback-select"
          defaultValue=""
          aria-label={t('maintenance.feedback.label')}
          onChange={(event) => {
            const status = event.currentTarget.value as MaintenanceFeedbackStatus
            if (!status) return
            onFeedback(status)
            event.currentTarget.value = ''
          }}
        >
          <option value="" disabled>{t('maintenance.feedback.label')}</option>
          <option value="done">{t('maintenance.feedback.done')}</option>
          <option value="snoozed">{t('maintenance.feedback.snoozed')}</option>
          <option value="skipped">{t('maintenance.feedback.skipped')}</option>
          <option value="not_relevant">{t('maintenance.feedback.not_relevant')}</option>
        </select>
      </div>
    </div>
  )
}

interface MaintenancePreviewModalProps {
  pending: PendingMaintenancePreview
  onConfirm: () => void
  onCancel: () => void
}

function MaintenancePreviewModal({ pending, onConfirm, onCancel }: MaintenancePreviewModalProps) {
  const { t } = useTranslation()

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="maintenance-preview" role="presentation" onClick={onCancel}>
      <div
        className="maintenance-preview__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintenance-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="maintenance-preview__header">
          <div>
            <h3 id="maintenance-preview-title">{t('maintenance.preview.title')}</h3>
            <div className="maintenance-preview__summary">{pending.preview.summary}</div>
          </div>
          <button type="button" className="maintenance-preview__icon-btn" onClick={onCancel} aria-label={t('maintenance.preview.cancel')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="maintenance-preview__path">{pending.preview.filePath}</div>
        <div className="maintenance-preview__grid">
          <div className="maintenance-preview__pane">
            <div className="maintenance-preview__label">{t('maintenance.preview.before')}</div>
            <pre>{pending.preview.before ?? t('maintenance.preview.noExistingFile')}</pre>
          </div>
          <div className="maintenance-preview__pane">
            <div className="maintenance-preview__label">{t('maintenance.preview.after')}</div>
            <pre>{pending.preview.after ?? t('maintenance.preview.noResult')}</pre>
          </div>
        </div>
        <div className="maintenance-preview__actions">
          <button type="button" className="maintenance-preview__button" onClick={onCancel}>
            {t('maintenance.preview.cancel')}
          </button>
          <button type="button" className="maintenance-preview__button is-primary" onClick={onConfirm} autoFocus>
            {t('maintenance.preview.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
