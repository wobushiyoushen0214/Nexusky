import { useTranslation } from 'react-i18next'
import type { VaultHealthSummary } from '@shared/types/ipc'
import './VitalityCard.css'

interface VitalityCardProps {
  health: VaultHealthSummary | null
}

export function VitalityCard({ health }: VitalityCardProps) {
  const { t } = useTranslation()

  if (!health) {
    return (
      <div className="vitality-card vitality-card--loading">
        <p>{t('overviewPage.vitality.scanning')}</p>
      </div>
    )
  }

  const score = health.score
  const relativeRank = health.relativeRank ? parseInt(health.relativeRank) : 50
  const growth = health.growth

  const scoreColor = score >= 80 ? 'good' : score >= 60 ? 'medium' : 'needs-attention'

  return (
    <div className={`vitality-card vitality-card--${scoreColor}`}>
      <div className="vitality-card__header">
        <h3>{t('overviewPage.vitality.title')}</h3>
        <span className="vitality-card__badge">{t('overviewPage.vitality.badge')}</span>
      </div>

      <div className="vitality-card__score">
        <div className="vitality-card__score-value">{score}</div>
        <div className="vitality-card__score-label">
          <span>{t('overviewPage.vitality.rank', { percent: relativeRank })}</span>
          {growth && growth.healthScoreChange !== 0 && (
            <span className={`vitality-card__trend vitality-card__trend--${growth.healthScoreChange > 0 ? 'up' : 'down'}`}>
              {growth.healthScoreChange > 0 ? '↑' : '↓'} {Math.abs(growth.healthScoreChange)}
            </span>
          )}
        </div>
      </div>

      {growth && (growth.newLinksThisWeek > 0 || growth.orphansReducedThisWeek > 0) && (
        <div className="vitality-card__growth">
          <p className="vitality-card__growth-title">{t('overviewPage.vitality.thisWeek')}</p>
          <div className="vitality-card__growth-stats">
            {growth.newLinksThisWeek > 0 && (
              <span>+{growth.newLinksThisWeek} {t('overviewPage.vitality.newLinks')}</span>
            )}
            {growth.orphansReducedThisWeek > 0 && (
              <span>-{growth.orphansReducedThisWeek} {t('overviewPage.vitality.orphansReduced')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
