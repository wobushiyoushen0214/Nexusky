import { useCallback, useEffect, useMemo, useState } from 'react'
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
  MaintenanceApplyPreview
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

function localizeMaintenanceGeneratedText(value: string, language: AppLanguage): string {
  if (language === 'en') return value
  if (value.startsWith('Updated: ')) return `更新于：${value.slice('Updated: '.length)}`
  return value
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
  const [activeFilter, setActiveFilter] = useState<'all' | KnowledgeMaintenanceType>('all')
  const [pendingPreview, setPendingPreview] = useState<PendingMaintenancePreview | null>(null)
  const [lastUndo, setLastUndo] = useState<LastMaintenanceUndo | null>(null)

  const refresh = useCallback(async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const result = await window.api.invoke('maintenance:get-queue', {
        vaultPath,
        type: activeFilter === 'all' ? undefined : activeFilter,
        limit: 200,
        language
      })
      setItems(result.items)
      setCounts(result.counts as Partial<Record<KnowledgeMaintenanceType, number>>)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setLoading(false)
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
