import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { toast } from '../../stores/toast-store'
import { ConfirmModal } from '../ConfirmModal'
import type {
  KnowledgeMaintenanceItem,
  KnowledgeMaintenanceType,
  MaintenanceApplyAction
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

export function MaintenanceQueuePanel() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [items, setItems] = useState<KnowledgeMaintenanceItem[]>([])
  const [counts, setCounts] = useState<Partial<Record<KnowledgeMaintenanceType, number>>>({})
  const [loading, setLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState<'all' | KnowledgeMaintenanceType>('all')
  const [pendingBatch, setPendingBatch] = useState<{ targets: KnowledgeMaintenanceItem[]; action: MaintenanceApplyAction } | null>(null)

  const refresh = useCallback(async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const result = await window.api.invoke('maintenance:get-queue', {
        vaultPath,
        type: activeFilter === 'all' ? undefined : activeFilter,
        limit: 200
      })
      setItems(result.items)
      setCounts(result.counts as Partial<Record<KnowledgeMaintenanceType, number>>)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [vaultPath, activeFilter])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runFix = useCallback(async (item: KnowledgeMaintenanceItem, action: MaintenanceApplyAction, payload?: Record<string, unknown>) => {
    if (!vaultPath) return
    const result = await window.api.invoke('maintenance:apply-fix', { vaultPath, item, action, payload })
    if (!result.ok) {
      toast(result.resultMessage, 'error')
      return
    }
    toast(result.resultMessage, 'success')
    if (action === 'open_note' && result.filePath) {
      await useEditorStore.getState().openFile(`${vaultPath}/${result.filePath}`)
    }
    void refresh()
  }, [vaultPath, refresh])

  const grouped = useMemo(() => items, [items])

  return (
    <div className="maintenance-panel">
      <div className="maintenance-panel__header">
        <span className="maintenance-panel__title">{t('maintenance.title')}</span>
        <button
          type="button"
          className="maintenance-panel__refresh"
          onClick={() => void refresh()}
          disabled={loading || !vaultPath}
        >
          {loading ? t('maintenance.refreshing') : t('maintenance.refresh')}
        </button>
      </div>
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
        {grouped.map((item, idx) => (
          <MaintenanceItemCard
            key={`${item.filePath}-${item.type}-${idx}`}
            item={item}
            onAction={(action) => {
              if (action === 'mark_done') {
                setPendingBatch({ targets: [item], action })
                return
              }
              void runFix(item, action)
            }}
          />
        ))}
      </div>
      {pendingBatch && (
        <ConfirmModal
          open={Boolean(pendingBatch)}
          title={t('maintenance.confirm.markDoneTitle')}
          message={t('maintenance.confirm.markDoneMessage', { count: pendingBatch.targets.length })}
          confirmText={t('maintenance.confirm.confirm')}
          onCancel={() => setPendingBatch(null)}
          onConfirm={async () => {
            const targets = pendingBatch.targets
            const action = pendingBatch.action
            setPendingBatch(null)
            for (const target of targets) {
              await runFix(target, action)
            }
          }}
        />
      )}
    </div>
  )
}

interface MaintenanceItemCardProps {
  item: KnowledgeMaintenanceItem
  onAction: (action: MaintenanceApplyAction) => void
}

function MaintenanceItemCard({ item, onAction }: MaintenanceItemCardProps) {
  const { t } = useTranslation()
  const actions = ACTIONS_BY_TYPE[item.type] || ['open_note']
  return (
    <div className="maintenance-card">
      <div className="maintenance-card__head">
        <span className="maintenance-card__type">{t(`maintenance.types.${item.type}`)}</span>
        <span className="maintenance-card__priority">{item.priority}</span>
      </div>
      <div className="maintenance-card__title">{item.title}</div>
      <div className="maintenance-card__detail">{item.detail || item.reason}</div>
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
      </div>
    </div>
  )
}
