import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../../stores/vault-store'
import { useMaintenanceStore } from '../../stores/maintenance-store'
import type { KnowledgeMaintenanceItem } from '@shared/types/ipc'

export function MaintenanceSession() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const { currentSession, loading, processCurrentItem } = useMaintenanceStore()
  const [currentItem, setCurrentItem] = useState<KnowledgeMaintenanceItem | null>(null)

  useEffect(() => {
    if (vaultPath && currentSession) {
      // 获取当前待处理项
      void window.api.invoke('maintenance:session-next-item', {
        vaultPath,
        sessionId: currentSession.id
      }).then(setCurrentItem)
    }
  }, [vaultPath, currentSession])

  if (!currentSession || !vaultPath) {
    return null
  }

  if (!currentItem) {
    return (
      <div className="maintenance-session__empty">
        <p>{t('maintenance.session.noItems', '没有待处理的项目')}</p>
      </div>
    )
  }

  const progress = currentSession.currentIndex + 1
  const total = currentSession.remaining.length

  const handleAction = async (action: 'done' | 'skipped' | 'snoozed' | 'not_relevant') => {
    await processCurrentItem(vaultPath, action)

    // 获取下一项
    const nextItem = await window.api.invoke('maintenance:session-next-item', {
      vaultPath,
      sessionId: currentSession.id
    })
    setCurrentItem(nextItem)
  }

  return (
    <div className="maintenance-session">
      {/* 会话头部 - 进度 */}
      <header className="maintenance-session__header">
        <div className="session-progress">
          <span className="session-progress__current">{progress}</span>
          <span className="session-progress__separator">/</span>
          <span className="session-progress__total">{total}</span>
        </div>

        <div className="session-stats">
          <span className="session-stats__resolved">
            {t('maintenance.session.resolved', '已解决')}: {currentSession.stats.resolved}
          </span>
          <span className="session-stats__health">
            {t('maintenance.session.healthImprovement', '健康分')}: +{currentSession.stats.healthImprovement.toFixed(1)}
          </span>
        </div>

        <div className="session-progress-bar">
          <div
            className="session-progress-bar__fill"
            style={{ width: `${(progress / total) * 100}%` }}
          />
        </div>
      </header>

      {/* 当前维护项卡片 */}
      <div className="maintenance-session__current">
        <div className="current-item">
          <div className="current-item__header">
            <span className={`current-item__priority current-item__priority--${getPriorityLevel(currentItem.priority)}`}>
              {t('maintenance.priority', '优先级')}: {currentItem.priority}
            </span>
            <span className="current-item__type">
              {t(`maintenance.type.${currentItem.type}`, currentItem.type)}
            </span>
          </div>

          <h2 className="current-item__title">{currentItem.title}</h2>

          <div className="current-item__details">
            <p className="current-item__reason">{currentItem.reason}</p>
            <p className="current-item__detail">{currentItem.detail}</p>
          </div>

          <div className="current-item__file">
            <span className="current-item__file-icon">📄</span>
            <span className="current-item__file-path">{currentItem.filePath}</span>
          </div>

          {/* 操作按钮 */}
          <div className="current-item__actions">
            <button
              type="button"
              className="session-action-btn session-action-btn--primary"
              onClick={() => handleAction('done')}
              disabled={loading}
            >
              {t('maintenance.action.done', '完成')}
            </button>

            <button
              type="button"
              className="session-action-btn session-action-btn--secondary"
              onClick={() => handleAction('skipped')}
              disabled={loading}
            >
              {t('maintenance.action.skip', '跳过')}
            </button>

            <button
              type="button"
              className="session-action-btn session-action-btn--tertiary"
              onClick={() => handleAction('not_relevant')}
              disabled={loading}
            >
              {t('maintenance.action.notRelevant', '不相关')}
            </button>

            <button
              type="button"
              className="session-action-btn session-action-btn--tertiary"
              onClick={() => handleAction('snoozed')}
              disabled={loading}
            >
              {t('maintenance.action.snooze', '延后')}
            </button>
          </div>
        </div>
      </div>

      {/* Cluster 上下文（如果需要） */}
      <aside className="maintenance-session__context">
        <h3>{t('maintenance.session.context', '相关信息')}</h3>
        <div className="session-context">
          <div className="session-context__item">
            <span className="session-context__label">
              {t('maintenance.session.package', '当前批次')}:
            </span>
            <span className="session-context__value">
              {currentSession.package.title}
            </span>
          </div>
          <div className="session-context__item">
            <span className="session-context__label">
              {t('maintenance.session.affectedNotes', '受影响笔记')}:
            </span>
            <span className="session-context__value">
              {currentSession.stats.affectedNotes.length}
            </span>
          </div>
        </div>
      </aside>
    </div>
  )
}

function getPriorityLevel(priority: number): 'high' | 'medium' | 'low' {
  if (priority >= 80) return 'high'
  if (priority >= 60) return 'medium'
  return 'low'
}
