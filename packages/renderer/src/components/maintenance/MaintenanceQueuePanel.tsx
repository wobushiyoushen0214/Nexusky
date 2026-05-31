import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { toast } from '../../stores/toast-store'
import { RelatedContextPanel } from '../long-context/RelatedContextPanel'
import type {
  AppLanguage,
  KnowledgeMaintenanceItem,
  KnowledgeMaintenanceType,
  MaintenanceApplyAction,
  MaintenanceApplyPreview,
  MaintenanceScanGroup,
  MaintenanceScanStatus
} from '@shared/types/ipc'
import './maintenance.css'

const TYPE_FILTERS: { value: 'all' | KnowledgeMaintenanceType; key: string }[] = [
  { value: 'all', key: 'all' },
  { value: 'fix_unresolved_link', key: 'fix_unresolved_link' },
  { value: 'connect_orphan', key: 'connect_orphan' },
  { value: 'fill_empty_note', key: 'fill_empty_note' },
  { value: 'refresh_memory', key: 'refresh_memory' },
  { value: 'review_overdue_tasks', key: 'review_overdue_tasks' },
  { value: 'review_open_tasks', key: 'review_open_tasks' },
  { value: 'link_unlinked_reference', key: 'link_unlinked_reference' },
  { value: 'resolve_duplicate_title', key: 'resolve_duplicate_title' },
  { value: 'resolve_duplicate_alias', key: 'resolve_duplicate_alias' }
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

export function getMaintenanceScanGroupsForFilter(activeFilter: 'all' | KnowledgeMaintenanceType): MaintenanceScanGroup[] {
  if (activeFilter === 'all') return [...MAINTENANCE_SCAN_GROUPS]
  const group = MAINTENANCE_SCAN_GROUP_BY_TYPE.get(activeFilter)
  return group ? [group] : [...MAINTENANCE_SCAN_GROUPS]
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

function getPendingScanTypes(activeFilter: 'all' | KnowledgeMaintenanceType): KnowledgeMaintenanceType[] {
  return activeFilter === 'all' ? MAINTENANCE_SCAN_TYPES : [activeFilter]
}

function createPendingScanStatus(activeFilter: 'all' | KnowledgeMaintenanceType): MaintenanceScanStatus {
  return {
    state: 'pending',
    completedTypes: [],
    pendingTypes: getPendingScanTypes(activeFilter),
    completedGroups: [],
    pendingGroups: getMaintenanceScanGroupsForFilter(activeFilter),
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
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const content = useEditorStore((s) => s.content)
  const maintenancePanelSection = useUIStore((s) => s.maintenancePanelSection)
  const setMaintenancePanelSection = useUIStore((s) => s.setMaintenancePanelSection)
  const language = useUIStore((s) => s.language)
  const [items, setItems] = useState<KnowledgeMaintenanceItem[]>([])
  const [counts, setCounts] = useState<Partial<Record<KnowledgeMaintenanceType, number>>>({})
  const [loading, setLoading] = useState(false)
  const [scanStatus, setScanStatus] = useState<MaintenanceScanStatus | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | KnowledgeMaintenanceType>('all')
  const [pendingPreview, setPendingPreview] = useState<PendingMaintenancePreview | null>(null)
  const [lastUndo, setLastUndo] = useState<LastMaintenanceUndo | null>(null)
  const refreshSeq = useRef(0)

  const refresh = useCallback(async () => {
    if (!vaultPath) return
    const seq = refreshSeq.current + 1
    refreshSeq.current = seq
    const isCurrentRefresh = () => refreshSeq.current === seq
    const scanGroups = getMaintenanceScanGroupsForFilter(activeFilter)
    const startedAt = Date.now()
    setLoading(true)
    setItems([])
    setCounts({})
    setScanStatus(createPendingScanStatus(activeFilter))
    try {
      if (activeFilter !== 'all') {
        const result = await window.api.invoke('maintenance:get-queue', {
          vaultPath,
          type: activeFilter,
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
  }, [vaultPath, activeFilter, language])

  useEffect(() => {
    if (maintenancePanelSection !== 'queue') return
    void refresh()
  }, [refresh, maintenancePanelSection])

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

  const grouped = useMemo(() => items, [items])
  const priorityItems = useMemo(() => grouped.slice(0, 3), [grouped])
  const remainingItems = useMemo(() => grouped.slice(priorityItems.length), [grouped, priorityItems.length])

  return (
    <div className="maintenance-panel">
      <div className="maintenance-panel__header">
        <div className="maintenance-panel__tabs">
          <button
            type="button"
            className={`maintenance-panel__tab${maintenancePanelSection === 'context' ? ' is-active' : ''}`}
            onClick={() => setMaintenancePanelSection('context')}
          >
            {t('maintenance.tabs.context')}
          </button>
          <button
            type="button"
            className={`maintenance-panel__tab${maintenancePanelSection === 'queue' ? ' is-active' : ''}`}
            onClick={() => setMaintenancePanelSection('queue')}
          >
            {t('maintenance.tabs.queue')}
          </button>
        </div>
        {maintenancePanelSection === 'queue' && (
          <div className="maintenance-panel__header-actions">
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
        )}
      </div>
      {maintenancePanelSection === 'context' ? (
        currentFilePath ? (
          <RelatedContextPanel currentFilePath={currentFilePath} content={content} placement="side" />
        ) : (
          <div className="maintenance-panel__empty">{t('maintenance.contextEmpty')}</div>
        )
      ) : (
        <>
          <div className="maintenance-panel__filters">
            {TYPE_FILTERS.map((filter) => {
              const count = filter.value === 'all'
                ? items.length
                : counts[filter.value as KnowledgeMaintenanceType] ?? 0
              return (
                <button
                  key={filter.value}
                  type="button"
                  className={`maintenance-panel__filter${activeFilter === filter.value ? ' is-active' : ''}`}
                  onClick={() => setActiveFilter(filter.value)}
                >
                  {t(`maintenance.filters.${filter.key}`)}
                  <span className="maintenance-panel__filter-count">{count}</span>
                </button>
              )
            })}
          </div>
          {vaultPath && scanStatus && <MaintenanceScanStatusBar status={scanStatus} itemCount={items.length} />}
          <div className="maintenance-panel__body">
            {!vaultPath && <div className="maintenance-panel__empty">{t('maintenance.noVault')}</div>}
            {vaultPath && grouped.length === 0 && !loading && (
              <div className="maintenance-panel__empty">{t('maintenance.empty')}</div>
            )}
            {vaultPath && priorityItems.length > 0 && (
              <section className="maintenance-panel__today" aria-labelledby="maintenance-today-title">
                <div className="maintenance-panel__today-head">
                  <div>
                    <h3 id="maintenance-today-title">{t('maintenance.today.title')}</h3>
                    <p>{t('maintenance.today.desc')}</p>
                  </div>
                  <span>{t('maintenance.today.count', { count: priorityItems.length })}</span>
                </div>
                <div className="maintenance-panel__today-list">
                  {priorityItems.map((item, idx) => (
                    <MaintenanceItemCard
                      key={`${item.filePath}-${item.type}-priority-${idx}`}
                      item={item}
                      onAction={(action) => void previewFix(item, action)}
                      onFocusInBases={() => useUIStore.getState().focusInBases(item.filePath)}
                    />
                  ))}
                </div>
              </section>
            )}
            {vaultPath && remainingItems.length > 0 && (
              <div className="maintenance-panel__section-label">
                {t('maintenance.today.remaining', { count: remainingItems.length })}
              </div>
            )}
            {remainingItems.map((item, idx) => (
              <MaintenanceItemCard
                key={`${item.filePath}-${item.type}-rest-${idx}`}
                item={item}
                onAction={(action) => void previewFix(item, action)}
                onFocusInBases={() => useUIStore.getState().focusInBases(item.filePath)}
              />
            ))}
          </div>
        </>
      )}
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
  onAction: (action: MaintenanceApplyAction) => void
  onFocusInBases: () => void
}

function MaintenanceItemCard({ item, onAction, onFocusInBases }: MaintenanceItemCardProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)
  const actions = ACTIONS_BY_TYPE[item.type] || ['open_note']
  const detail = localizeMaintenanceGeneratedText(item.detail || item.reason, language)
  return (
    <div className="maintenance-card">
      <div className="maintenance-card__head">
        <span className="maintenance-card__type">{t(`maintenance.types.${item.type}`)}</span>
        <span className="maintenance-card__priority">{item.priority}</span>
      </div>
      <div className="maintenance-card__title">{item.title}</div>
      <div className="maintenance-card__detail">{detail}</div>
      <div className="maintenance-card__path">{item.filePath}</div>
      <div className="maintenance-card__actions">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className="maintenance-card__btn"
            onClick={() => onAction(action)}
          >
            {t(`maintenance.actions.${action}`)}
          </button>
        ))}
        <button
          type="button"
          className="maintenance-card__btn"
          onClick={onFocusInBases}
          title={t('maintenance.jumps.focusInBasesTitle')}
        >
          {t('maintenance.jumps.focusInBases')}
        </button>
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
            x
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
