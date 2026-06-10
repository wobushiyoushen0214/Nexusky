import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../../stores/vault-store'
import { useMaintenanceStore } from '../../stores/maintenance-store'

export function SessionSummary() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const { sessionSummary, startSession, setViewMode } = useMaintenanceStore()

  if (!sessionSummary || !vaultPath) {
    return null
  }

  const handleBackToOverview = () => {
    setViewMode('legacy')
  }

  const handleStartRecommended = () => {
    if (sessionSummary.nextRecommendation) {
      void startSession(vaultPath, sessionSummary.nextRecommendation.id)
    }
  }

  const durationMinutes = Math.round(sessionSummary.duration / 60)
  const healthDelta = sessionSummary.healthAfter - sessionSummary.healthBefore

  return (
    <div className="session-summary">
      <div className="session-summary__hero">
        <div className="session-summary__icon">✅</div>
        <h2 className="session-summary__title">
          {t('maintenance.summary.title', '维护完成')}
        </h2>
      </div>

      {/* 主要统计 */}
      <div className="session-summary__stats">
        <div className="summary-stat">
          <span className="summary-stat__value">{sessionSummary.itemsResolved}</span>
          <span className="summary-stat__label">
            {t('maintenance.summary.itemsResolved', '问题已解决')}
          </span>
        </div>

        <div className="summary-stat">
          <span className="summary-stat__value">{durationMinutes}</span>
          <span className="summary-stat__label">
            {t('maintenance.summary.duration', '分钟')}
          </span>
        </div>

        <div className="summary-stat summary-stat--highlight">
          <span className="summary-stat__value">
            +{healthDelta.toFixed(1)}
          </span>
          <span className="summary-stat__label">
            {t('maintenance.summary.healthImprovement', 'Vault Health')}
          </span>
        </div>
      </div>

      {/* 健康分对比 */}
      <div className="session-summary__health">
        <div className="health-comparison">
          <div className="health-comparison__before">
            <span className="health-comparison__label">
              {t('maintenance.summary.before', '之前')}
            </span>
            <span className="health-comparison__score">
              {Math.round(sessionSummary.healthBefore)}
            </span>
          </div>

          <div className="health-comparison__arrow">→</div>

          <div className="health-comparison__after">
            <span className="health-comparison__label">
              {t('maintenance.summary.after', '之后')}
            </span>
            <span className="health-comparison__score health-comparison__score--improved">
              {Math.round(sessionSummary.healthAfter)}
            </span>
          </div>
        </div>
      </div>

      {/* 改善详情 */}
      {sessionSummary.improvements.length > 0 && (
        <div className="session-summary__improvements">
          <h3>{t('maintenance.summary.improvements', '改善详情')}</h3>
          <div className="improvements-list">
            {sessionSummary.improvements.map((improvement) => (
              <div key={improvement.category} className="improvement-item">
                <span className="improvement-item__category">
                  {t(`maintenance.category.${improvement.category}`, improvement.category)}
                </span>
                <div className="improvement-item__change">
                  <span className="improvement-item__before">{improvement.before}</span>
                  <span className="improvement-item__arrow">→</span>
                  <span className="improvement-item__after">{improvement.after}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 下一步推荐 */}
      {sessionSummary.nextRecommendation && (
        <div className="session-summary__next">
          <h3>{t('maintenance.summary.nextRecommendation', '建议下一步')}</h3>
          <div className="next-recommendation">
            <p className="next-recommendation__title">
              {sessionSummary.nextRecommendation.title}
            </p>
            <p className="next-recommendation__description">
              {sessionSummary.nextRecommendation.description}
            </p>
            <button
              type="button"
              className="next-recommendation__btn"
              onClick={handleStartRecommended}
            >
              {t('maintenance.summary.startNext', '开始')}
            </button>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="session-summary__actions">
        <button
          type="button"
          className="session-summary__back-btn"
          onClick={handleBackToOverview}
        >
          {t('maintenance.summary.backToList', '返回完整列表')}
        </button>
      </div>
    </div>
  )
}
